require "net/http"
require "json"

class MessagesController < Jetski::BaseController
  def create
    chat = Chat.find(params[:chat_id])

    Message.create(
      chat_id: chat.id,
      role: "user",
      content: params[:content]
    )

    Thread.new { call_ollama(chat.id) }

    redirect_to "/chats/#{chat.id}"
  end

  private

  def call_ollama(chat_id)
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
  end
end

