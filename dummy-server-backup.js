const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8181 });

console.log('🧪 Dummy WebSocket with 100 RICs running at ws://localhost:8181');

// Daftar saham realistis (ID 1–40)
const allRICs = [
  { ric: 'BBCA.JK', name: 'BANK CENTRAL ASIA' },
  { ric: 'BBRI.JK', name: 'BANK RAKYAT INDONESIA' },
  { ric: 'BMRI.JK', name: 'BANK MANDIRI' },
  { ric: 'TLKM.JK', name: 'TELKOM INDONESIA' },
  { ric: 'ASII.JK', name: 'ASTRA INTERNATIONAL' },
  { ric: 'UNVR.JK', name: 'UNILEVER INDONESIA' },
  { ric: 'ICBP.JK', name: 'INDOFOOD CBP' },
  { ric: 'INDF.JK', name: 'INDOFOOD SUKSES MAKMUR' },
  { ric: 'BBNI.JK', name: 'BANK NEGARA INDONESIA' },
  { ric: 'ANTM.JK', name: 'ANEKA TAMBANG' },
  { ric: 'ADRO.JK', name: 'ADARO ENERGY' },
  { ric: 'PGAS.JK', name: 'PERUSAHAAN GAS NEGARA' },
  { ric: 'PTBA.JK', name: 'BUKIT ASAM' },
  { ric: 'TINS.JK', name: 'TIMAH' },
  { ric: 'GGRM.JK', name: 'GUDANG GARAM' },
  { ric: 'HMSP.JK', name: 'HM SAMPOERNA' },
  { ric: 'BRPT.JK', name: 'BARITO PACIFIC' },
  { ric: 'MDKA.JK', name: 'MERDEKA COPPER GOLD' },
  { ric: 'MEDC.JK', name: 'MEDCO ENERGI' },
  { ric: 'BBKP.JK', name: 'BANK BUKOPIN' },
  { ric: 'WSKT.JK', name: 'WASKITA KARYA' },
  { ric: 'WIKA.JK', name: 'WIJAYA KARYA' },
  { ric: 'ADMR.JK', name: 'ADARO MINERAL' },
  { ric: 'SMGR.JK', name: 'SEMEN INDONESIA' },
  { ric: 'EXCL.JK', name: 'XL AXIATA' },
  { ric: 'ISAT.JK', name: 'INDOSAT OOREDOO' },
  { ric: 'AKRA.JK', name: 'AKR CORPORINDO' },
  { ric: 'ERAA.JK', name: 'ERAAJAYA SWASEMBADA' },
  { ric: 'UNTR.JK', name: 'UNITRACO' },
  { ric: 'CTRA.JK', name: 'CIPUTRA DEVELOPMENT' },
  { ric: 'PWON.JK', name: 'PAKUWON JATI' },
  { ric: 'SMRA.JK', name: 'SUMMARECON AGUNG' },
  { ric: 'BSDE.JK', name: 'BUMI SERPONG DAMAI' },
  { ric: 'ELSA.JK', name: 'ENERGI MEGA PERSADA' },
  { ric: 'INDY.JK', name: 'INDIKA ENERGY' },
  { ric: 'INTP.JK', name: 'INDOCEMENT' },
  { ric: 'INKP.JK', name: 'INDRA KARYA PUTRA' },
  { ric: 'KRAS.JK', name: 'KRAKATAU STEEL' },
  { ric: '.JKSE', name: 'IDX COMPOSITE' },
];

// Tambahkan dummy tambahan hingga 100
while (allRICs.length < 100) {
  const i = allRICs.length + 1;
  allRICs.push({
    ric: `DUMMY${i}.JK`,
    name: `DUMMY STOCK ${i}`
  });
}

function generateDummyTRJSON2() {
  const type = Math.random() < 0.3 ? "Refresh" : "Update";

  const data = allRICs.map(({ ric, name }) => {
    const price = parseFloat((1000 + Math.random() * 9000).toFixed(2));
    const change = parseFloat((Math.random() * 50 - 25).toFixed(2));
    const pct = parseFloat((change / price * 100).toFixed(2));
    const bid = parseFloat((price - Math.random() * 10).toFixed(2));
    const ask = parseFloat((price + Math.random() * 10).toFixed(2));
    const volume = Math.floor(Math.random() * 200000);

    return {
      Type: type,
      Key: { Name: ric },
      Fields: {
        DSPLY_NAME: name,
        TRDPRC_1: price,
        NETCHNG_1: change,
        PCTCHNG: pct,
        BID: bid,
        ASK: ask,
        ACVOL: volume
      }
    };
  });

  return JSON.stringify(data);
}

// Kirim data ke semua client setiap 3 detik
setInterval(() => {
  const payload = generateDummyTRJSON2();
  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, 3000);
