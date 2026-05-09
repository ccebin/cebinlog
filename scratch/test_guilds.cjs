const axios = require('axios');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const userId = '159985870458322944'; // Example ID

async function test() {
  try {
    const guildsRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${token}` }
    });
    const guilds = guildsRes.data;
    console.log(`Bot is in ${guilds.length} guilds.`);

    const mutualGuilds = [];
    for (const g of guilds) {
      try {
        const memberRes = await axios.get(`https://discord.com/api/v10/guilds/${g.id}/members/${userId}`, {
          headers: { Authorization: `Bot ${token}` }
        });
        if (memberRes.data) {
          mutualGuilds.push({
            id: g.id,
            name: g.name,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
          });
        }
      } catch (e) {
        // Not a member or error
      }
    }
    console.log('Mutual Guilds:', mutualGuilds);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
