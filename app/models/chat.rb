require "sqlite3"

class Chat < Jetski::Model
  def self.ensure_image_mode_column!
    return if attributes.include?("image_mode")

    db = SQLite3::Database.new("test.db")
    db.execute("ALTER TABLE chats ADD COLUMN image_mode integer DEFAULT 0")
  rescue SQLite3::SQLException
    nil
  ensure
    db&.close
  end
end
