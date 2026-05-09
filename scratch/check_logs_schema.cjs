const db = require('better-sqlite3')('nexus.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'logs'").get();
console.log(schema.sql);
const users = db.prepare("SELECT id, username FROM users LIMIT 5").all();
console.log('Sample Users:', users);
