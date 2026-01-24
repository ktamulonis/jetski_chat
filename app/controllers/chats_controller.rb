require "yaml"
require "base64"
require "json"
require "open3"
require "tmpdir"

class ChatsController < Jetski::BaseController
  route :index, root: true
  route :delete_chat, path: "/chat-delete", request_method: "POST"
  route :destroy_all, path: "/chats-delete-all", request_method: "POST"
  route :update_image_mode, path: "/chat-image-mode", request_method: "POST"
  route :gallery_gif, path: "/gallery-gif", request_method: "POST"

  def index
    @chats = Chat.all
    @welcome_messages = welcome_messages
    @welcome_message = @welcome_messages.sample || "What can I help you with today?"
  end

  def show
    @chat = Chat.find(params[:id])
    @messages = @chat.messages
    @chats = Chat.all
  end

  def new
    @chat = Chat.new
  end

  def create
    title_param = params[:title].to_s.strip
    title = title_param == "" ? "New Chat" : title_param
    @chat = Chat.create(title: title)
    welcome_message = params[:welcome_message].to_s.strip
    if welcome_message != ""
      Message.create(
        chat_id: @chat.id,
        role: "assistant",
        content: welcome_message
      )
    end
    content = params[:content].to_s.strip
    if content != ""
      Message.create(
        chat_id: @chat.id,
        role: "user",
        content: content
      )
      Thread.new { Message.call_ollama(@chat.id) }
      Thread.new { Message.generate_title(@chat.id) }
    end
    redirect_to "/chats/#{@chat.id}"
  end

  def destroy
    chat = Chat.find(params[:id])
    return redirect_to("/") unless chat
    Array(chat.messages).each { |message| destroy_record(message) }
    destroy_record(chat)
    redirect_to "/"
  end

  def delete_chat
    chat = Chat.find(params[:chat_id])
    return redirect_to("/") unless chat
    Array(chat.messages).each { |message| destroy_record(message) }
    destroy_record(chat)
    redirect_to "/"
  end

  def destroy_all
    Chat.all.each do |chat|
      Array(chat.messages).each { |message| destroy_record(message) }
      destroy_record(chat)
    end
    redirect_to "/"
  end

  def update_image_mode
    chat = Chat.find(params[:chat_id])
    return render text: "", status: 404 unless chat

    enabled = params[:image_mode].to_s == "1" ? 1 : 0
    Chat.patch(chat.id, image_mode: enabled)
    render text: "", status: 204
  end

  def gallery_gif
    chat = Chat.find(params[:chat_id])
    return render_text("", 404) unless chat

    payload = JSON.parse(params[:payload].to_s) rescue {}
    message_ids = Array(payload["message_ids"]).map(&:to_s)
    interval = payload["interval"].to_f
    interval = 2.0 if interval <= 0
    transparent = payload["transparent"].to_s == "1"
    key_color = payload["key_color"].to_s
    key_auto = payload["key_auto"].to_s == "1"
    key_colors = Array(payload["key_colors"]).map { |c| normalize_key_color(c) }.compact
    key_tolerance = payload["key_tolerance"].to_f
    key_tolerance = 0.2 if key_tolerance <= 0

    frame_paths = []
    images = []
    applied_count = 0
    last_colorkey_error = nil

    if message_ids.empty?
      messages = Array(chat.messages).select { |m| m.role == "assistant" }
    else
      message_map = Array(chat.messages).each_with_object({}) do |message, memo|
        memo[message.id.to_s] = message
      end
      messages = message_ids.map { |id| message_map[id] }.compact
    end

    messages.each do |message|
      match = message.content.to_s.match(/\A!\[[^\]]*\]\((data:image\/[^)]+)\)\z/)
      next unless match
      images << match[1]
    end

    Dir.mktmpdir("jetski-gallery-") do |dir|
      images.each_with_index do |data_url, index|
        match = data_url.match(/\Adata:(image\/[a-zA-Z0-9.+-]+);base64,(.+)\z/m)
        next unless match
        mime = match[1]
        ext = mime.split("/").last.to_s
        ext = "jpg" if ext == "jpeg"
        filename = format("frame_%05d.%s", index, ext)
        path = File.join(dir, filename)
        File.binwrite(path, Base64.decode64(match[2]))
        if transparent
          output_path = File.join(dir, format("frame_%05d_alpha.png", index))
          if key_auto && rembg_available?
            status, message = run_rembg(path, output_path)
            if status == :ok
              frame_paths << output_path
              applied_count += 1
            elsif status == :missing
              warn "rembg missing; falling back to colorkey"
            else
              warn "rembg error: #{message}"
            end
          end

          if frame_paths.length <= index
            colors = key_colors
            if colors.empty?
              if key_auto
                colors = sample_key_colors(path)
              else
                colors = [normalize_key_color(key_color)].compact
              end
            end
            if colors.any?
              ok, err = apply_colorkey(path, output_path, colors, key_tolerance)
              if ok && File.exist?(output_path)
                frame_paths << output_path
                applied_count += 1
              else
                last_colorkey_error = err
                warn "ffmpeg colorkey failed for #{path}: #{err}"
                frame_paths << path
              end
            else
              frame_paths << path
            end
          end
        else
          frame_paths << path
        end
      end

      return render_text("No images found", 422) if frame_paths.empty?
      if transparent && applied_count == 0
        warn "No transparency applied; last error: #{last_colorkey_error}"
        detail = "No transparency applied. Try more colors or increase tolerance."
        detail += " (colors=#{key_colors.length} auto=#{key_auto})"
        detail += " ffmpeg=#{last_colorkey_error.to_s.strip[0, 160]}" if last_colorkey_error && last_colorkey_error != ""
        return render_text(detail, 422)
      end

      list_path = File.join(dir, "list.txt")
      File.open(list_path, "w") do |file|
        frame_paths.each do |path|
          file.puts "file '#{path}'"
          file.puts "duration #{interval}"
        end
        file.puts "file '#{frame_paths.last}'"
      end

      fps = (1.0 / interval).clamp(0.1, 60.0)
      output_path = File.join(dir, "gallery.gif")
      filter = [
        "fps=#{fps}",
        "scale=960:-1:flags=lanczos",
        "split[s0][s1]",
        "[s0]palettegen=reserve_transparent=1[p]",
        "[s1][p]paletteuse"
      ].join(",")
      cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_path,
        "-filter_complex",
        filter,
        "-loop",
        "0",
        output_path
      ]

      _out, err, status = Open3.capture3(*cmd)
      unless status.success? && File.exist?(output_path)
        warn "Gallery GIF ffmpeg error: #{err}"
        return render_text("GIF export failed", 500)
      end

      res.status = 200
      res.content_type = "image/gif"
      res["Content-Disposition"] = "attachment; filename=\"chat-#{chat.id}-gallery.gif\""
      res.body = File.binread(output_path)
      @performed_render = true
    end
  end

  private

  def welcome_messages
    @welcome_messages ||= Array(YAML.load_file(
      File.expand_path("../assets/welcome_messages.yml", __dir__)
    ))
  end

  def render_text(text, status)
    res.status = status
    res.content_type = "text/plain"
    res.body = "#{text}\n"
    @performed_render = true
  end

  def run_rembg(input_path, output_path)
    commands = [
      ["rembg", "i", input_path.to_s, output_path.to_s],
      ["python3", "-m", "rembg", "i", input_path.to_s, output_path.to_s]
    ]

    commands.each do |cmd|
      next unless system("which", cmd.first, out: File::NULL, err: File::NULL)
      out, err, status = Open3.capture3(*cmd)
      return [:ok, nil] if status.success?
      message = [err.to_s, out.to_s].join("\n").strip
      return [:missing, message] if message.include?("No module named")
      return [:error, message]
    end

    [:missing, "rembg not found in PATH"]
  end

  def rembg_available?
    system("which", "rembg", out: File::NULL, err: File::NULL) ||
      system("which", "python3", out: File::NULL, err: File::NULL)
  end

  def normalize_key_color(value)
    hex = value.to_s.delete_prefix("#")
    return nil unless hex.match?(/\A[0-9a-fA-F]{6}\z/)
    "0x#{hex.upcase}"
  end

  def image_dimensions(input_path)
    cmd = [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      input_path.to_s
    ]
    out, _err, status = Open3.capture3(*cmd)
    return nil unless status.success? && out.to_s.include?("x")
    width, height = out.to_s.strip.split("x").map(&:to_i)
    return nil if width.to_i <= 0 || height.to_i <= 0
    [width, height]
  end

  def sample_key_color_at(input_path, x, y)
    cmd = [
      "ffmpeg",
      "-v",
      "error",
      "-i",
      input_path.to_s,
      "-vf",
      "crop=1:1:#{x}:#{y},format=rgb24",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-"
    ]
    out, _err, status = Open3.capture3(*cmd)
    return nil unless status.success? && out && out.bytesize >= 3
    r, g, b = out.bytes[0, 3]
    format("0x%02X%02X%02X", r, g, b)
  end

  def sample_key_colors(input_path)
    dims = image_dimensions(input_path)
    return [] unless dims
    width, height = dims
    mid_x = (width / 2).to_i
    mid_y = (height / 2).to_i
    points = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [mid_x, 0],
      [mid_x, height - 1],
      [0, mid_y],
      [width - 1, mid_y]
    ]
    points.map { |x, y| sample_key_color_at(input_path, x, y) }.compact.uniq
  end

  def apply_colorkey(input_path, output_path, key_colors, tolerance)
    colors = Array(key_colors).compact
    return [false, "missing key colors"] if colors.empty?
    tol = tolerance.to_f
    tol = 0.2 if tol <= 0
    filter = colors
      .map { |color| "colorkey=#{color}:#{tol}:0.0" }
      .join(",")
    filter = "#{filter},format=rgba"
    cmd = [
      "ffmpeg",
      "-y",
      "-v",
      "error",
      "-i",
      input_path.to_s,
      "-vf",
      filter,
      output_path.to_s
    ]
    _out, err, status = Open3.capture3(*cmd)
    message = err.to_s
    message = message.split("\n").reject do |line|
      line.start_with?("ffmpeg version") || line.start_with?("built with") || line.start_with?("configuration:")
    end.join("\n")
    [status.success?, message.strip]
  end

  def destroy_record(record)
    return record.destroy! if record.respond_to?(:destroy!)
    return record.destroy if record.respond_to?(:destroy)
    return record.delete if record.respond_to?(:delete)

    nil
  end
end
