const { pool } = require('./db');

const stocks = [
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
  { ric: 'ELSA.JK', name: 'ENERGI MEGA PERSADA' }
];

async function insertStocks() {
  for (const stock of stocks) {
    try {
      const exists = await pool.query(
        'SELECT 1 FROM stock_items WHERE code_b = $1',
        [stock.ric]
      );

      if (exists.rows.length === 0) {
        await pool.query(`
          INSERT INTO stock_items (
            code_b, stockname, last_price, change1, percent_change,
            bid, ask, acc_volume, ticker_active
          ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0)
        `, [stock.ric, stock.name]);

        console.log(`✅ Inserted: ${stock.ric}`);
      } else {
        console.log(`ℹ️  Skipped (exists): ${stock.ric}`);
      }
    } catch (err) {
      console.error(`❌ Error for ${stock.ric}:`, err.message);
    }
  }

  console.log('✅ Done inserting stock list.');
}

insertStocks();
