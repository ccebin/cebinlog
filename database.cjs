const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'nexus.db'));
db.pragma('foreign_keys = ON');


// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    role TEXT DEFAULT 'user',
    discord_id TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT,
    user_id INTEGER,
    type TEXT,
    content TEXT,
    pinned INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(target_id) REFERENCES people(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT,
    user_id INTEGER,
    url TEXT,
    note TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(target_id) REFERENCES people(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT,
    to_id TEXT,
    type TEXT,
    note TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(from_id) REFERENCES people(id),
    FOREIGN KEY(to_id) REFERENCES people(id)
  );

  CREATE TABLE IF NOT EXISTS banned_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT UNIQUE,
    reason TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN last_ip TEXT"); } catch (e) {}

// Migration for existing databases
try { db.exec("ALTER TABLE people ADD COLUMN real_name TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE people ADD COLUMN location TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE people ADD COLUMN age INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN pinned INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN original_content TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN editor_name TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN editor_id INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN edited_at DATETIME"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN history TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE logs ADD COLUMN is_admin_only INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE people ADD COLUMN is_archived INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE media ADD COLUMN is_deleted INTEGER DEFAULT 0"); } catch (e) {}

// Set initial admin as approved
db.prepare("UPDATE users SET approved = 1 WHERE role = 'admin'").run();

module.exports = db;
