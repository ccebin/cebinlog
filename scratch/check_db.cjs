const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'nexus.db'));

try {
    const peopleCount = db.prepare('SELECT COUNT(*) as count FROM people').get();
    const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const logsCount = db.prepare('SELECT COUNT(*) as count FROM logs').get();
    console.log(JSON.stringify({ people: peopleCount.count, users: usersCount.count, logs: logsCount.count }));
} catch (e) {
    console.error(e.message);
}
db.close();
