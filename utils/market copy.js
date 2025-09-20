// utils/market.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../settings/market-hours.json');
let sessions = [];

function loadMarketHours() {
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    const json = JSON.parse(raw);
    sessions = json.sessions || [];
    console.log('✅ Market hours loaded:', sessions);
  } catch (err) {
    console.error('❌ Failed to load market hours:', err.message);
  }
}

function isMarketOpen() {
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  return sessions.some(session => {
    const [openH, openM] = session.open.split(':').map(Number);
    const [closeH, closeM] = session.close.split(':').map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;
    return minutesNow >= openMin && minutesNow < closeMin;
  });
}

function getMarketSessionSQL(alias = 't') {
  const whereClauses = [];
  const timeParams = [];

  sessions.forEach((s, i) => {
    const startParam = 2 + i * 2;
    const endParam = 3 + i * 2;

    whereClauses.push(`
      (
        ${alias}.tick_date >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Jakarta') + $${startParam}::time
        AND ${alias}.tick_date <= date_trunc('day', NOW() AT TIME ZONE 'Asia/Jakarta') + $${endParam}::time
      )
    `);

    timeParams.push(s.open, s.close);
  });

  return {
    where: whereClauses.join(' OR '),
    params: timeParams
  };
}


// Initial load
loadMarketHours();

// Watch for changes
fs.watchFile(FILE_PATH, { interval: 1000 }, () => {
  console.log('🔁 market-hours.json updated');
  loadMarketHours();
});

module.exports = {
  isMarketOpen,
  getMarketSessionSQL
};
