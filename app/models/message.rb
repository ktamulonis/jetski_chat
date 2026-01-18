require "net/http"
require "json"

class Message < Jetski::Model
  DEFAULT_CHAT_TITLES = ["New Chat", "Untitled"].freeze
  TITLE_MIN_USER_CHARS = 30
  TITLE_MIN_TOTAL_CHARS = 120
  TITLE_MIN_USER_MESSAGES = 2

  def self.call_ollama(chat_id)
    chat = Chat.find(chat_id)
    uri = URI("http://localhost:11434/api/chat")

    messages = chat.messages.map { |m| { role: m.role, content: m.content } }

    assistant = Message.create(
      chat_id: chat.id,
      role: "assistant",
      content: ""
    )

    Net::HTTP.start(uri.host, uri.port) do |http|
      req = Net::HTTP::Post.new(uri)
      req["Content-Type"] = "application/json"
      req.body = {
        model: "llama3.2",
        messages: messages,
        stream: true
      }.to_json

      http.request(req) do |res|
        res.read_body do |chunk|
          next if chunk.strip.empty?
          json = JSON.parse(chunk) rescue nil
          next unless json

          delta = json.dig("message", "content")
          next unless delta

          # This triggers Jetski::Model.append -> patch -> Stream.broadcast
          assistant.append(:content, delta)
        end
      end
    end

    Thread.new { generate_title(chat.id) }
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
    title = payload.dig("message", "content").to_s.strip
    title = title.gsub(/\s+/, " ").gsub(/\A["'`]+|["'`]+\z/, "")
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
end
