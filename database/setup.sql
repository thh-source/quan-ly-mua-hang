CREATE TABLE IF NOT EXISTS app_state (
 id TEXT PRIMARY KEY NOT NULL,
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 version INTEGER DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 file_name TEXT NOT NULL,
 object_key TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_links (
 token TEXT PRIMARY KEY NOT NULL,
 label TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 last_viewed_at TEXT,
 view_count INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY NOT NULL,
 username TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 role TEXT NOT NULL,
 active INTEGER DEFAULT 1 NOT NULL,
 must_change_password INTEGER DEFAULT 0 NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS files_entity_idx ON files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS share_links_expires_idx ON share_links(expires_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
