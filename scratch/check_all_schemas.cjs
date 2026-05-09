const db = require('better-sqlite3')('nexus.db');
const tables = ['people', 'logs', 'users', 'media', 'connections'];
for (const t of tables) {
  const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE name = '${t}'`).get();
  console.log(`--- ${t} ---\n${schema ? schema.sql : 'NOT FOUND'}\n`);
}
