-- Cebin Log — Supabase (PostgreSQL) şeması
-- Dashboard: SQL Editor'de çalıştırın. Sonra .env içine DATABASE_URL ekleyin.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'user',
  discord_id TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_ip TEXT,
  approved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  avatar TEXT,
  banner TEXT,
  decoration TEXT,
  guilds TEXT,
  bio TEXT,
  real_name TEXT,
  location TEXT,
  age INTEGER,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  is_archived INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  target_id TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT,
  content TEXT,
  pinned INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  original_content TEXT,
  editor_name TEXT,
  editor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  history TEXT,
  is_admin_only INTEGER DEFAULT 0,
  FOREIGN KEY (target_id) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  target_id TEXT REFERENCES people(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  url TEXT,
  note TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY,
  from_id TEXT REFERENCES people(id),
  to_id TEXT REFERENCES people(id),
  type TEXT,
  note TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS banned_ips (
  id SERIAL PRIMARY KEY,
  ip TEXT UNIQUE,
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_target ON logs(target_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_media_target ON media(target_id);
CREATE INDEX IF NOT EXISTS idx_people_archived ON people(is_archived);

-- İçe aktarma (import) sonrası otomatik artan id’lerin çakışmaması için (isteğe bağlı):
-- SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users));
-- SELECT setval(pg_get_serial_sequence('logs', 'id'), (SELECT COALESCE(MAX(id), 1) FROM logs));
-- Aynı şekilde media, connections, banned_ips tabloları.
