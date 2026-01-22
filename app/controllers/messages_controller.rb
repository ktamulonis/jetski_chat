class MessagesController < Jetski::BaseController
  def create
    chat = Chat.find(params[:chat_id])

    Message.create(
      chat_id: chat.id,
      role: "user",
      content: params[:content]
    )

    if params[:image_mode].to_s == "1"
      Thread.new { Message.call_ollama_image(chat.id, params[:content].to_s) }
    else
      Thread.new { Message.call_ollama(chat.id) }
    end
    Thread.new { Message.generate_title(chat.id) }

    redirect_to "/chats/#{chat.id}"
  end
end
