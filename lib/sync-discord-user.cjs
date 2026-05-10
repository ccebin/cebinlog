const fs = require('fs');
const axios = require('axios');
const db = require('./db-adapter.cjs');
const secure = require('./secure-fields.cjs');

/** Discord kullanıcı ID’si beklenir (sayı dizisi); pratik snowflake uzunluğu 17–23 hane aralığı. */
function isDiscordUserSnowflake(id) {
  const s = String(id ?? '').trim();
  if (!/^\d+$/.test(s)) return false;
  return s.length >= 17 && s.length <= 23;
}

/** Discord User object: `clan` and `primary_guild` are APIUserPrimaryGuild (identity_guild_id, tag, badge), not full guild objects with id/name/icon. */
function guildTagFromDiscordUser(discordData) {
  const raw = discordData.clan || discordData.primary_guild;
  if (!raw) return null;
  if (raw.identity_guild_id) {
    const gid = raw.identity_guild_id;
    return {
      id: gid,
      name: raw.tag || 'Tag',
      icon: raw.badge ? `https://cdn.discordapp.com/clan-badges/${gid}/${raw.badge}.png` : null,
      is_clan: true,
    };
  }
  if (raw.id) {
    const gid = raw.id;
    const icon =
      raw.icon && !String(raw.icon).startsWith('http')
        ? `https://cdn.discordapp.com/icons/${gid}/${raw.icon}.png`
        : raw.icon || null;
    return {
      id: gid,
      name: raw.name || raw.tag || 'Guild',
      icon,
      is_clan: !!discordData.clan,
    };
  }
  return null;
}

/** Paneldeki «ID ile senkronize» ile aynı: Discord API + people upsert + sistem logları.
 * @param {{ triggeredByUserId?: number | null }} [options] — manuel senkronizasyonda operatörün kullanıcı id’si (log satırında görünür). Otomatik tarama için boş bırakın.
 */
async function syncUserData(id, options = {}) {
  const triggeredByUserId = options.triggeredByUserId != null ? options.triggeredByUserId : null;
  const sid = String(id ?? '').trim();
  if (!isDiscordUserSnowflake(sid)) {
    throw new Error(
      `Geçersiz Discord kullanıcı ID (17–23 haneli rakam olmalı). Bu kayıt muhtemelen bozuk veya kesilmiş; doğru snowflake ile yeniden ekleyin. Mevcut: «${sid}».`,
    );
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === 'YOUR_TOKEN_HERE') throw new Error('Bot token not configured');

  const oldRow = await db.get('SELECT * FROM people WHERE id = ?', [sid]);
  const oldData = oldRow ? secure.decryptPerson(oldRow) : null;

  const discordRes = await axios.get(`https://discord.com/api/v10/users/${sid}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  const discordData = discordRes.data;

  fs.appendFileSync(
    'discord_debug.log',
    `[${new Date().toISOString()}] User ${sid} Response: ${JSON.stringify(discordData)}\n`,
  );

  const autoGuilds = [];
  const tagEntry = guildTagFromDiscordUser(discordData);
  if (tagEntry) autoGuilds.push(tagEntry);

  const newDisplayName = discordData.global_name || discordData.username;
  const newGuildsStr = autoGuilds.length > 0 ? JSON.stringify(autoGuilds) : null;

  const changes = [];
  if (!oldData) {
    changes.push(JSON.stringify({ type: 'initial', message: 'Bu Discord kullanıcısı ilk kez kayıt altına alındı.' }));
  } else {
    if (oldData.username !== discordData.username) {
      changes.push(JSON.stringify({ type: 'username', old: oldData.username, new: discordData.username }));
    }
    if (oldData.display_name !== newDisplayName) {
      changes.push(JSON.stringify({ type: 'display_name', old: oldData.display_name, new: newDisplayName }));
    }
    if (oldData.avatar !== discordData.avatar) {
      changes.push(JSON.stringify({ type: 'avatar', old: oldData.avatar, new: discordData.avatar, userId: sid }));
    }
    if (oldData.banner !== discordData.banner) {
      changes.push(JSON.stringify({ type: 'banner', old: oldData.banner, new: discordData.banner, userId: sid }));
    }

    const oldGuildsStr = oldData.guilds;
    if (oldGuildsStr !== newGuildsStr) {
      const oldGuilds = oldGuildsStr ? JSON.parse(oldGuildsStr) : [];
      const newGuilds = autoGuilds;
      changes.push(JSON.stringify({ type: 'guild', old: oldGuilds[0] || null, new: newGuilds[0] || null }));
    }
  }

  const pf = secure.encryptPersonFields(discordData.bio || '', null, null);

  await db.run(
    `
    INSERT INTO people (id, username, display_name, avatar, banner, decoration, guilds, bio, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      avatar = excluded.avatar,
      banner = excluded.banner,
      decoration = excluded.decoration,
      guilds = excluded.guilds,
      bio = excluded.bio,
      last_updated = CURRENT_TIMESTAMP
  `,
    [
      sid,
      discordData.username,
      newDisplayName,
      discordData.avatar,
      discordData.banner,
      discordData.avatar_decoration_data?.asset,
      newGuildsStr,
      pf.bio,
    ],
  );

  if (changes.length > 0) {
    for (const c of changes) {
      await db.run('INSERT INTO logs (target_id, type, content, user_id, is_admin_only) VALUES (?, ?, ?, ?, ?)', [
        sid,
        'system',
        secure.encryptLogFields(c, undefined, undefined).content,
        triggeredByUserId,
        1,
      ]);
    }
  }

  return { guilds: autoGuilds, changes, isNew: !oldData };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Tek kullanıcı GET’inde 429 gelirse Reset-After / retry-after ile tekrar dener (Discord’un önerdiği gibi).
 */
async function syncUserDataWithBackoff(id, maxRetries = 12, options = {}) {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      return await syncUserData(id, options);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempts < maxRetries) {
        const h = err.response.headers || {};
        const resetMs = parseFloat(h['x-ratelimit-reset-after']) * 1000;
        const retryAfterMs =
          Number.isFinite(resetMs) && resetMs > 0
            ? resetMs
            : (parseFloat(h['retry-after']) || 1) * 1000 || 1100 + Math.random() * 200;
        await sleep(Math.ceil(Math.min(Math.max(retryAfterMs, 100), 60_000)));
        attempts++;
        continue;
      }
      throw err;
    }
  }
  throw new Error('rate limit retries exhausted');
}

/**
 * Liste halinde paralel güncelleme (Discord tek endpoint; ama paralel çağrılarla süre düşer).
 * SQLite uyumluluğu: yerel SQLite’ta concurrency 1 yapın (SQLite busy riski).
 * @param {string[]} ids
 * @param {{ concurrency?: number, pauseBetweenChunksMs?: number }} [options]
 * @returns {Promise<Array<{ id: string, ok: boolean, syncResult?: object, error?: Error | unknown }>>}
 */
async function bulkSyncDiscordUsers(ids, options = {}) {
  const uniq = [...new Set((ids || []).map((x) => String(x ?? '').trim()))].filter(Boolean);
  const parsed = parseInt(process.env.DISCORD_SYNC_CONCURRENCY || `${db.USE_PG ? 12 : 1}`, 10);
  const conc = Number.isFinite(options.concurrency)
    ? Math.min(40, Math.max(1, options.concurrency))
    : Math.min(40, Math.max(1, Number.isFinite(parsed) ? parsed : db.USE_PG ? 12 : 1));

  const pauseMs = typeof options.pauseBetweenChunksMs === 'number' ? options.pauseBetweenChunksMs : 0;

  const out = [];
  for (let i = 0; i < uniq.length; i += conc) {
    const chunk = uniq.slice(i, i + conc);
    const settled = await Promise.allSettled(chunk.map((id) => syncUserDataWithBackoff(id, 12, options)));
    settled.forEach((s, idx) => {
      const id = chunk[idx];
      if (s.status === 'fulfilled') out.push({ id, ok: true, syncResult: s.value });
      else out.push({ id, ok: false, error: s.reason });
    });
    if (pauseMs > 0 && i + conc < uniq.length) await sleep(pauseMs);
  }
  return out;
}

module.exports = {
  syncUserData,
  guildTagFromDiscordUser,
  syncUserDataWithBackoff,
  bulkSyncDiscordUsers,
  isDiscordUserSnowflake,
};
