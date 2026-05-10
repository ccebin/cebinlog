require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const db = require('./lib/db-adapter.cjs');
const secure = require('./lib/secure-fields.cjs');
const fc = require('./lib/field-crypto.cjs');
const { syncUserData, bulkSyncDiscordUsers } = require('./lib/sync-discord-user.cjs');

db.init();

const app = express();
const corsOpts = process.env.FRONTEND_ORIGIN
  ? {
      origin: process.env.FRONTEND_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }
  : { origin: true };
app.use(cors(corsOpts));
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3001;
const SECRET = process.env.JWT_SECRET || 'nexus_secret';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nominatim kamu sunucusu: ~1 istek/sn; tüm /api/geocode çağrıları sıraya alınır. */
const NOMINATIM_MIN_GAP_MS = Math.max(900, parseInt(process.env.NOMINATIM_MIN_GAP_MS || '1100', 10));
let nominatimChain = Promise.resolve();

function enqueueNominatim(fn) {
  const job = nominatimChain.then(() => fn());
  nominatimChain = job.catch(() => {}).then(() => sleep(NOMINATIM_MIN_GAP_MS));
  return job;
}

async function nominatimSearch(params, headers) {
  const url = 'https://nominatim.openstreetmap.org/search';
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const r = await axios.get(url, { params, headers, timeout: 25000 });
      return r.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < maxAttempts - 1) {
        const ra = parseInt(err.response?.headers?.['retry-after'], 10);
        const waitSec = Number.isFinite(ra) && ra > 0 ? ra : Math.min(120, 3 + attempt * 4);
        if (attempt === 0) {
          console.warn(`[Nominatim] 429 rate limit — ${waitSec}s bekleniyor (politika: max ~1 istek/sn)`);
        }
        await sleep(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Nominatim unreachable');
}

function nominatimHeaders() {
  return {
    'User-Agent':
      process.env.NOMINATIM_USER_AGENT ||
      'CebinLog/1.0 (intel panel; https://github.com/ccebin/cebinlog)',
    'Accept-Language': 'tr,en',
  };
}

/** Konum metninden bir kez koordinat çözümler (harita için DB’de saklanır). */
async function resolveLocationCoords(plainText) {
  const q = String(plainText || '').trim();
  if (!q) return { lat: null, lng: null };
  try {
    const params = { format: 'json', q, limit: 1, addressdetails: '0' };
    const data = await enqueueNominatim(() => nominatimSearch(params, nominatimHeaders()));
    if (data?.[0]) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch (e) {
    console.warn('[Geocode] Konum koordinatları alınamadı:', e.message);
  }
  return { lat: null, lng: null };
}

const getCleanIp = (req) => {
  let ip = req.headers['x-forwarded-for'] || req.ip;
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  return ip;
};

app.use(
  asyncHandler(async (req, res, next) => {
    const ip = getCleanIp(req);
    const isBanned = await db.get('SELECT id FROM banned_ips WHERE ip = ?', [ip]);
    if (isBanned) {
      return res.status(403).json({ error: 'Bu IP adresi kalıcı olarak engellenmiştir.' });
    }
    next();
  }),
);

const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, SECRET);
    const user = await db.get(
      'SELECT id, role, display_name, username, avatar, discord_id FROM users WHERE id = ?',
      [decoded.id],
    );
    if (!user) return res.status(401).json({ error: 'User no longer exists. Please re-login.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

async function addLog(targetId, userId, type, content, isAdminOnly = 0) {
  const enc = secure.encryptLogFields(content, undefined, undefined);
  await db.run(
    'INSERT INTO logs (target_id, user_id, type, content, is_admin_only) VALUES (?, ?, ?, ?, ?)',
    [targetId, userId, type, enc.content, isAdminOnly],
  );
  if (targetId) {
    await db.run('UPDATE people SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [targetId]);
  }
}

// --- AUTH ROUTES ---
app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { username, password, display_name } = req.body;
    const hash = await bcrypt.hash(password, 10);
    try {
      const cntSql = db.USE_PG ? 'SELECT COUNT(*)::int AS count FROM users' : 'SELECT COUNT(*) AS count FROM users';
      const cnt = await db.get(cntSql);
      const isFirst = Number(cnt?.count || 0) === 0;
      const role = isFirst ? 'admin' : 'user';
      const approved = isFirst ? 1 : 0;
      const ip = getCleanIp(req);
      const tail = db.USE_PG ? ' RETURNING id' : '';
      const result = await db.run(
        `INSERT INTO users (username, password_hash, display_name, role, approved, last_ip) VALUES (?, ?, ?, ?, ?, ?)${tail}`,
        [username, hash, display_name || username, role, approved, ip],
      );
      const userId = db.USE_PG ? result.rows[0]?.id : result.lastInsertRowid;
      res.json({ success: true, userId });
    } catch (err) {
      res.status(400).json({ error: 'Username already exists' });
    }
  }),
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    if (user.approved === 0) {
      return res.status(403).json({ error: 'Hesabınız henüz onaylanmadı. Lütfen yönetici ile iletişime geçin.' });
    }

    const ip = getCleanIp(req);
    await db.run('UPDATE users SET last_ip = ? WHERE id = ?', [ip, user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, display_name: user.display_name, avatar: user.avatar, discord_id: user.discord_id },
      SECRET,
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name, avatar: user.avatar, discord_id: user.discord_id },
    });
  }),
);

app.get(
  '/api/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const ip = getCleanIp(req);
    await db.run('UPDATE users SET last_ip = ? WHERE id = ?', [ip, req.user.id]);
    const user = await db.get('SELECT id, username, display_name, role, avatar, discord_id, last_ip FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  }),
);

// --- ADMIN USER MANAGEMENT ---
app.get(
  '/api/admin/users',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });
    const users = await db.all(
      'SELECT id, username, display_name, role, approved, created_at, avatar, discord_id, last_ip FROM users',
    );
    res.json(users);
  }),
);

app.put(
  '/api/admin/users/:id/approve',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });
    if (parseInt(req.params.id, 10) === req.user.id) return res.status(400).json({ error: 'Kendi onayınızı kaldıramazsınız.' });

    const target = await db.get('SELECT username, role FROM users WHERE id = ?', [req.params.id]);
    if (target?.username === 'cebin') return res.status(403).json({ error: 'Ana yönetici hesabı üzerinde bu işlem yapılamaz.' });
    if (req.user.username !== 'cebin' && target?.role === 'admin') return res.status(403).json({ error: 'Diğer yöneticiler üzerinde işlem yapamazsınız.' });

    const { approved } = req.body;
    await db.run('UPDATE users SET approved = ? WHERE id = ?', [approved ? 1 : 0, req.params.id]);
    await addLog(null, req.user.id, 'system', `${req.user.display_name}, «${target.username}» panel hesabını ${approved ? 'onayladı' : 'onaysız bıraktı'}.`, 1);
    res.json({ success: true });
  }),
);

app.put(
  '/api/admin/users/:id/role',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.username !== 'cebin') return res.status(403).json({ error: 'Sadece ana yönetici rol değiştirebilir.' });
    if (parseInt(req.params.id, 10) === req.user.id) return res.status(400).json({ error: 'Kendi rolünüzü değiştiremezsiniz.' });

    const target = await db.get('SELECT username FROM users WHERE id = ?', [req.params.id]);
    if (target?.username === 'cebin') return res.status(403).json({ error: 'Ana yönetici hesabı üzerinde bu işlem yapılamaz.' });

    const { role } = req.body;
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    await addLog(null, req.user.id, 'system', `${req.user.display_name}, «${target.username}» kullanıcısının rolünü «${role}» olarak güncelledi.`, 1);
    res.json({ success: true });
  }),
);

app.delete(
  '/api/admin/users/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });
    if (parseInt(req.params.id, 10) === req.user.id) return res.status(400).json({ error: 'Kendinizi silemezsiniz.' });

    const target = await db.get('SELECT username, role FROM users WHERE id = ?', [req.params.id]);
    if (target?.username === 'cebin') return res.status(403).json({ error: 'Ana yönetici hesabı silinemez.' });
    if (req.user.username !== 'cebin' && target?.role === 'admin') return res.status(403).json({ error: 'Diğer yöneticileri silemezsiniz.' });

    await db.run('UPDATE logs SET user_id = NULL WHERE user_id = ?', [req.params.id]);
    await db.run('UPDATE logs SET editor_id = NULL WHERE editor_id = ?', [req.params.id]);
    await db.run('UPDATE media SET user_id = NULL WHERE user_id = ?', [req.params.id]);
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await addLog(null, req.user.id, 'system', `${req.user.display_name}, '${target.username}' kullanıcısını sistemden kaldırdı.`, 1);
    res.json({ success: true });
  }),
);

app.put(
  '/api/admin/users/:id/sync-discord',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });

    const target = await db.get('SELECT username, role FROM users WHERE id = ?', [req.params.id]);
    if (req.user.username !== 'cebin' && target?.role === 'admin') {
      return res.status(403).json({ error: 'Yöneticilerin Discord bağlantısını değiştiremezsiniz.' });
    }

    const { discord_id } = req.body;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    try {
      const response = await axios.get(`https://discord.com/api/v10/users/${discord_id}`, {
        headers: { Authorization: `Bot ${botToken}` },
      });

      const { username, global_name, avatar } = response.data;
      await db.run('UPDATE users SET discord_id = ?, avatar = ?, display_name = ? WHERE id = ?', [
        discord_id,
        avatar,
        global_name || username,
        req.params.id,
      ]);

      await addLog(
        null,
        req.user.id,
        'system',
        `${req.user.display_name}, «${target.username}» için Discord bağlantısını güncelledi (Discord kullanıcı kimliği: ${discord_id}).`,
        1,
      );

      res.json({ success: true, user: { discord_id, avatar, display_name: global_name || username } });
    } catch (err) {
      res.status(500).json({ error: 'Discord verisi çekilemedi.' });
    }
  }),
);

app.put(
  '/api/admin/users/:id/reset-password',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });

    const targetId = parseInt(req.params.id, 10);
    const target = await db.get('SELECT username, role FROM users WHERE id = ?', [targetId]);

    if (req.user.username !== 'cebin' && targetId !== req.user.id && target?.role === 'admin') {
      return res.status(403).json({ error: 'Diğer yöneticilerin şifresini değiştiremezsiniz.' });
    }

    const { password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    await addLog(null, req.user.id, 'system', `${req.user.display_name}, «${target.username}» hesabının şifresini yeniledi.`, 1);
    res.json({ success: true });
  }),
);

// --- DATA EXPORT/IMPORT ---
app.get(
  '/api/admin/export',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });

    const data = {
      users: await db.all('SELECT * FROM users'),
      people: await db.all('SELECT * FROM people'),
      logs: await db.all('SELECT * FROM logs'),
      media: await db.all('SELECT * FROM media'),
      connections: await db.all('SELECT * FROM connections'),
    };

    res.json(data);
  }),
);

app.post(
  '/api/admin/import',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });

    const { data } = req.body;
    if (!data || !data.users || !data.people) return res.status(400).json({ error: 'Geçersiz veri formatı.' });

    try {
      if (db.USE_PG) {
        await db.pgImportTx(async (txRun) => {
          const run = (sql, p) => txRun(sql, p);
          await run('DELETE FROM connections');
          await run('DELETE FROM media');
          await run('DELETE FROM logs');
          await run('DELETE FROM people');
          await run('DELETE FROM users');

          for (const u of data.users) {
            await run(
              'INSERT INTO users (id, username, password_hash, display_name, role, discord_id, avatar, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [u.id, u.username, u.password_hash, u.display_name, u.role, u.discord_id, u.avatar, u.approved, u.created_at],
            );
          }
          for (const p of data.people) {
            await run(
              'INSERT INTO people (id, username, display_name, avatar, banner, decoration, guilds, bio, real_name, location, age, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [p.id, p.username, p.display_name, p.avatar, p.banner, p.decoration, p.guilds, p.bio, p.real_name, p.location, p.age, p.last_updated],
            );
          }
          for (const l of data.logs || []) {
            await run(
              'INSERT INTO logs (id, target_id, user_id, type, content, pinned, timestamp, original_content, editor_name, editor_id, edited_at, history, is_admin_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                l.id,
                l.target_id,
                l.user_id,
                l.type,
                l.content,
                l.pinned,
                l.timestamp,
                l.original_content,
                l.editor_name,
                l.editor_id,
                l.edited_at,
                l.history,
                l.is_admin_only,
              ],
            );
          }
          for (const m of data.media || []) {
            await run('INSERT INTO media (id, target_id, user_id, url, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)', [
              m.id,
              m.target_id,
              m.user_id,
              m.url,
              m.note,
              m.timestamp,
            ]);
          }
          for (const c of data.connections || []) {
            await run('INSERT INTO connections (id, from_id, to_id, type, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)', [
              c.id,
              c.from_id,
              c.to_id,
              c.type,
              c.note,
              c.timestamp,
            ]);
          }
        });
      } else {
        const database = require('./database.cjs');
        db.sqliteTransaction(() => {
          database.prepare('DELETE FROM connections').run();
          database.prepare('DELETE FROM media').run();
          database.prepare('DELETE FROM logs').run();
          database.prepare('DELETE FROM people').run();
          database.prepare('DELETE FROM users').run();

          const insertUser = database.prepare(
            'INSERT INTO users (id, username, password_hash, display_name, role, discord_id, avatar, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          );
          for (const u of data.users) insertUser.run(u.id, u.username, u.password_hash, u.display_name, u.role, u.discord_id, u.avatar, u.approved, u.created_at);

          const insertPerson = database.prepare(
            'INSERT INTO people (id, username, display_name, avatar, banner, decoration, guilds, bio, real_name, location, age, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          );
          for (const p of data.people) insertPerson.run(p.id, p.username, p.display_name, p.avatar, p.banner, p.decoration, p.guilds, p.bio, p.real_name, p.location, p.age, p.last_updated);

          const insertLog = database.prepare(
            'INSERT INTO logs (id, target_id, user_id, type, content, pinned, timestamp, original_content, editor_name, editor_id, edited_at, history, is_admin_only) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          );
          for (const l of data.logs || []) {
            insertLog.run(
              l.id,
              l.target_id,
              l.user_id,
              l.type,
              l.content,
              l.pinned,
              l.timestamp,
              l.original_content,
              l.editor_name,
              l.editor_id,
              l.edited_at,
              l.history,
              l.is_admin_only,
            );
          }

          const insertMedia = database.prepare('INSERT INTO media (id, target_id, user_id, url, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
          for (const m of data.media || []) insertMedia.run(m.id, m.target_id, m.user_id, m.url, m.note, m.timestamp);

          const insertConn = database.prepare('INSERT INTO connections (id, from_id, to_id, type, note, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
          for (const c of data.connections || []) insertConn.run(c.id, c.from_id, c.to_id, c.type, c.note, c.timestamp);
        })();
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ error: 'İçe aktarma başarısız: ' + err.message });
    }
  }),
);

/** Yerel/script ile oluşmuş NewUser_* / «User …» kayıtlarını veya tüm aktif hedefleri Discord API ile günceller. */
app.post(
  '/api/admin/discord-resync-targets',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });

    const mode = req.body?.mode === 'all' ? 'all' : 'stubs';
    let ids;
    if (mode === 'all') {
      const rows = await db.all('SELECT id FROM people WHERE COALESCE(is_archived, 0) = 0');
      ids = rows.map((r) => r.id);
    } else {
      const rows = await db.all(
        'SELECT id, username, display_name FROM people WHERE COALESCE(is_archived, 0) = 0',
      );
      ids = rows
        .filter((p) => {
          const u = p.username != null ? String(p.username) : '';
          const d = p.display_name != null ? String(p.display_name).trim() : '';
          if (u.startsWith('NewUser_')) return true;
          if (/^User \d+$/.test(d)) return true;
          return false;
        })
        .map((p) => p.id);
    }

    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token || token === 'YOUR_TOKEN_HERE') {
      return res.status(400).json({ error: 'DISCORD_BOT_TOKEN tanımlı değil.' });
    }

    if (ids.length === 0) {
      return res.json({ success: true, mode, summary: { targets: 0, ok: 0, failed: 0 }, message: 'Eşleşen hedef yok.' });
    }

    const concParsed = parseInt(process.env.DISCORD_SYNC_CONCURRENCY || '12', 10);
    const conc = Number.isFinite(concParsed) ? Math.min(40, Math.max(1, concParsed)) : 12;

    const bulkRows = await bulkSyncDiscordUsers(ids, { concurrency: conc });

    let ok = 0;
    let failed = 0;
    for (const row of bulkRows) {
      if (row.ok) ok++;
      else failed++;
    }

    await addLog(
      null,
      req.user.id,
      'system',
      `${req.user.display_name}, Discord toplu senk (${mode}): ${ok} başarılı, ${failed} hata (${ids.length} hedef).`,
      1,
    );

    res.json({
      success: true,
      mode,
      summary: { targets: ids.length, ok, failed },
    });
  }),
);

// --- IP BAN MANAGEMENT ---
app.get(
  '/api/admin/banned-ips',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });
    const bans = await db.all('SELECT * FROM banned_ips ORDER BY timestamp DESC');
    res.json(bans);
  }),
);

app.post(
  '/api/admin/banned-ips',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Yetkisiz erişim.' });
    const { ip, reason, target_id } = req.body;
    const currentIp = getCleanIp(req);
    if (ip === currentIp) {
      return res.status(400).json({ error: 'Kendi IP adresinizi engelleyemezsiniz.' });
    }

    if (target_id && req.user.username !== 'cebin') {
      const target = await db.get('SELECT role FROM users WHERE id = ?', [target_id]);
      if (target?.role === 'admin') return res.status(403).json({ error: 'Yöneticilerin IP adresini engelleyemezsiniz.' });
    }

    try {
      await db.run('INSERT INTO banned_ips (ip, reason) VALUES (?, ?)', [ip, reason]);
      await addLog(null, req.user.id, 'system', `${req.user.display_name}, ${ip} adresinden gelen bağlantıları engelledi. Gerekçe: ${reason || 'Belirtilmedi'}.`, 1);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'Bu IP zaten engelli.' });
    }
  }),
);

app.delete(
  '/api/admin/banned-ips/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const ban = await db.get('SELECT ip FROM banned_ips WHERE id = ?', [req.params.id]);
    await db.run('DELETE FROM banned_ips WHERE id = ?', [req.params.id]);
    if (ban) {
      await addLog(null, req.user.id, 'system', `${req.user.display_name}, ${ban.ip} adresindeki erişim engelini kaldırdı.`, 1);
    }
    res.json({ success: true });
  }),
);

// --- GEOCODING (Nominatim; tarayıcıdan doğrudan istek CORS yüzünden bloklanır — sunucu proxy) ---
app.get(
  '/api/geocode',
  authenticate,
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    if (!q || String(q).trim() === '') {
      return res.status(400).json({ error: 'q parametresi gerekli' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10) || 5, 1), 10);
    const addressdetails = req.query.addressdetails === '0' ? '0' : '1';
    const headers = nominatimHeaders();
    const params = {
      format: 'json',
      q: String(q),
      limit,
      addressdetails,
    };
    try {
      const data = await enqueueNominatim(() => nominatimSearch(params, headers));
      res.json(data);
    } catch (err) {
      const st = err.response?.status;
      if (st === 429) {
        console.error('[Nominatim] 429 — çok fazla istek; env ile NOMINATIM_MIN_GAP_MS artırın veya kendi Nominatim kurulumunu kullanın.');
        return res.status(429).json({
          error:
            'Konum servisi geçici olarak istek limitine takıldı (429). Bir süre sonra tekrar deneyin veya haritada daha az hedef kullanın.',
        });
      }
      console.error('Geocode proxy:', err.message);
      res.status(502).json({ error: 'Konum araması şu an yapılamıyor.' });
    }
  }),
);

// --- DISCORD DATA ---
app.get('/api/discord/user/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === 'YOUR_TOKEN_HERE') return res.status(400).json({ error: 'Bot token not configured' });

  try {
    const response = await axios.get(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Failed to fetch Discord data' });
  }
});

app.get('/api/discord/user/:id/guilds', authenticate, async (req, res) => {
  const { id } = req.params;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === 'YOUR_TOKEN_HERE') return res.status(400).json({ error: 'Bot token not configured' });

  try {
    const guildsRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${token}` },
    });
    const botGuilds = guildsRes.data;

    const mutualGuilds = [];
    for (const guild of botGuilds) {
      try {
        const memberRes = await axios.get(`https://discord.com/api/v10/guilds/${guild.id}/members/${id}`, {
          headers: { Authorization: `Bot ${token}` },
        });

        if (memberRes.data) {
          mutualGuilds.push({
            id: guild.id,
            name: guild.name,
            icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
          });
        }
      } catch (e) {
        /* yok say */
      }
    }
    res.json(mutualGuilds);
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync mutual guilds' });
  }
});

// --- PEOPLE ROUTES ---
app.get(
  '/api/people',
  authenticate,
  asyncHandler(async (req, res) => {
    const rows = await db.all(
      'SELECT * FROM people WHERE (is_archived = 0 OR is_archived IS NULL) ORDER BY last_updated DESC',
    );
    res.json(rows.map((r) => secure.decryptPerson(r)));
  }),
);

app.post(
  '/api/people',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id, username, display_name, avatar, banner, decoration, guilds, bio, real_name, location, age: rawAge, update = false } = req.body;
    try {
      const existing = await db.get('SELECT id FROM people WHERE id = ?', [id]);
      if (existing && !update) {
        return res.status(400).json({ error: 'Bu kişi zaten sisteme kayıtlı.' });
      }

      let age = null;
      if (rawAge !== undefined && rawAge !== null && rawAge !== '') {
        const n = parseInt(String(rawAge), 10);
        age = Number.isFinite(n) ? n : null;
      }

      const guildsJson = typeof guilds === 'string' ? guilds : guilds ? JSON.stringify(guilds) : null;
      const pf = secure.encryptPersonFields(bio, real_name, location);

      const plainLoc =
        location !== undefined && location !== null ? String(location).trim() : '';
      let locLat = null;
      let locLng = null;
      if (plainLoc) {
        const coords = await resolveLocationCoords(plainLoc);
        locLat = coords.lat;
        locLng = coords.lng;
      }

      await db.run(
        `
      INSERT INTO people (id, username, display_name, avatar, banner, decoration, guilds, bio, real_name, location, age, location_lat, location_lng, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        avatar = excluded.avatar,
        banner = excluded.banner,
        decoration = excluded.decoration,
        guilds = ?,
        bio = excluded.bio,
        real_name = COALESCE(?, people.real_name),
        location = COALESCE(?, people.location),
        age = COALESCE(?, people.age),
        location_lat = excluded.location_lat,
        location_lng = excluded.location_lng,
        last_updated = CURRENT_TIMESTAMP,
        is_archived = 0
    `,
        [
          id,
          username,
          display_name,
          avatar,
          banner,
          decoration,
          guildsJson,
          pf.bio,
          pf.real_name,
          pf.location,
          age,
          locLat,
          locLng,
          guildsJson,
          pf.real_name,
          pf.location,
          age,
        ],
      );

      const saved = await db.get('SELECT display_name, username FROM people WHERE id = ?', [id]);
      const dn = saved?.display_name || display_name || username || String(id);
      const un = saved?.username || username || '—';
      const targetLabel = `${dn} (@${un})`;
      await addLog(
        id,
        req.user.id,
        'system',
        `${req.user.display_name}, ${existing ? `${targetLabel} kaydını güncelledi.` : `${targetLabel} kaydını sisteme ekledi.`}`,
        1,
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }),
);

/** Discord kullanıcı/kanal/sunucu snowflake’leri: metin içinden yalnızca bu uzunluktaki sayı dizileri alınır. */
function extractDiscordSnowflakes(blob) {
  const s = String(blob ?? '');
  const matches = s.match(/\d{17,22}/g);
  return [...new Set(matches || [])];
}

function idsFromBulkPayload(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return extractDiscordSnowflakes(raw.map((x) => String(x ?? '')).join('\n'));
  }
  if (typeof raw === 'string') {
    return extractDiscordSnowflakes(raw);
  }
  return [];
}

app.post(
  '/api/people/bulk-import',
  authenticate,
  asyncHandler(async (req, res) => {
    const raw = req.body?.ids;
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token || token === 'YOUR_TOKEN_HERE') {
      return res.status(400).json({ error: 'Discord bot token yapılandırılmamış.' });
    }

    const ids = idsFromBulkPayload(raw);
    if (ids.length === 0) {
      return res.status(400).json({
        error:
          'Geçerli Discord ID bulunamadı. Dosyada sunucu adı, not vb. olabilir; yalnızca 17–22 haneli ID sayıları kullanılır.',
      });
    }

    const concurrency = parseInt(
      process.env.BULK_IMPORT_CONCURRENCY || process.env.DISCORD_SYNC_CONCURRENCY || '12',
      10,
    );
    const syncConc = Number.isFinite(concurrency) ? Math.min(40, Math.max(1, concurrency)) : 12;

    const bulkRows = await bulkSyncDiscordUsers(ids, { concurrency: syncConc });

    const results = [];
    let imported = 0;
    let updated = 0;
    let failed = 0;

    for (const row of bulkRows) {
      const { id } = row;
      if (row.ok) {
        const syncResult = row.syncResult;
        if (syncResult.isNew) {
          imported++;
          results.push({ id, status: 'imported' });
        } else {
          updated++;
          results.push({ id, status: 'updated' });
        }
      } else {
        failed++;
        const err = row.error;
        const status = err?.response?.status;
        const msg =
          status === 404
            ? 'Discord’da böyle bir kullanıcı yok veya bota görünmüyor.'
            : err?.message || 'Senkronizasyon hatası';
        results.push({ id, status: 'failed', error: msg });
      }
    }

    res.json({
      success: true,
      summary: { total: ids.length, imported, updated, failed },
      results,
    });
  }),
);

app.get(
  '/api/people/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM people WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Person not found' });
    res.json(secure.decryptPerson(row));
  }),
);

app.post(
  '/api/people/:id/sync-profile',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const result = await syncUserData(req.params.id, { triggeredByUserId: req.user.id });
      const updatedRow = await db.get('SELECT * FROM people WHERE id = ?', [req.params.id]);
      const updatedPerson = secure.decryptPerson(updatedRow);
      res.json({ success: true, person: updatedPerson, ...result });
    } catch (err) {
      console.error('Sync error:', err.message);
      const status = err.response?.status;
      const msg = err.message || '';
      if (msg.includes('17–23 haneli')) {
        return res.status(400).json({ error: msg });
      }
      if (status === 404) {
        return res.status(404).json({
          error:
            'Discord bu ID için kullanıcı döndürmedi (silinmiş, geçersiz veya hesap ortak sunucuda bota görünmüyor olabilir).',
        });
      }
      res.status(status && status !== 500 ? status : 500).json({
        error: msg || 'Discord profili senkronize edilemedi.',
      });
    }
  }),
);

app.get(
  '/api/people/:id/system-logs',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const rawLimit = parseInt(String(req.query.limit ?? ''), 10);
      const rawOffset = parseInt(String(req.query.offset ?? ''), 10);
      const limit = Math.min(150, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
      const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
      const overfetch = limit + 1;
      const logs = await db.all(
        `
      SELECT logs.*, users.display_name as author, users.avatar as author_avatar, users.discord_id as author_discord_id
      FROM logs 
      LEFT JOIN users ON logs.user_id = users.id
      WHERE target_id = ? AND type = 'system' 
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `,
        [req.params.id, overfetch, offset],
      );
      const hasMore = logs.length > limit;
      const slice = hasMore ? logs.slice(0, limit) : logs;
      res.json({
        items: slice.map((l) => secure.decryptLog(l)),
        hasMore,
        nextOffset: offset + slice.length,
      });
    } catch (err) {
      console.error('System logs error:', err.message);
      fs.appendFileSync('discord_debug.log', `[${new Date().toISOString()}] System logs error for ${req.params.id}: ${err.message}\n`);
      res.status(500).json({ error: 'Failed to fetch system logs' });
    }
  }),
);

setInterval(async () => {
  console.log('[System] Running automated profile sync...');
  try {
    const people = await db.all('SELECT id FROM people WHERE COALESCE(is_archived, 0) = 0');
    const ids = people.map((p) => p.id);
    if (ids.length === 0) return;
    const conc = parseInt(
      process.env.DISCORD_SYSTEM_SYNC_CONCURRENCY || process.env.DISCORD_SYNC_CONCURRENCY || '8',
      10,
    );
    const syncConc = Number.isFinite(conc) ? Math.min(40, Math.max(1, conc)) : 8;
    const rows = await bulkSyncDiscordUsers(ids, { concurrency: syncConc });
    const ok = rows.filter((r) => r.ok).length;
    console.log(`[System] Profil güncelleme tamamlandı (${ok}/${rows.length}).`);
  } catch (e) {
    console.error('[System] Otomatik senk başarısız:', e.message);
  }
}, 30 * 60 * 1000);

app.delete(
  '/api/people/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
      const person = await db.get('SELECT display_name FROM people WHERE id = ?', [id]);
      const personName = person ? person.display_name : id;

      await addLog(id, req.user.id, 'system', `${req.user.display_name}, '${personName}' (${id}) adlı profili arşive taşıdı.`, 1);
      await db.run('UPDATE people SET is_archived = 1 WHERE id = ?', [id]);
      res.json({ success: true, message: 'Kayıt silindi.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }),
);

app.delete(
  '/api/people/:id/hard',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sadece admin yetkisi.' });
    const { id } = req.params;
    try {
      await db.run('DELETE FROM logs WHERE target_id = ?', [id]);
      await db.run('DELETE FROM media WHERE target_id = ?', [id]);
      await db.run('DELETE FROM connections WHERE from_id = ? OR to_id = ?', [id, id]);
      await db.run('DELETE FROM people WHERE id = ?', [id]);
      res.json({ success: true, message: 'Kayıt tamamen silindi.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }),
);

app.get(
  '/api/admin/archived',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sadece admin yetkisi.' });
    const archived = await db.all('SELECT * FROM people WHERE is_archived = 1 ORDER BY last_updated DESC');
    res.json(archived.map((r) => secure.decryptPerson(r)));
  }),
);

app.post(
  '/api/people/:id/restore',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Sadece admin yetkisi.' });
    const { id } = req.params;
    await db.run('UPDATE people SET is_archived = 0 WHERE id = ?', [id]);
    await addLog(id, req.user.id, 'system', `${req.user.display_name}, '${id}' kişisini arşivden geri getirdi; kayıt yeniden görünür oldu.`, 1);
    res.json({ success: true });
  }),
);

// --- LOGS & NOTES ---
app.get(
  '/api/logs/:targetId',
  authenticate,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const logs = await db.all(
      `
    SELECT logs.*, 
           author_u.display_name as author,
           author_u.avatar as author_avatar,
           author_u.discord_id as author_discord_id,
           editor_u.display_name as editor_name,
           editor_u.avatar as editor_avatar,
           editor_u.discord_id as editor_discord_id
    FROM logs 
    LEFT JOIN users as author_u ON logs.user_id = author_u.id 
    LEFT JOIN users as editor_u ON logs.editor_id = editor_u.id
    WHERE target_id = ? AND type = 'note'
    ${isAdmin ? '' : 'AND is_admin_only = 0'}
    ORDER BY pinned DESC, timestamp DESC
  `,
      [req.params.targetId],
    );
    res.json(logs.map((l) => secure.decryptLog(l)));
  }),
);

app.put(
  '/api/logs/:id/pin',
  authenticate,
  asyncHandler(async (req, res) => {
    const { pinned } = req.body;
    await db.run('UPDATE logs SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, req.params.id]);
    res.json({ success: true });
  }),
);

app.delete(
  '/api/logs/all',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    await db.run('DELETE FROM logs');
    await addLog(null, req.user.id, 'system', `${req.user.display_name}, tüm sistem günlük kayıtlarını tek seferde temizledi.`, 1);
    res.json({ success: true });
  }),
);

app.delete(
  '/api/logs/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const row = await db.get(
      'SELECT logs.*, people.display_name as target_name FROM logs LEFT JOIN people ON logs.target_id = people.id WHERE logs.id = ?',
      [id],
    );
    const log = secure.decryptLog(row);

    if (!log) return res.status(404).json({ error: 'Log bulunamadı.' });

    if (log.type === 'note') {
      await addLog(
        log.target_id,
        req.user.id,
        'system',
        `${req.user.display_name}, ${log.target_name || log.target_id} için yazılmış bir istihbarat notunu sildi. Silinen metin: "${log.content}"`,
        1,
      );
    } else if (log.type === 'system' && req.user.role === 'admin') {
      await addLog(
        null,
        req.user.id,
        'system',
        `${req.user.display_name}, geçmiş kayıtlardan bir günlük satırını sildi. Özet: "${log.content.slice(0, 200)}${log.content.length > 200 ? '…' : ''}"`,
        1,
      );

      const isDeleteLog =
        log.content.includes('SİLDİ') ||
        log.content.includes('ARŞİVLEDİ') ||
        /\b(arşivledi|arşive taşıdı|kalıcı olarak veritabanından sildi|listeden kaldırdı|topluca|notunu sildi|günlük satırını sildi|bağlantı kaydını kaldırdı)/i.test(log.content);
      const urlMatch = log.content.match(/\(URL: ([^, \)]+)/);

      if (isDeleteLog && urlMatch) {
        const url = urlMatch[1];
        await db.run('DELETE FROM media WHERE url = ?', [url]);
      }
    }

    await db.run('DELETE FROM logs WHERE id = ?', [id]);
    res.json({ success: true });
  }),
);

app.put(
  '/api/logs/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { content } = req.body;
    const { id } = req.params;

    try {
      const row = await db.get('SELECT target_id, content, history FROM logs WHERE id = ?', [id]);
      const log = secure.decryptLog(row);
      if (!log) return res.status(404).json({ error: 'Log not found' });

      let history = [];
      try {
        history = JSON.parse(log.history || '[]');
      } catch (e) {
        history = [];
      }

      if (history.length >= 3) {
        return res.status(400).json({ error: 'Bu not en fazla 3 kere düzenlenebilir.' });
      }

      const historyEntry = {
        content: log.content,
        editor_name: req.user.display_name,
        editor_id: req.user.id,
        editor_avatar: req.user.avatar,
        editor_discord_id: req.user.discord_id,
        edited_at: new Date().toISOString(),
      };

      history.push(historyEntry);

      const encContent = secure.encryptLogFields(content, null, JSON.stringify(history));

      await db.run(
        `
      UPDATE logs 
      SET content = ?, history = ?, editor_name = ?, editor_id = ?, edited_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
        [encContent.content, encContent.history, req.user.display_name, req.user.id, id],
      );

      const target = await db.get('SELECT people.display_name FROM logs LEFT JOIN people ON logs.target_id = people.id WHERE logs.id = ?', [id]);
      await addLog(
        log.target_id,
        req.user.id,
        'system',
        `${req.user.display_name}, ${target?.display_name || log.target_id} üzerindeki bir notu düzenledi. Önce: "${log.content}" — Sonra: "${content}"`,
        1,
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }),
);

app.get(
  '/api/logs',
  authenticate,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const logs = await db.all(
      `
    SELECT logs.*, users.display_name as author, users.avatar as author_avatar, users.discord_id as author_discord_id, people.display_name as target_name, people.username as target_username, people.avatar as target_avatar
    FROM logs 
    LEFT JOIN users ON logs.user_id = users.id 
    LEFT JOIN people ON logs.target_id = people.id
    WHERE (people.is_archived = 0 OR people.is_archived IS NULL OR logs.type = 'system')
    ${isAdmin ? '' : 'AND is_admin_only = 0'}
    ORDER BY timestamp DESC
  `,
    );
    res.json(logs.map((l) => secure.decryptLog(l)));
  }),
);

app.post(
  '/api/logs',
  authenticate,
  asyncHandler(async (req, res) => {
    const { target_id, content, type = 'note' } = req.body;
    const enc = secure.encryptLogFields(content, undefined, undefined);
    await db.run('INSERT INTO logs (target_id, user_id, type, content) VALUES (?, ?, ?, ?)', [target_id, req.user.id, type, enc.content]);
    await db.run('UPDATE people SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [target_id]);

    res.json({ success: true });
  }),
);

// --- MEDIA ROUTES ---
app.get(
  '/api/media',
  authenticate,
  asyncHandler(async (req, res) => {
    const { q, targetId } = req.query;
    let query = `
    SELECT media.*, users.display_name as author, users.avatar as author_avatar, users.discord_id as author_discord_id, people.display_name as target_name, people.avatar as target_avatar
    FROM media 
    LEFT JOIN users ON media.user_id = users.id 
    LEFT JOIN people ON media.target_id = people.id
    WHERE (people.is_archived = 0 OR people.is_archived IS NULL)
  `;

    if (req.user.role !== 'admin') {
      query += ` AND (media.is_deleted = 0 OR media.is_deleted IS NULL) `;
    }

    let params = [];

    if (targetId) {
      query += ` AND media.target_id = ? `;
      params.push(targetId);
    }

    if (q) {
      const s = `%${q}%`;
      if (secure.isEncryptionEnabled()) {
        query += ` ORDER BY timestamp DESC`;
        const media = await db.all(query, params);
        const qLower = String(q).toLowerCase();
        const filtered = media
          .map((m) => secure.decryptMedia(m))
          .filter((m) => {
            const note = (m.note || '').toLowerCase();
            return note.includes(qLower);
          });
        return res.json(filtered);
      }
      query += `
      AND (media.target_id IN (
        SELECT id FROM people 
        WHERE display_name LIKE ? OR username LIKE ? OR location LIKE ? OR bio LIKE ? OR real_name LIKE ?
      ) OR media.target_id IN (
        SELECT target_id FROM logs 
        WHERE content LIKE ?
      ) OR media.note LIKE ? )
    `;
      params = params.concat([s, s, s, s, s, s, s]);
    }

    query += ` ORDER BY timestamp DESC`;
    const media = await db.all(query, params);
    res.json(media.map((m) => secure.decryptMedia(m)));
  }),
);

app.get(
  '/api/media/:targetId',
  authenticate,
  asyncHandler(async (req, res) => {
    let sql = `
    SELECT media.*, users.display_name as author, users.avatar as author_avatar, users.discord_id as author_discord_id
    FROM media 
    LEFT JOIN users ON media.user_id = users.id 
    WHERE target_id = ? 
  `;

    if (req.user.role !== 'admin') {
      sql += ` AND (media.is_deleted = 0 OR media.is_deleted IS NULL) `;
    }

    sql += ` ORDER BY timestamp DESC `;

    const media = await db.all(sql, [req.params.targetId]);
    res.json(media.map((m) => secure.decryptMedia(m)));
  }),
);

app.post(
  '/api/media',
  authenticate,
  asyncHandler(async (req, res) => {
    const { target_id, url, note, isBase64 } = req.body;
    let finalUrl = url;

    try {
      if (isBase64) {
        const mimeMatch = url.match(/^data:(.*);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        let extension = 'png';

        if (mimeType.includes('video/mp4')) extension = 'mp4';
        else if (mimeType.includes('video/webm')) extension = 'webm';
        else if (mimeType.includes('audio/mpeg') || mimeType.includes('audio/mp3')) extension = 'mp3';
        else if (mimeType.includes('audio/wav')) extension = 'wav';
        else if (mimeType.includes('application/pdf')) extension = 'pdf';
        else if (mimeType.includes('image/jpeg')) extension = 'jpg';
        else if (mimeType.includes('image/gif')) extension = 'gif';

        const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
        const filePath = path.join(__dirname, 'public', 'uploads', fileName);
        const base64Data = url.replace(/^data:.*;base64,/, '');

        if (!fs.existsSync(path.join(__dirname, 'public', 'uploads'))) {
          fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
        }

        fs.writeFileSync(filePath, base64Data, 'base64');
        finalUrl = `/uploads/${fileName}`;
      }

      const encNote = fc.encryptOptional(note || '');

      await db.run('INSERT INTO media (target_id, user_id, url, note) VALUES (?, ?, ?, ?)', [target_id, req.user.id, finalUrl, encNote]);

      const person = await db.get('SELECT display_name FROM people WHERE id = ?', [target_id]);
      await addLog(
        target_id,
        req.user.id,
        'system',
        `${req.user.display_name}, ${person?.display_name || target_id} için yeni medya kanıtı yükledi. (URL: ${finalUrl})${note ? ` Not: ${note}` : ''}`,
        1,
      );

      res.json({ success: true, url: finalUrl });
    } catch (err) {
      console.error('Media upload error:', err.message);
      fs.appendFileSync(
        'discord_debug.log',
        `[${new Date().toISOString()}] Media upload error: ${err.message} (Target: ${target_id}, User: ${req.user.id}, URL: ${finalUrl ? finalUrl.substring(0, 50) : 'null'}...)\n`,
      );
      res.status(500).json({ error: 'Dosya yüklenemedi: ' + err.message });
    }
  }),
);

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.delete(
  '/api/media/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const row = await db.get('SELECT target_id, note, url FROM media WHERE id = ?', [id]);
    const media = secure.decryptMedia(row);
    if (media) {
      const actionDesc =
        req.user.role === 'admin'
          ? 'bu kanıtı kalıcı olarak veritabanından sildi'
          : 'bu kanıtı listeden kaldırdı (silinen görünüm; kayıt saklı)';
      await addLog(
        media.target_id,
        req.user.id,
        'system',
        `${req.user.display_name}, ${actionDesc}. (URL: ${media.url}) Not: ${media.note || '—'}`,
        1,
      );
    }

    if (req.user.role === 'admin') {
      await db.run('DELETE FROM media WHERE id = ?', [id]);
    } else {
      await db.run('UPDATE media SET is_deleted = 1 WHERE id = ?', [id]);
    }
    res.json({ success: true });
  }),
);

app.put(
  '/api/media/:id/note',
  authenticate,
  asyncHandler(async (req, res) => {
    const { note } = req.body;
    const { id } = req.params;
    const row = await db.get('SELECT target_id, note FROM media WHERE id = ?', [id]);
    const media = secure.decryptMedia(row);
    if (media) {
      await addLog(
        media.target_id,
        req.user.id,
        'system',
        `${req.user.display_name}, kanıt üzerindeki açıklamayı güncelledi. Önceki metin: "${media.note || ''}" — Yeni metin: "${note}"`,
        1,
      );
    }
    const enc = fc.encryptOptional(note || '');
    await db.run('UPDATE media SET note = ? WHERE id = ?', [enc, id]);
    res.json({ success: true });
  }),
);

app.post(
  '/api/media/bulk-delete',
  authenticate,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Geçersiz ID listesi.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(`SELECT target_id, url, note FROM media WHERE id IN (${placeholders})`, ids);
    const mediaItems = rows.map((r) => secure.decryptMedia(r));

    if (mediaItems.length > 0) {
      const urlsString = mediaItems.map((m) => `(URL: ${m.url})`).join(' ');
      const bulkDesc =
        req.user.role === 'admin'
          ? `${ids.length} kanıt öğesini kalıcı olarak sildi`
          : `${ids.length} kanıt öğesini toplu olarak arşivledi`;
      await addLog(mediaItems[0].target_id, req.user.id, 'system', `${req.user.display_name}, ${bulkDesc}. ${urlsString}`, 1);
    }

    const ph = ids.map(() => '?').join(',');
    if (req.user.role === 'admin') {
      await db.run(`DELETE FROM media WHERE id IN (${ph})`, ids);
    } else {
      await db.run(`UPDATE media SET is_deleted = 1 WHERE id IN (${ph})`, ids);
    }
    res.json({ success: true });
  }),
);

// --- CONNECTIONS ---
app.get(
  '/api/connections',
  authenticate,
  asyncHandler(async (req, res) => {
    const connections = await db.all('SELECT * FROM connections');
    res.json(connections.map((c) => secure.decryptConnection(c)));
  }),
);

app.post(
  '/api/connections',
  authenticate,
  asyncHandler(async (req, res) => {
    const { from_id, to_id, type, note } = req.body;
    const enc = fc.encryptOptional(note || '');
    await db.run('INSERT INTO connections (from_id, to_id, type, note) VALUES (?, ?, ?, ?)', [from_id, to_id, type, enc]);

    const fromP = await db.get('SELECT display_name FROM people WHERE id = ?', [from_id]);
    const toP = await db.get('SELECT display_name FROM people WHERE id = ?', [to_id]);
    const connLabel = `${fromP?.display_name || from_id} ile ${toP?.display_name || to_id} arasında`;
    await addLog(from_id, req.user.id, 'system', `${req.user.display_name}, ${connLabel} «${type}» türünde yeni bir bağlantı kaydı açtı.`, 1);
    await addLog(to_id, req.user.id, 'system', `${req.user.display_name}, ${connLabel} «${type}» türünde yeni bir bağlantı kaydı açtı.`, 1);

    res.json({ success: true });
  }),
);

app.post(
  '/api/connections/delete',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { from_id, to_id } = req.body;
      console.log(`Bağlantı silme isteği (POST): ${from_id} <-> ${to_id}`);

      const fromP = await db.get('SELECT display_name FROM people WHERE id = ?', [from_id]);
      const toP = await db.get('SELECT display_name FROM people WHERE id = ?', [to_id]);

      const result = await db.run('DELETE FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [
        from_id,
        to_id,
        to_id,
        from_id,
      ]);

      const delLabel = `${fromP?.display_name || from_id} — ${toP?.display_name || to_id}`;
      await addLog(from_id, req.user.id, 'system', `${req.user.display_name}, ${delLabel} arasındaki bağlantı kaydını kaldırdı.`, 1);
      await addLog(to_id, req.user.id, 'system', `${req.user.display_name}, ${delLabel} arasındaki bağlantı kaydını kaldırdı.`, 1);

      res.json({ success: true, changes: result.changes });
    } catch (err) {
      console.error('Silme hatası:', err);
      res.status(500).json({ error: err.message });
    }
  }),
);

// --- SEARCH ROUTE ---
app.get(
  '/api/search',
  authenticate,
  asyncHandler(async (req, res) => {
    const { q, filter } = req.query;
    if (!q) return res.json({ people: [], logs: [], media: [] });

    const query = `%${q}%`;
    const qLower = String(q).toLowerCase();
    const isActiveFilter = filter === 'active';

    const activeSql = isActiveFilter
      ? `AND (
      id IN (SELECT DISTINCT target_id FROM media)
      OR id IN (SELECT DISTINCT target_id FROM logs WHERE type = 'note')
    )`
      : '';

    let people;
    if (secure.isEncryptionEnabled()) {
      const allP = await db.all(`SELECT * FROM people WHERE 1=1 ${activeSql}`);
      people = allP.map((r) => secure.decryptPerson(r)).filter((p) => secure.personMatchesQuery(p, q)).slice(0, 10);
    } else {
      const peopleSql = `
    SELECT * FROM people 
    WHERE (
      display_name LIKE ? 
      OR username LIKE ? 
      OR id LIKE ?
      OR real_name LIKE ? 
      OR location LIKE ? 
      OR bio LIKE ?
      OR id IN (SELECT target_id FROM media WHERE note LIKE ?)
    )
    ${activeSql}
    LIMIT 10
  `;
      people = await db.all(peopleSql, [query, query, query, query, query, query, query]);
      people = people.map((r) => secure.decryptPerson(r));
    }

    let logs;
    if (secure.isEncryptionEnabled()) {
      const rawLogs = await db.all(`
    SELECT logs.*, people.display_name as target_name, people.avatar as target_avatar
    FROM logs 
    LEFT JOIN people ON logs.target_id = people.id
    WHERE type = 'note'
    LIMIT 200
  `);
      logs = rawLogs
        .map((l) => secure.decryptLog(l))
        .filter((l) => (l.content || '').toLowerCase().includes(qLower))
        .slice(0, 10);
    } else {
      logs = await db.all(
        `
    SELECT logs.*, people.display_name as target_name, people.avatar as target_avatar
    FROM logs 
    LEFT JOIN people ON logs.target_id = people.id
    WHERE content LIKE ? AND type = 'note'
    LIMIT 10
  `,
        [query],
      );
      logs = logs.map((l) => secure.decryptLog(l));
    }

    let media;
    if (secure.isEncryptionEnabled()) {
      const rawMedia = await db.all(`
    SELECT media.*, people.display_name as target_name, people.avatar as target_avatar
    FROM media
    LEFT JOIN people ON media.target_id = people.id
    LIMIT 200
  `);
      media = rawMedia
        .map((m) => secure.decryptMedia(m))
        .filter((m) => {
          const noteHit = (m.note || '').toLowerCase().includes(qLower);
          const peopleHit =
            (m.target_name || '').toLowerCase().includes(qLower) ||
            (m.target_avatar && String(m.target_avatar).toLowerCase().includes(qLower));
          return noteHit || peopleHit;
        })
        .slice(0, 5);
    } else {
      media = await db.all(
        `
    SELECT media.*, people.display_name as target_name, people.avatar as target_avatar
    FROM media
    LEFT JOIN people ON media.target_id = people.id
    WHERE media.target_id IN (
        SELECT id FROM people 
        WHERE display_name LIKE ? OR username LIKE ? OR id LIKE ? OR location LIKE ?
    ) OR media.target_id IN (
        SELECT target_id FROM logs 
        WHERE content LIKE ?
    ) OR media.note LIKE ?
    LIMIT 5
  `,
        [query, query, query, query, query, query],
      );
      media = media.map((m) => secure.decryptMedia(m));
    }

    res.json({ people, logs, media });
  }),
);

// Üretim: tek Node sürecinde Vite çıktısı (Render ücretsiz web service vb.; VPS gerekmez)
const distPath = path.join(__dirname, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
  const publicPath = path.join(__dirname, 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function ensurePeopleGeoColumns() {
  if (!db.USE_PG) return;
  try {
    await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION');
    await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION');
  } catch (e) {
    console.error('[DB] people.location_lat/location_lng:', e.message);
  }
}

ensurePeopleGeoColumns().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
