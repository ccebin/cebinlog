const path = require('path');
const { Pool } = require('pg');

let sqlite = null;
let pool = null;

const USE_PG = !!process.env.DATABASE_URL;

function convertSql(sql) {
  if (!USE_PG) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function all(sql, params = []) {
  const text = convertSql(sql);
  if (USE_PG) {
    const r = await pool.query(text, params);
    return r.rows;
  }
  return sqlite.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] ?? null;
}

async function run(sql, params = []) {
  const text = convertSql(sql);
  if (USE_PG) {
    const r = await pool.query(text, params);
    return {
      changes: r.rowCount ?? 0,
      lastInsertRowid: r.rows[0]?.id,
      rows: r.rows,
    };
  }
  const info = sqlite.prepare(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid, rows: [] };
}

function init() {
  if (USE_PG) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 15,
    });
    console.log('[DB] PostgreSQL (Supabase / DATABASE_URL)');
  } else {
    sqlite = require(path.join(__dirname, '..', 'database.cjs'));
    console.log('[DB] SQLite (yerel nexus.db)');
  }
}

async function close() {
  if (pool) await pool.end();
}

/** Sync transaction — SQLite only (better-sqlite3). */
function sqliteTransaction(fn) {
  if (USE_PG) throw new Error('sqliteTransaction yalnızca SQLite için');
  return sqlite.transaction(fn);
}

/**
 * PostgreSQL import: tek bağlantıda BEGIN … COMMIT.
 * tx.run(sql, params) — async
 */
async function pgImportTx(runBlock) {
  if (!USE_PG) throw new Error('pgImportTx yalnızca PostgreSQL için');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txRun = async (sql, params = []) => {
      const text = convertSql(sql);
      await client.query(text, params);
    };
    await runBlock(txRun);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  init,
  close,
  all,
  get,
  run,
  USE_PG,
  sqliteTransaction,
  pgImportTx,
};
