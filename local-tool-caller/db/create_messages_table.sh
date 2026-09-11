cd "$(dirname "$0")"
sqlite3 ./data.db "CREATE TABLE IF NOT EXISTS messages (
  id INTEGER NOT NULL PRIMARY KEY,
  chatId INTEGER REFERENCES chats(id),
  position INTEGER NOT NULL,
  content TEXT,
  role TEXT CHECK(role IN ('assistant', 'user', 'tool', 'system')),
  toolCallId TEXT,
  toolCallName TEXT,
  toolCalls TEXT CHECK(toolCalls IS NULL OR json_valid(toolCalls))
)"
