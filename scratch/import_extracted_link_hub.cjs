/**
 * extracted_ids.txt içindeki Discord ID’lerini toplu senkronize eder (paneldeki profil güncelleme ile aynı mantık).
 *
 * Ortam: EXTRACTED_IDS_PATH, DISCORD_SYNC_CONCURRENCY, DISCORD_BOT_TOKEN
 * Kullanım: node scratch/import_extracted_link_hub.cjs
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../lib/db-adapter.cjs');
const { bulkSyncDiscordUsers } = require('../lib/sync-discord-user.cjs');

const IDS_FILE =
  process.env.EXTRACTED_IDS_PATH ||
  path.join('C:', 'Users', 'cebin', 'Desktop', 'Mesajlar', 'extracted_ids.txt');

function parseSnowflakes(content) {
  const out = new Set();
  for (const line of String(content).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d{17,22}$/.test(t)) out.add(t);
  }
  return [...out];
}

async function repairPgSequences() {
  if (!db.USE_PG) return;
  for (const table of ['connections', 'logs']) {
    await db.run(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
    );
  }
}

async function main() {
  db.init();

  if (!process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN === 'YOUR_TOKEN_HERE') {
    console.error('DISCORD_BOT_TOKEN .env içinde tanımlı değil.');
    process.exit(1);
  }

  if (!fs.existsSync(IDS_FILE)) {
    console.error('Dosya bulunamadı:', IDS_FILE);
    process.exit(1);
  }

  await repairPgSequences();

  const raw = fs.readFileSync(IDS_FILE, 'utf8');
  const fileIds = [...new Set(parseSnowflakes(raw))];

  const concParsed = parseInt(process.env.DISCORD_SYNC_CONCURRENCY || '', 10);
  const concurrencyArg = Number.isFinite(concParsed) ? concParsed : undefined;

  const bulkRows = await bulkSyncDiscordUsers(fileIds, { concurrency: concurrencyArg });
  let discordSynced = 0;
  let syncFailed = 0;
  const failedIds = [];
  for (const row of bulkRows) {
    if (row.ok) discordSynced++;
    else {
      syncFailed++;
      const err = row.error;
      const code = err?.response?.status === 404 ? '404' : String(err?.message || err || '');
      if (failedIds.length < 30) failedIds.push({ id: row.id, error: code });
    }
  }

  await repairPgSequences();

  console.log(
    JSON.stringify(
      {
        idsInFile: fileIds.length,
        discordSynced,
        syncFailed,
        listFile: IDS_FILE,
        concurrency: concurrencyArg ?? `(env DISCORD_SYNC_CONCURRENCY, default PG ${db.USE_PG ? 12 : 1})`,
        failedSample: failedIds,
      },
      null,
      2,
    ),
  );

  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
