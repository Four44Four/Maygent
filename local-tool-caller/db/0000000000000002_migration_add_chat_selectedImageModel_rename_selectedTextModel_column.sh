cd "$(dirname "$0")"
DB_NAME="data.db"

set -e

sqlite3 -bail "$DB_NAME" << 'EOF'
BEGIN TRANSACTION;

ALTER TABLE chats RENAME COLUMN selectedModel TO selectedTextModel;
ALTER TABLE chats ADD COLUMN selectedImageModel TEXT NOT NULL DEFAULT 'openrouter/free';

COMMIT;
EOF
