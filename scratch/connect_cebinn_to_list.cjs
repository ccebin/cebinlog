/**
 * final_person_ids.txt içindeki Discord ID'lerini "cebinn" kişisine
 * Arkadaş bağlantısı olarak ekler.
 *
 * Davranış:
 *  - cebinn'i `people` tablosunda username ya da display_name'den bulur
 *  - Listedeki her ID için `people` tablosunda var mı diye bakar (yoksa atlar)
 *  - cebinn ↔ ID arasında HER İKİ YÖNDE bağlantı varsa atlar (duplicate yok)
 *  - Yoksa: cebinn -> ID yönünde 'Arkadaş' tipi bağlantı ekler
 *
 * Kullanım: node scratch/connect_cebinn_to_list.cjs
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../lib/db-adapter.cjs');
const fc = require('../lib/field-crypto.cjs');

const IDS_FILE =
  process.env.CEBINN_IDS_FILE ||
  path.join('C:', 'Users', 'cebin', 'Desktop', 'final_person_ids.txt');

const CONN_TYPE = process.env.CEBINN_CONN_TYPE || 'Arkadaş';
const CEBINN_USERNAME = process.env.CEBINN_USERNAME || 'cebinn';

function parseSnowflakes(content) {
  const out = new Set();
  for (const line of String(content).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^\d{17,22}$/.test(t)) out.add(t);
  }
  return [...out];
}

async function repairConnSequence() {
  if (!db.USE_PG) return;
  await db.run(
    `SELECT setval(pg_get_serial_sequence('connections', 'id'), COALESCE((SELECT MAX(id) FROM connections), 1))`,
  );
}

async function findCebinn() {
  // 1) Önce username eşleşmesi (case-insensitive)
  let p = await db.get('SELECT id, username, display_name FROM people WHERE LOWER(username) = LOWER(?) LIMIT 1', [
    CEBINN_USERNAME,
  ]);
  if (p) return p;

  // 2) display_name eşleşmesi
  p = await db.get('SELECT id, username, display_name FROM people WHERE LOWER(display_name) = LOWER(?) LIMIT 1', [
    CEBINN_USERNAME,
  ]);
  if (p) return p;

  // 3) Kısmi eşleşme – display_name ya da username içeriyorsa
  p = await db.get(
    'SELECT id, username, display_name FROM people WHERE LOWER(username) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?) LIMIT 5',
    [`%${CEBINN_USERNAME}%`, `%${CEBINN_USERNAME}%`],
  );
  return p;
}

async function main() {
  db.init();

  if (!fs.existsSync(IDS_FILE)) {
    console.error('Dosya bulunamadı:', IDS_FILE);
    process.exit(1);
  }

  const cebinn = await findCebinn();
  if (!cebinn) {
    console.error(`'${CEBINN_USERNAME}' kişisi people tablosunda bulunamadı.`);
    process.exit(1);
  }

  console.log(`[cebinn] id=${cebinn.id} username=${cebinn.username} display_name=${cebinn.display_name}`);

  const raw = fs.readFileSync(IDS_FILE, 'utf8');
  const allIds = parseSnowflakes(raw);
  console.log(`[file] ${allIds.length} benzersiz ID okundu`);

  // Cebinn'i listeden çıkar (kendine bağlanmasın)
  const targetIds = allIds.filter((id) => id !== cebinn.id);

  // people tablosunda var olanları toplu çek
  const existingPeople = await db.all(
    `SELECT id FROM people WHERE id = ANY(?::text[])`,
    [targetIds],
  ).catch(async () => {
    // SQLite fallback – tek tek
    const out = [];
    for (const id of targetIds) {
      const p = await db.get('SELECT id FROM people WHERE id = ?', [id]);
      if (p) out.push(p);
    }
    return out;
  });
  const existingSet = new Set(existingPeople.map((r) => r.id));
  console.log(`[people] listeden ${existingSet.size}/${targetIds.length} kişi veritabanında bulundu`);

  // Cebinn'in mevcut tüm bağlantılarını çek (her iki yön)
  const existingConns = await db.all(
    'SELECT from_id, to_id FROM connections WHERE from_id = ? OR to_id = ?',
    [cebinn.id, cebinn.id],
  );
  const alreadyConnected = new Set();
  for (const c of existingConns) {
    if (c.from_id === cebinn.id) alreadyConnected.add(c.to_id);
    if (c.to_id === cebinn.id) alreadyConnected.add(c.from_id);
  }
  console.log(`[conns] cebinn'in mevcut ${alreadyConnected.size} bağlantısı var`);

  await repairConnSequence();

  const encryptedNote = fc.encryptOptional('') ?? '';

  let added = 0;
  let skippedExisting = 0;
  let skippedMissing = 0;
  const failed = [];

  for (const id of targetIds) {
    if (!existingSet.has(id)) {
      skippedMissing++;
      continue;
    }
    if (alreadyConnected.has(id)) {
      skippedExisting++;
      continue;
    }
    try {
      await db.run(
        'INSERT INTO connections (from_id, to_id, type, note) VALUES (?, ?, ?, ?)',
        [cebinn.id, id, CONN_TYPE, encryptedNote],
      );
      alreadyConnected.add(id);
      added++;
    } catch (e) {
      failed.push({ id, error: String(e?.message || e) });
    }
  }

  await repairConnSequence();

  console.log(
    JSON.stringify(
      {
        cebinnId: cebinn.id,
        idsInFile: allIds.length,
        peopleFound: existingSet.size,
        added,
        skippedExisting,
        skippedMissing,
        failed: failed.length,
        failedSample: failed.slice(0, 10),
        connType: CONN_TYPE,
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
