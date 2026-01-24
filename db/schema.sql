CREATE TABLE chats (
  created_at datetime,
  updated_at datetime,
  id integer,
  title varchar(255)
, image_mode integer DEFAULT 0);
CREATE TABLE messages (
  created_at datetime,
  updated_at datetime,
  id integer,
  chat_id integer,
  role varchar(255),
  content text,
  iterations_total integer DEFAULT 1,
  iterations_completed integer DEFAULT 0
);
