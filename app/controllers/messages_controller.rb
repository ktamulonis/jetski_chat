require "timeout"

class MessagesController < Jetski::BaseController
  route :delete, path: "/message-delete", request_method: "POST"
  route :cancel_iterations, path: "/iterations-cancel", request_method: "POST"

  def create
    Chat.ensure_image_mode_column!
    chat = Chat.find(params[:chat_id])
    content = params[:content].to_s
    user_message = Message.create(
      chat_id: chat.id,
      role: "user",
      content: content
    )

    has_image_mode = Chat.attributes.include?("image_mode")
    image_mode_param = params[:image_mode]
    if !image_mode_param.nil? && image_mode_param.to_s != "" && has_image_mode
      next_mode = image_mode_param.to_s == "1" ? 1 : 0
      warn "Image mode submit chat=#{chat.id} param=#{image_mode_param.inspect} next=#{next_mode}"
      Chat.patch(chat.id, image_mode: next_mode)
    end
    image_mode =
      if image_mode_param.nil? || image_mode_param.to_s == ""
        has_image_mode ? chat.image_mode : "0"
      else
        image_mode_param
      end

    iterations_param = params[:iterations_value]
    iterations_param = params[:iterations] if iterations_param.nil? || iterations_param.to_s == ""
    iterations = iterations_param.to_i
    iterations = 1 if iterations < 1
    iterations = 9 if iterations > 9
    supports_iterations =
      Message.attributes.include?("iterations_total") &&
      Message.attributes.include?("iterations_completed")
    if supports_iterations
      Message.patch(user_message.id, iterations_total: iterations, iterations_completed: 0)
    end

    base_messages = Message.all.select { |message| message.chat_id == chat.id }
      .reject { |message| message.role == "assistant" && message.content.to_s.strip == "" }
      .map { |message| { role: message.role, content: message.content } }

    assistants = Array.new(iterations) do
      Message.create(
        chat_id: chat.id,
        role: "assistant",
        content: ""
      )
    end

    Thread.new do
      Message.reset_iterations(chat.id)
      completed = 0
      assistants.each_with_index do |assistant, index|
        break if Message.iterations_cancelled?(chat.id)
        begin
          if image_mode.to_s == "1"
            warn "Iteration #{index + 1}/#{iterations} image start chat=#{chat.id}"
            Timeout.timeout(240) do
              Message.call_ollama_image(chat.id, content, assistant: assistant)
            end
          else
            warn "Iteration #{index + 1}/#{iterations} text start chat=#{chat.id}"
            Timeout.timeout(240) do
              Message.call_ollama(chat.id, messages: base_messages, assistant: assistant)
            end
          end
          warn "Iteration #{index + 1}/#{iterations} complete chat=#{chat.id}"
        rescue StandardError => error
          warn "Iteration #{index + 1} failed: #{error.class}: #{error.message}"
          assistant.patch(content: "Iteration failed.") if assistant.content.to_s.strip == ""
        ensure
          completed += 1
          if supports_iterations
            Message.patch(user_message.id, iterations_completed: completed)
          end
        end
      end
    end
    Thread.new { Message.generate_title(chat.id) }

    redirect_to "/chats/#{chat.id}"
  end

  def delete
    message = Message.find(params[:message_id])
    return render text: "", status: 404 unless message

    destroy_record(message)
    render text: "", status: 204
  end

  def cancel_iterations
    chat = Chat.find(params[:chat_id])
    return render text: "", status: 404 unless chat

    Message.cancel_iterations(chat.id)
    render text: "", status: 204
  end

  private

  def destroy_record(record)
    return record.destroy! if record.respond_to?(:destroy!)
    return record.destroy if record.respond_to?(:destroy)
    return record.delete if record.respond_to?(:delete)

    nil
  end
end
