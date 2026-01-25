require "net/http"
require "json"
require "timeout"

class Message < Jetski::Model
  attributes :chat_id, :role, content: :text,
    iterations_total: :integer, iterations_completed: :integer
  DEFAULT_CHAT_TITLES = ["New Chat", "Untitled"].freeze
  TITLE_MIN_USER_CHARS = 30
  TITLE_MIN_TOTAL_CHARS = 120
  TITLE_MIN_USER_MESSAGES = 2
  @@iteration_cancellations = {}

  def self.cancel_iterations(chat_id)
    @@iteration_cancellations[chat_id.to_s] = true
  end

  def self.reset_iterations(chat_id)
    @@iteration_cancellations.delete(chat_id.to_s)
  end

  def self.iterations_cancelled?(chat_id)
    @@iteration_cancellations[chat_id.to_s] == true
  end

  def self.call_ollama(chat_id, messages: nil, assistant: nil)
    chat = Chat.find(chat_id)
    uri = URI("http://localhost:11434/api/chat")

    payload_messages = Array(messages || chat.messages).map do |message|
      if message.respond_to?(:role)
        { role: message.role, content: message.content }
      else
        { role: message[:role] || message["role"], content: message[:content] || message["content"] }
      end
    end

    assistant ||= Message.create(
      chat_id: chat.id,
      role: "assistant",
      content: ""
    )

    delta_count = 0
    parse_objects = lambda do |text|
      objects = []
      text.each_line do |line|
        line = line.strip
        next if line == ""
        begin
          objects << JSON.parse(line)
          next
        rescue JSON::ParserError
        end

        parts = line.split(/}\s*{/)
        next if parts.length <= 1
        parts.each do |part|
          json_str = part
          json_str = "{#{json_str}" unless json_str.start_with?("{")
          json_str = "#{json_str}}" unless json_str.end_with?("}")
          begin
            objects << JSON.parse(json_str)
          rescue JSON::ParserError
            next
          end
        end
      end
      objects
    end
    Net::HTTP.start(uri.host, uri.port) do |http|
      http.open_timeout = 10
      http.read_timeout = 120
      http.write_timeout = 10 if http.respond_to?(:write_timeout=)
      req = Net::HTTP::Post.new(uri)
      req["Content-Type"] = "application/json"
      req.body = {
        model: "llama3.2",
        messages: payload_messages,
        stream: true
      }.to_json

      http.request(req) do |res|
        buffer = +""
        done = false
        res.read_body do |chunk|
          next if chunk.strip.empty?
          buffer << chunk
          lines = buffer.split("\n")
          buffer = lines.pop || ""
          parse_objects.call(lines.join("\n")).each do |json|
            delta = json.dig("message", "content")
            if delta
              # Ensure append hits the persisted record for streaming.
              Message.append(assistant.id, :content, delta)
              delta_count += 1
            end
            if json["done"] == true
              done = true
              break
            end
          end
          break if done
        end

        if !done && buffer.strip != ""
          parse_objects.call(buffer).each do |json|
            delta = json.dig("message", "content")
            if delta
              Message.append(assistant.id, :content, delta)
              delta_count += 1
            end
          end
        end
      end
    end

    if delta_count == 0
      warn "Ollama chat returned no deltas chat=#{chat.id}, retrying non-stream"
      fallback_req = Net::HTTP::Post.new(uri)
      fallback_req["Content-Type"] = "application/json"
      fallback_req.body = {
        model: "llama3.2",
        messages: payload_messages,
        stream: false
      }.to_json
      fallback_res = Net::HTTP.start(uri.host, uri.port) do |http|
        http.open_timeout = 10
        http.read_timeout = 120
        http.write_timeout = 10 if http.respond_to?(:write_timeout=)
        http.request(fallback_req)
      end
      payload = JSON.parse(fallback_res.body.to_s) rescue {}
      fallback_text = payload.dig("message", "content") || payload["response"]
      if fallback_text.to_s.strip != ""
        assistant.patch(content: fallback_text)
      else
        assistant.patch(content: "No response received.") if assistant&.content.to_s.strip == ""
      end
    end
    Thread.new { generate_title(chat.id) }
  rescue Timeout::Error
    assistant.patch(content: "Request timed out.") if assistant&.content.to_s.strip == ""
    raise
  end

  def self.call_ollama_image(chat_id, prompt, assistant: nil)
    chat = Chat.find(chat_id)
    uri = URI("http://localhost:11434/api/generate")

    assistant ||= Message.create(
      chat_id: chat.id,
      role: "assistant",
      content: "Generating image..."
    )
    if assistant.content.to_s.strip == ""
      assistant.patch(content: "Generating image...")
    end
    warn "Ollama image start chat=#{chat.id} prompt=#{prompt.to_s[0, 120].inspect}"

    req = Net::HTTP::Post.new(uri)
    req["Content-Type"] = "application/json"
    req.body = {
      model: "jmorgan/z-image-turbo:fp8",
#      model: "jmorgan/z-image-turbo:latest",
      prompt: prompt.to_s,
      stream: false
    }.to_json

    payload = {}
    image_b64 = ""
    last_progress = ""
    buffer = +""
    line_count = 0
    raw_body = nil

    parse_objects = lambda do |text|
      objects = []
      text.each_line do |line|
        line = line.strip
        next if line == ""
        begin
          objects << JSON.parse(line)
          next
        rescue JSON::ParserError
        end

        parts = line.split(/}\s*{/)
        next if parts.length <= 1
        parts.each_with_index do |part, index|
          json_str = part
          json_str = "{#{json_str}" unless json_str.start_with?("{")
          json_str = "#{json_str}}" unless json_str.end_with?("}")
          begin
            objects << JSON.parse(json_str)
          rescue JSON::ParserError
            next
          end
        end
      end
      objects
    end

    apply_payload = lambda do |json|
      payload = json
      image_b64 = json["images"]&.first.to_s if image_b64 == "" && json["images"]&.first
      image_b64 = json["image"].to_s if image_b64 == "" && json["image"]
      image_b64 = json["response"].to_s if image_b64 == "" && json["response"]
      completed = json["completed"]
      total = json["total"]
      if completed && total
        progress = "Generating image... (#{completed}/#{total})"
        unless progress == last_progress
          last_progress = progress
          assistant.patch(content: progress)
        end
      end
    end

    Net::HTTP.start(uri.host, uri.port) do |http|
      http.open_timeout = 10
      http.read_timeout = 180
      http.write_timeout = 10 if http.respond_to?(:write_timeout=)
      http.request(req) do |res|
        warn "Ollama image response status=#{res.code} content_type=#{res['Content-Type']}"
        res.read_body do |chunk|
          next if chunk.strip.empty?
          buffer << chunk
          lines = buffer.split("\n")
          buffer = lines.pop || ""
          lines.each do |line|
            parse_objects.call(line).each do |json|
              line_count += 1
              apply_payload.call(json)
            end
          end
        end

        raw_body = res.body
      end
    end

    unless buffer.strip.empty?
      parse_objects.call(buffer).each do |json|
        line_count += 1
        apply_payload.call(json)
      end
    end

    if line_count == 0 && raw_body.to_s.strip != ""
      parse_objects.call(raw_body.to_s).each do |json|
        line_count += 1
        apply_payload.call(json)
      end
    end

    image_b64 = image_b64.to_s.strip

    if image_b64 == ""
      warn "Ollama image generation missing image payload keys: #{payload.keys.inspect}"
      warn "Ollama image generation last payload: #{payload.inspect[0, 600]}"
      warn "Ollama image generation lines processed: #{line_count}"
      warn "Ollama image generation raw body length: #{raw_body.to_s.length}"
      warn "Ollama image generation raw body preview: #{raw_body.to_s[0, 400].inspect}"
      assistant.patch(content: "Image generation failed.")
      return
    end

    data_url = if image_b64.start_with?("data:image")
      image_b64
    else
      "data:image/png;base64,#{image_b64}"
    end

    warn "Ollama image complete chat=#{chat.id} bytes=#{image_b64.length}"
    assistant.patch(content: "![Generated image](#{data_url})")
  rescue StandardError
    warn "Ollama image generation error: #{$!.class}: #{$!.message}"
    assistant.patch(content: "Image generation failed.")
  end

  def self.generate_title(chat_id)
    chat = Chat.find(chat_id)
    return unless DEFAULT_CHAT_TITLES.include?(chat.title.to_s.strip)

    user_messages = chat.messages.select { |m| m.role == "user" }
    return if user_messages.length < TITLE_MIN_USER_MESSAGES

    combined = user_messages.map { |m| m.content.to_s.strip }.join(" ")
    return unless context_ready?(combined, user_messages, chat.messages)

    uri = URI("http://localhost:11434/api/chat")
    messages = chat.messages.map { |m| { role: m.role, content: m.content } }
    prompt = {
      role: "system",
      content: "Summarize this chat into a catchy 3-6 word title. " \
        "Return only the title with no quotes or punctuation."
    }
    messages = [prompt] + messages

    req = Net::HTTP::Post.new(uri)
    req["Content-Type"] = "application/json"
    req.body = {
      model: "llama3.2",
      messages: messages,
      stream: false
    }.to_json

    res = Net::HTTP.start(uri.host, uri.port) { |http| http.request(req) }
    payload = JSON.parse(res.body) rescue {}
    raw_title = payload.dig("message", "content") || payload["response"]
    title = raw_title.to_s.strip
    title = title.gsub(/\s+/, " ").gsub(/\A["'`]+|["'`]+\z/, "")
    title = fallback_title(user_messages) if title == ""
    return if title == "" || title.length > 80

    chat = Chat.find(chat_id)
    return unless DEFAULT_CHAT_TITLES.include?(chat.title.to_s.strip)

    Chat.patch(chat.id, title: title)
  end

  def self.context_ready?(combined, user_messages, all_messages)
    total_length = all_messages.map { |m| m.content.to_s.strip }.join(" ").length
    user_length = combined.length
    return false if user_length < 8
    return false if user_length < TITLE_MIN_USER_CHARS && total_length < TITLE_MIN_TOTAL_CHARS

    short_greeting = /\A(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|how are you|what's up)\b/i
    all_small_talk = user_messages.all? do |message|
      text = message.content.to_s.strip
      text.length <= 20 && text.match?(short_greeting)
    end

    return false if all_small_talk && user_length < TITLE_MIN_USER_CHARS

    true
  end

  def self.fallback_title(user_messages)
    first = user_messages.first&.content.to_s.strip
    return "" if first == ""

    first = first.gsub(/\s+/, " ")
    if first.length > 60
      first = "#{first[0, 57]}..."
    end
    first
  end
end
