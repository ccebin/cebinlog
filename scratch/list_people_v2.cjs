const sqlite3 = require('better-sqlite3');
const db = new sqlite3('nexus.db');
const rows = db.prepare('SELECT id, username, guilds FROM people').all();
console.log(JSON.stringify(rows, null, 2));
