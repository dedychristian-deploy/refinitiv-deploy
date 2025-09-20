// client-refinitiv-batch.js
const fs = require('fs');
const WebSocket = require('ws');
const ip = require("ip");
const { isMarketOpen } = require('./utils/market');
const {
  getAllRICs,
  insertRICIfNotExists,
  updateIfExists,
  insertHistory,
  updateServerStatus,
  ricExists,
  getStockMeta 
} = require('./db');

const CONFIG_PATH = './settings/server-config.json';
const SOURCE_NAME = 'CLIENT-REFINITIV';
let websocket = null;
let lastDataTime = Date.now();


// Buffer untuk history insert
let historyBuffer = [];
function pushHistory({ code_b, last_price, change1, percent_change, bid, ask, acc_volume }) {
  historyBuffer.push([
    String(code_b).toUpperCase(), new Date(), last_price ?? null,
    change1 ?? null, percent_change ?? null,
    bid ?? null, ask ?? null, acc_volume ?? null
  ]);
}

setInterval(async () => {
  if (historyBuffer.length === 0) return;
  const batch = historyBuffer.splice(0, historyBuffer.length);
  try {
    await insertHistory(batch);
    //console.log(`💾 Saved ${batch.length} rows to stock_history`);
  } catch (err) {
    console.error('❌ insertHistory error:', err.message);
  }
}, 2000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function batchRICs(list, size = 2500) {
  const batches = [];
  for (let i = 0; i < list.length; i += size) {
    batches.push(list.slice(i, i + size));
  }
  return batches;
}

function connect() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const server = config.servers?.[config.active];
  if (!server) {
    console.error("❌ Server config tidak ditemukan.");
    return;
  }

  const { hostname, port, appId, user } = server;
  const position = ip.address();
  const WS_URL = `ws://${hostname}:${port}/WebSocket`;

  console.log(`🔌 Connecting to Refinitiv [${SOURCE_NAME}] ${WS_URL}`);
  websocket = new WebSocket(WS_URL, "tr_json2");

  const timeout = setTimeout(() => {
    if (websocket && websocket.readyState !== WebSocket.OPEN) {
      console.warn("⏳ Timeout. Forcing close...");
      websocket.terminate();
      websocket = null;
    }
  }, 5000);

  websocket.onopen = async () => {
    clearTimeout(timeout);
    console.log("✅ Connected to Refinitiv");
    await updateServerStatus(SOURCE_NAME, 'RUNNING');

    const loginMsg = {
      ID: 1,
      Domain: "Login",
      Key: {
        Name: user,
        Elements: {
          ApplicationId: appId,
          Position: position
        }
      }
    };
    websocket.send(JSON.stringify(loginMsg));
    console.log("SENT LOGIN:", JSON.stringify(loginMsg));
  };

  websocket.onmessage = async (evt) => {
    try {
      const messages = JSON.parse(evt.data.toString());
     // console.log(messages);
      for (const msg of messages) await handleMessage(msg);
    } catch (err) {
      console.error("❌ Parse error:", err.message);
    }
  };

  websocket.onerror = (evt) => {
    console.error("❌ WebSocket Error:", evt?.message || evt);
  };

  websocket.onclose = async () => {
    console.warn("⚠️ WebSocket Closed.");
    await updateServerStatus(SOURCE_NAME, 'CLOSED');
    setTimeout(connect, 5000);
  };
}
//category
function getPriceField(category1) {
  switch ((category1 || '').toUpperCase()) {
    case "IDX": return "TRDPRC_1";
    case "BOND": return "PRIMACT_1";
    case "SBN": return "PRIMACT_1";
    case "FX": return "MID_PRICE";
    case "BOND_OTC": return "SEC_ACT_1";
    case "SAHAM": return "TRDPRC_1";
    default: return "TRDPRC_1";
  }
}

async function handleMessage(msg) {
  const type = msg.Type;
  const f = msg.Fields || {};
  //const ric = msg?.Key?.Name;
  const ric = (msg?.Key?.Name || '').toUpperCase().trim();


  if (type === "Ping") {
    websocket.send(JSON.stringify({ Type: "Pong" }));
    console.log("SENT PONG");
    return;
  }

  if (type === "Refresh" && msg.Domain === "Login") {
    const state = msg.State;
    if (state?.Stream === "Closed" || state?.Code === "AccessDenied" || state?.Code === "NotEntitled") {
      console.error(`❌ LOGIN GAGAL: ${state?.Code} - ${state?.Text}`);
      await updateServerStatus(SOURCE_NAME, 'LOGIN_FAILED');
      websocket.close();
      return;
    }
    console.log("✅ LOGIN OK");
    await sendMarketPriceBatches();
    return;
  }

  if (!ric || (type !== "Refresh" && type !== "Update")) return;
  lastDataTime = Date.now();

  const exists = await ricExists(ric);
  if (!exists) return;

  const stock = {
    code_b: ric,
    source: SOURCE_NAME
  };

 let category1;
try {
  const meta = await getStockMeta(ric);
  category1 = meta.category1; // <-- AMBIL NILAINYA DI SINI
} catch (err) {
  console.warn(`⚠️ Gagal ambil category1 untuk ${ric}`);
  return; // SKIP jika error
}


  const priceField = getPriceField(category1);

  // 💰 Ambil harga sesuai kategori
  if (f[priceField] !== undefined) stock.last_price = f[priceField];
  if ('NETCHNG_1' in f) stock.change1 = f.NETCHNG_1;
  if ('PCTCHNG' in f) stock.percent_change = f.PCTCHNG;
  if ('BID' in f) stock.bid = f.BID;
  if ('ASK' in f) stock.ask = f.ASK;
  if ('ACVOL' in f) stock.acc_volume = f.ACVOL;
  if ('DSPLY_NAME' in f) stock.abbrl = f.DSPLY_NAME;

  const hasValidData =
    stock.last_price !== null ||
    stock.change1 !== null ||
    stock.percent_change !== null ||
    stock.bid !== null ||
    stock.ask !== null ||
    stock.acc_volume !== null;

  if (!hasValidData) {
    console.log(`⏭ Skip update: ${ric} semua field kosong`);
    return;
  }

await updateIfExists(stock); // ✅ Selalu update last data ke DB

if (isMarketOpen() && (f[priceField] !== undefined || 'ACVOL' in f)) {
  try {
    pushHistory(stock); // ✅ Simpan history hanya saat market buka
  } catch (err) {
    console.warn(`⚠️ Gagal push history untuk ${ric}:`, err.message);
  }
}

}


async function sendMarketPriceBatches() {
  const rics = await getAllRICs();
  if (!rics || rics.length === 0) return;

  const batches = batchRICs(rics);
  for (let i = 0; i < batches.length; i++) {
    const batchMsg = {
      ID: 100 + i,
      Domain: "MarketPrice",
      Key: {
        Name: batches[i],
        Service: "ELEKTRON_service"
      },
      View: [
  "TRDPRC_1",     // Saham, IDX
  "PRIMACT_1",    // Bond, SBN
  "SEC_ACT_1",    // Bond OTC
  "MID_PRICE",    // FX
  "NETCHNG_1", "PCTCHNG", "BID", "ASK", "ACVOL", "DSPLY_NAME"
]

    };
    websocket.send(JSON.stringify(batchMsg));
    //console.log(`📤 Sent batch ${i + 1} with ${batches[i].length} RIC`);
    await sleep(1000);
  }
}

//setInterval(() => {
//  if (websocket?.readyState === WebSocket.OPEN) {
//    sendMarketPriceBatches();
//  }
//}, 30000);

setInterval(async () => {
  if (websocket?.readyState === WebSocket.OPEN) {
    await updateServerStatus(SOURCE_NAME, 'RUNNING');
  }
}, 10000);

setInterval(() => {
  const idleMs = Date.now() - lastDataTime;

  if (idleMs > 120000) { // 2 menit gak ada data
    console.warn(`⚠️ No RIC update for 2 min at ${new Date().toISOString()}. Reconnecting...`);
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.terminate(); // trigger reconnect (akan auto connect lagi)
    }
  }
}, 30000); // cek tiap 30 detik


connect();

fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => {
  console.log("📝 Detected change in server-config.json → reconnecting...");
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.terminate(); // ⬅️ onclose() akan otomatis panggil connect() lagi
  } else {
    connect(); // kalau belum open, langsung connect
  }
});


module.exports = {
  sendMarketPriceBatches
};

// ============== RECONNECT TRIGGER VIA REST =================
const express = require('express');
const triggerApp = express();
triggerApp.use(express.json());

let reconnecting = false;

triggerApp.post('/api/trigger-reconnect', (req, res) => {
  if (reconnecting) {
    return res.json({ success: false, message: '⚠️ Reconnect already in progress' });
  }
  reconnecting = true;

  console.log("♻️ Reconnect triggered from backend");

  try {
    if (websocket?.readyState === WebSocket.OPEN) {
      // kalau masih terbuka, terminate → onclose → connect() lagi
      websocket.terminate();
    } else {
      // kalau CLOSED atau belum ada, langsung connect()
      connect();
    }

    res.json({ success: true, message: 'Reconnect triggered' });
  } catch (err) {
    console.error("❌ Reconnect error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    // reset flag setelah 5 detik biar gak double trigger
    setTimeout(() => { reconnecting = false; }, 5000);
  }
});

triggerApp.listen(9910, () => {
  console.log("🚀 Reconnect trigger listening on http://localhost:9910/api/trigger-reconnect");
});

