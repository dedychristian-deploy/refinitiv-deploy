const WebSocket = require('ws');
const {
  //updateServerStatus,
  insertHistory,
  updateIfExists,
  ricExists
} = require('./db');

function isMarketOpen() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMinutes = h * 60 + m;
  const open1 = 9 * 60;
  const close1 = 12 * 60;
  const open2 = 13 * 60 + 30;
  const close2 = 18 * 60 + 49;
  return (totalMinutes >= open1 && totalMinutes < close1) ||
         (totalMinutes >= open2 && totalMinutes < close2);
}

const source = 'MAIN'; // atau BACKUP

// ===== History buffer (global) =====
let historyBuffer = [];
function pushHistory({ code_b, tick_date, last_price, change1, percent_change, bid, ask, acc_volume}) {

  historyBuffer.push([String(code_b).toUpperCase(), new Date(), last_price ?? null, change1 ?? null, percent_change ?? null, bid ?? null,ask ?? null,acc_volume ?? null]);
}
// Flush tiap 2 detik
setInterval(async () => {
  if (historyBuffer.length === 0) return;
  const batch = historyBuffer.splice(0, historyBuffer.length);
  try {
    await insertHistory(batch);
    console.log(`💾 Saved ${batch.length} rows to stock_history`);
  } catch (err) {
    console.error('❌ insertHistory error:', err.message);
  }
}, 2000);
// ===================================

function startClient() {
  const ws = new WebSocket('ws://localhost:8080');

  ws.on('open', async () => {
    console.log(`✅ Connected to WebSocket as [${source}]`);
    //await updateServerStatus(source, 'Online');
  });

  ws.on('message', async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch { return; }
    if (!Array.isArray(data)) return;

    for (const entry of data) {
      const f = entry?.Fields || {};
      const code_b = entry?.Key?.Name;
      if (!code_b) continue;

      const exists = await ricExists(code_b);
      if (!exists) continue; // ⛔ Lewati kalau RIC belum diinput manual

      const stock = {
        code_b,
        stockname: null,
        last_price: f.TRDPRC_1 ?? null,
        change1: f.NETCHNG_1 ?? null,
        percent_change: f.PCTCHNG ?? null,
        bid: f.BID ?? null,
        ask: f.ASK ?? null,
        acc_volume: f.ACVOL ?? null,
        source,
        abbrl: f.DSPLY_NAME ?? null,
      };

      await updateIfExists(stock);
      pushHistory({
  code_b,
  last_price: stock.last_price,
  change1: stock.change1,
  percent_change: stock.percent_change,
  bid: stock.bid,
  ask: stock.ask,
  acc_volume: stock.acc_volume
});

      console.log(`📩 [${source}] ${code_b} = ${stock.abbrl}`);
    }
  });

  ws.on('close', async () => {
    console.warn(`⚠️ ${source} disconnected. Reconnecting in 5s...`);
   // await updateServerStatus(source, 'Offline');
    setTimeout(startClient, 5000);
  });

  ws.on('error', async (err) => {
    console.error(`❌ ${source} error:`, err.message);
    //await updateServerStatus(source, 'Offline');
  });

  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30000);
}

startClient();
