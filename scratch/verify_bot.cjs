const axios = require('axios');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;

async function test() {
  try {
    const res = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` }
    });
    console.log('Bot User:', res.data.username, '#', res.data.discriminator);
    
    const guildsRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${token}` }
    });
    console.log(`Bot is in ${guildsRes.data.length} guilds.`);
    if (guildsRes.data.length > 0) {
        console.log('Guilds:', guildsRes.data.map(g => g.name).join(', '));
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

test();
