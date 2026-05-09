const axios = require('axios');
require('dotenv').config();

const token = process.env.DISCORD_BOT_TOKEN;
const userId = '159985870458322944';

async function test() {
  try {
    // Note: This is an internal endpoint
    const res = await axios.get(`https://discord.com/api/v10/users/${userId}/profile`, {
      headers: { Authorization: `Bot ${token}` }
    });
    console.log('Profile Data:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error:', err.response?.status, err.response?.data || err.message);
  }
}

test();
