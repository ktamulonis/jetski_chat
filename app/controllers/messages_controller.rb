class MessagesController < Jetski::BaseController
  def create
    chat = Chat.find(params[:chat_id])

    Message.create(
      chat_id: chat.id,
      role: "user",
      content: params[:content]
    )

    Thread.new { Message.call_ollama(chat.id) }
    Thread.new { Message.generate_title(chat.id) }

    redirect_to "/chats/#{chat.id}"
  end
end
