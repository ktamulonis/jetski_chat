class MessagesController < Jetski::BaseController
  route :delete, path: "/message-delete", request_method: "POST"

  def create
    chat = Chat.find(params[:chat_id])

    Message.create(
      chat_id: chat.id,
      role: "user",
      content: params[:content]
    )

    fallback_mode = chat.respond_to?(:image_mode) ? chat.image_mode : "0"
    image_mode_param = params[:image_mode]
    if !image_mode_param.nil? && chat.respond_to?(:image_mode)
      next_mode = image_mode_param.to_s == "1" ? 1 : 0
      Chat.patch(chat.id, image_mode: next_mode)
      fallback_mode = next_mode
    end
    image_mode = image_mode_param.nil? ? fallback_mode : image_mode_param

    if image_mode.to_s == "1"
      Thread.new { Message.call_ollama_image(chat.id, params[:content].to_s) }
    else
      Thread.new { Message.call_ollama(chat.id) }
    end
    Thread.new { Message.generate_title(chat.id) }

    redirect_to "/chats/#{chat.id}"
  end

  def delete
    message = Message.find(params[:message_id])
    return render plain: "", status: 404 unless message

    destroy_record(message)
    render plain: "", status: 204
  end

  private

  def destroy_record(record)
    return record.destroy! if record.respond_to?(:destroy!)
    return record.destroy if record.respond_to?(:destroy)
    return record.delete if record.respond_to?(:delete)

    nil
  end
end
