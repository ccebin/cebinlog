const db = require('../database.cjs');
const axios = require('axios');
require('dotenv').config();
const path = require('path');
const botToken = process.env.DISCORD_BOT_TOKEN;

console.log('Bot Token Loaded:', botToken ? 'Yes (starts with ' + botToken.substring(0, 5) + '...)' : 'No');

async function syncUserData(id) {
    try {
        const discordRes = await axios.get(`https://discord.com/api/v10/users/${id}`, {
            headers: { Authorization: `Bot ${botToken}` }
        });
        const discordData = discordRes.data;

        const autoGuilds = [];
        const raw = discordData.clan || discordData.primary_guild;
        if (raw && raw.identity_guild_id) {
            const gid = raw.identity_guild_id;
            autoGuilds.push({
                id: gid,
                name: raw.tag || 'Tag',
                icon: raw.badge ? `https://cdn.discordapp.com/clan-badges/${gid}/${raw.badge}.png` : null,
                is_clan: true
            });
        } else if (raw && raw.id) {
            const gid = raw.id;
            autoGuilds.push({
                id: gid,
                name: raw.name || raw.tag || 'Guild',
                icon: raw.icon && !String(raw.icon).startsWith('http')
                    ? `https://cdn.discordapp.com/icons/${gid}/${raw.icon}.png`
                    : raw.icon || null,
                is_clan: !!discordData.clan
            });
        }

        const newDisplayName = discordData.global_name || discordData.username;
        const newGuildsStr = autoGuilds.length > 0 ? JSON.stringify(autoGuilds) : null;

        db.prepare(`
            UPDATE people SET
                username = ?,
                display_name = ?,
                avatar = ?,
                banner = ?,
                decoration = ?,
                guilds = ?,
                bio = ?,
                last_updated = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            discordData.username,
            newDisplayName,
            discordData.avatar,
            discordData.banner,
            discordData.avatar_decoration_data?.asset,
            newGuildsStr,
            discordData.bio || '',
            id
        );

        console.log(`[Synced] ${id} - @${discordData.username}`);
        return true;
    } catch (err) {
        console.error(`[Error] ${id}: ${err.response?.status || err.message}`);
        return false;
    }
}

async function main() {
    // Find people with placeholder names (User [ID])
    const people = db.prepare("SELECT id FROM people WHERE display_name LIKE 'User %'").all();
    console.log(`Found ${people.length} people to sync.`);

    for (let i = 0; i < people.length; i++) {
        const p = people[i];
        console.log(`[${i+1}/${people.length}] Syncing ${p.id}...`);
        await syncUserData(p.id);
        
        // Wait 1 second between requests to be safe
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('Bulk sync completed.');
}

main();
