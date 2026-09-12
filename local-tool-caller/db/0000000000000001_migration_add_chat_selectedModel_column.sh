cd "$(dirname "$0")"
DB_NAME="data.db"

set -e

sqlite3 -bail "$DB_NAME" << 'EOF'
BEGIN TRANSACTION;

ALTER TABLE chats ADD COLUMN selectedModel TEXT NOT NULL DEFAULT 'openrouter/free';

COMMIT;
EOF
