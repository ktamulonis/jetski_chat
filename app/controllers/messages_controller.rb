require "net/http"
require "json"

class MessagesController < Jetski::BaseController
  def create
    chat = Chat.find(params[:chat_id])

    user_message = Message.create(
      chat_id: chat.id,
      role: "user",
      content: params[:content]
    )

    assistant_text = call_ollama(chat)

    Message.create(
      chat_id: chat.id,
      role: "assistant",
      content: assistant_text
    )

    redirect_to "/chats/#{chat.id}"
  end

  private

  def call_ollama(chat)
    uri = URI("http://localhost:11434/api/chat")

    messages = chat.messages.map do |m|
      { role: m.role, content: m.content }
    end

    response = Net::HTTP.post(
      uri,
      {
        model: "llama3.2",
        messages: messages,
        stream: false
      }.to_json,
      "Content-Type" => "application/json"
    )

    JSON.parse(response.body).dig("message", "content")
  end
end

