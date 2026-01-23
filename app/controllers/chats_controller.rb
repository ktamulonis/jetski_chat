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

    frame_paths = []
    images = []

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
        frame_paths << path
      end

      return render_text("No images found", 422) if frame_paths.empty?

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
      cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_path,
        "-vf",
        "fps=#{fps},scale=960:-1:flags=lanczos",
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

  def destroy_record(record)
    return record.destroy! if record.respond_to?(:destroy!)
    return record.destroy if record.respond_to?(:destroy)
    return record.delete if record.respond_to?(:delete)

    nil
  end
end
