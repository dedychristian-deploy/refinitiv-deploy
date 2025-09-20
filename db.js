// db.js
const { Pool } = require('pg');
const dayjs = require("dayjs");
require('dotenv').config();

//const pool = new Pool({
  //user: 'bpipe',
  //host: '127.0.0.1',
  //database: 'bpipe',
  //password: 'bpipe',
  //port: 5432,
//});

const pool = new Pool({
 host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const U = s => String(s || '').trim().toUpperCase();
const NN = v => (v === undefined ? null : v);

async function ricExists(ric) {
  const clean = U(ric).trim();
  //console.log('🔍 ricExists:', { original: ric, clean });

  const { rows } = await pool.query(
    'SELECT 1 FROM stock_items WHERE trim(code_b) = $1',
    [clean]
  );

  if (rows.length === 0) {
    console.warn('❌ NOT FOUND in DB:', `"${clean}"`);
  }

  return rows.length > 0;
}


// db.js
async function getStockMeta(code_b) {
  try {
    if (!code_b || typeof code_b !== 'string') {
      console.warn(`⚠️ getStockMeta dipanggil dengan nilai tidak valid:`, code_b);
      return {};
    }

    const code = code_b.toUpperCase().trim();

    const { rows } = await pool.query(`
      SELECT code_b, category1, stockname, last_price
      FROM stock_items
      WHERE TRIM(UPPER(code_b)) = $1
      LIMIT 1
    `, [code]);

    return rows[0] || {};
  } catch (err) {
    console.error('❌ getStockMeta Error:', err.message);
    return {};
  }
}








// ✅ Update only (jika RIC ada)
// ✅ Dynamic-safe update untuk hanya field yang ada
async function updateIfExists(stock) {
  const nowStr = dayjs().format("YYYY-MM-DD HH:mm:ss.SSS");
  const ric = U(stock.code_b);
  const updates = [];
  const values = [];
  let i = 2; // mulai dari $2 karena $1 = ric

  const map = {
    last_price: 'last_price',
    change1: 'change1',
    percent_change: 'percent_change',
    bid: 'bid',
    ask: 'ask',
    acc_volume: 'acc_volume',
    abbrl: 'abbrl',
  };

  for (const [key, column] of Object.entries(map)) {
    if (stock[key] !== undefined) {
      updates.push(`${column} = $${i}`);
      values.push(stock[key]);
      i++;
    }
  }

  // Jika tidak ada field yang bisa diupdate, keluar
  if (updates.length === 0) return 0;

  // Tambahkan updated_at
  updates.push(`update_date_time = $${i}`);
values.push(nowStr);


  const sql = `
    UPDATE stock_items
    SET ${updates.join(', ')}
    WHERE code_b = $1
  `;

  try {
    const res = await pool.query(sql, [ric, ...values]);
    return res.rowCount;
  } catch (err) {
    console.error('❌ updateIfExists Error:', err.message);
  }
}



// ⚠️ OPSIONAL: Upsert (kalau suatu saat mau auto insert). JANGAN dipakai untuk strict mode.
async function upsertStock({ ric, name, price, change, pct, bid, ask, volume, source }) {
  const nowStr = dayjs().format("YYYY-MM-DD HH:mm:ss.SSS");
  try {
    await pool.query(`
      INSERT INTO stock_items
        (code_b, stockname, last_price, change1, percent_change,
         bid, ask, acc_volume, source, update_date_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (stock_id) DO UPDATE
      SET stockname = COALESCE(EXCLUDED.stockname, stock_items.stockname),
          last_price  = EXCLUDED.last_price,
          change1  = EXCLUDED.change1,
          percent_change  = EXCLUDED.percent_change,
          bid         = EXCLUDED.bid,
          ask         = EXCLUDED.ask,
          acc_volume      = EXCLUDED.acc_volume,
          source      = EXCLUDED.source,
          update_date_time  = nowStr;
    `, [U(ric), NN(name), NN(price), NN(change), NN(pct), NN(bid), NN(ask), NN(volume), NN(source)]);
  } catch (err) {
    console.error('❌ upsertStock Error:', err.message);
  }
}

// ✅ Cek cepat apakah RIC sudah ada (buat /add)



async function insertHistory(rows) {
  if (!rows || rows.length === 0) return;

  // Ambil map: code_b ➜ stock_id dari stock_items
  const result = await pool.query('SELECT stock_id, code_b FROM stock_items');
  const stockMap = new Map(result.rows.map(r => [r.code_b.toUpperCase(), r.stock_id]));

  // Filter dan ubah code_b jadi stock_id
  const filtered = rows
    .map(r => {
      const stockId = stockMap.get(String(r[0]).toUpperCase());
      if (!stockId) return null;
      return [
        stockId,        // ✅ stock_id
        r[1],           // tick_date
        r[2],           // last_price
        r[3],           // change1
        r[4],           // percent_change
        r[5],           // bid
        r[6],           // ask
        r[7]            // acc_volume
      ];
    })
    .filter(r => r !== null);

  if (filtered.length === 0) return;

  // Susun placeholder untuk query
  const values = filtered.map(
    (_, i) =>
      `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
  ).join(',');

  const flat = filtered.flat();

  // Insert ke tabel tick
  try {
    await pool.query(
      `INSERT INTO tick (
        stock_id, tick_date, last_price, change1, percent_change, bid, ask, acc_volume
      ) VALUES ${values}`,
      flat
    );
  } catch (err) {
    console.error('❌ insertHistory Error:', err.message);
  }
}

// Bulk upsert data dari server (Refinitiv / dummy), TANPA menimpa custom_name
async function bulkUpsertStocks(dataArray) {
  const values = dataArray.map(d => [
    d.ric?.toUpperCase() ?? null,
    d.custom_name ?? null,
    d.price ?? null,
    d.change ?? null,
    d.pct ?? null,
    d.bid ?? null,
    d.ask ?? null,
    d.volume ?? null,
    d.source ?? null,
    d.refinitiv_name ?? null
  ]);

  const flat = values.flat(); 

  const query = `
    INSERT INTO stock_items (code_b, stockname, last_price, change1, percent_change,
      bid, ask, acc_volume, source)
    VALUES ${values.map((_, i) =>
      `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5},
         $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
    ).join(', ')}
    ON CONFLICT (stock_id) DO UPDATE SET
      last_price  = EXCLUDED.last_price,
          change1  = EXCLUDED.change1,
          percent_change  = EXCLUDED.percent_change,
          bid         = EXCLUDED.bid,
          ask         = EXCLUDED.ask,
          acc_volume      = EXCLUDED.acc_volume,
          source      = EXCLUDED.source,
          update_date_time = NOW()


  `;

  // update_date_time = $<paramIndex>

  try {
    await pool.query(query, flat);
  } catch (err) {
    console.error('❌ bulkUpsertStocks Error:', err.message);
  }
}

// ✅ Ambil semua RIC (code_b) dari stock_items
async function getAllRICs() {
  try {
    const result = await pool.query('SELECT code_b FROM stock_items ORDER BY code_b');
    return result.rows.map(row => row.code_b.toUpperCase());
  } catch (err) {
    console.error('❌ getAllRICs Error:', err.message);
    return [];
  }
}

async function insertRICIfNotExists(code_b, refinitivName = null) {
  try {
    await pool.query(`
      INSERT INTO stock_items (code_b, stockname, update_date_time)
      VALUES ($1, $2, NOW())
      ON CONFLICT (code_b) DO NOTHING
    `, [String(code_b).toUpperCase(), refinitivName]);
  } catch (err) {
    console.error('❌ insertRICIfNotExists Error:', err.message);
  }
}





//status server

async function updateServerStatus(name, status) {
  try {
    await pool.query(
      `UPDATE server_status
       SET status = $1, last_check = NOW()
       WHERE name = $2`,
      [status, name]
    );
    console.log(`📡 [${name}] → ${status}`);
  } catch (err) {
    console.error("❌ updateServerStatus error:", err.message);
  }
}


module.exports = {
  pool,
  insertHistory,
  ricExists,
  updateIfExists,
  upsertStock,
  bulkUpsertStocks,
  getAllRICs,
  updateServerStatus,
  insertRICIfNotExists,
  getStockMeta   // get stockmeta
};

