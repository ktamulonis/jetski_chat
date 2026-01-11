class ChatsController < Jetski::BaseController
  def index
    @root = true
    @chats = Chat.all
  end

  def show
    @chat = Chat.find(params[:id])
    @messages = @chat.messages
  end

  def new
    @chat = Chat.new
  end

  def create
    @chat = Chat.create(title: params[:title])
    redirect_to "/chats/#{@chat.id}"
  end
end

