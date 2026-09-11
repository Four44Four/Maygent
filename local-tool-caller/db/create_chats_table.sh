cd "$(dirname "$0")"
sqlite3 ./data.db "CREATE TABLE IF NOT EXISTS chats (
  id INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK(length(name) <= 25),
  systemPrompt TEXT NOT NULL,
  currentDirectory TEXT
)"
