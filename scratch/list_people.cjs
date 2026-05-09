const sqlite3 = require('better-sqlite3');
const db = new sqlite3('nexus.db');
const rows = db.prepare('SELECT id, username, display_name FROM people').all();
console.log(JSON.stringify(rows, null, 2));
