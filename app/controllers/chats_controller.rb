require "yaml"

class ChatsController < Jetski::BaseController
  route :index, root: true
  route :delete_chat, path: "/chat-delete", request_method: "POST"
  route :destroy_all, path: "/chats-delete-all", request_method: "POST"
  route :update_image_mode, path: "/chat-image-mode", request_method: "POST"

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
    return render plain: "", status: 404 unless chat

    enabled = params[:image_mode].to_s == "1" ? 1 : 0
    Chat.patch(chat.id, image_mode: enabled)
    render plain: "", status: 204
  end

  private

  def welcome_messages
    @welcome_messages ||= Array(YAML.load_file(
      File.expand_path("../assets/welcome_messages.yml", __dir__)
    ))
  end

  def destroy_record(record)
    return record.destroy! if record.respond_to?(:destroy!)
    return record.destroy if record.respond_to?(:destroy)
    return record.delete if record.respond_to?(:delete)

    nil
  end
end
