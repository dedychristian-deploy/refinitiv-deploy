const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

console.log('🧪 Dummy WebSocket with 100 RICs running at ws://localhost:8080');

// 🔖 Mapping price field by keyword
function getPriceFieldFromRIC(ric) {
  if (/FR|PBS|=RR/.test(ric)) return 'PRIMACT_1';     // Obligasi SBN
  if (/=IDR|IDR=|JPY=/.test(ric)) return 'MID_PRICE';  // FX pair
  if (/BOND_OTC/.test(ric)) return 'SEC_ACT_1';   // Bond OTC
  return 'TRDPRC_1';                               // Default saham
}

// 📦 Dummy list awal
const allRICs = [
  //{ ric: 'BBRM.JK', name: 'BANK CENTRAL ASIA' },
  //{ ric: 'BBSI.JK', name: 'BANK RAKYAT INDONESIA' },
  { ric: 'ID5YT=RR', name: 'SBN FIXED RATE 0087' },
  { ric: 'ID10YT=RR', name: 'SBN FIXED RATE 0087' },
  { ric: 'ID15YT=RR', name: 'SBN FIXED RATE 0087' },
  { ric: 'IDR=', name: 'USD/IDR' },
  { ric: 'JPY=', name: 'JPY/IDR' },
  { ric: '.JKSE', name: 'IDX COMPOSITE' },
];

// Tambahkan dummy hingga 100


// 🔄 Generate dummy message
function generateDummyTRJSON2() {
  const type = Math.random() < 0.3 ? "Refresh" : "Update";

  const data = allRICs.map(({ ric, name }) => {
    const price = parseFloat((1000 + Math.random() * 9000).toFixed(2));
    const change = parseFloat((Math.random() * 50 - 25).toFixed(2));
    const pct = parseFloat((change / price * 100).toFixed(2));
    const bid = parseFloat((price - Math.random() * 10).toFixed(2));
    const ask = parseFloat((price + Math.random() * 10).toFixed(2));
    const volume = Math.floor(Math.random() * 200000);

    const fields = {
      DSPLY_NAME: name,
      NETCHNG_1: change,
      PCTCHNG: pct,
      BID: bid,
      ASK: ask,
      ACVOL: volume
    };

    const priceField = getPriceFieldFromRIC(ric);
    fields[priceField] = price;

    return {
      Type: type,
      Key: { Name: ric },
      Fields: fields
    };
  });

  return data;
}

// 🚀 Kirim dan log ke console tiap 3 detik
setInterval(() => {
  const data = generateDummyTRJSON2();
  const payload = JSON.stringify(data);
  
  // Tampilkan ke console (pretty-print)
  console.log(`📤 ${new Date().toLocaleTimeString()} - Sending ${data.length} RICs`);
  console.log(JSON.stringify(data, null, 2));

  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 3000);
