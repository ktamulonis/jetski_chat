class ChatsController < Jetski::BaseController
  route :index, root: true
  def index
    @chats = Chat.all
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
    redirect_to "/chats/#{@chat.id}"
  end
end

