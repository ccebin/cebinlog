const db = require('better-sqlite3')('nexus.db');

const people = db.prepare('SELECT id, guilds FROM people').all();

for (const p of people) {
  if (typeof p.guilds === 'string' && p.guilds.startsWith('"[')) {
    try {
      // It's double encoded if it starts with "[
      const cleaned = JSON.parse(p.guilds);
      db.prepare('UPDATE people SET guilds = ? WHERE id = ?').run(cleaned, p.id);
      console.log(`Cleaned guilds for: ${p.id}`);
    } catch (e) {
      console.error(`Failed to clean ${p.id}:`, e.message);
    }
  }
}

console.log('Cleanup complete.');
