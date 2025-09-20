const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  user: 'bpipe',
  password: 'bpipe',
  database: 'bpipe'
});

async function test() {
  const ric = '.JKSE';
  const code = ric.toUpperCase().trim();

  try {
    const { rows } = await pool.query(`
      SELECT code_b, category1, stockname, last_price
      FROM stock_items
      WHERE TRIM(UPPER(code_b)) = $1
      LIMIT 1
    `, [code]);

    if (rows.length === 0) {
      console.warn(`❌ Tidak ditemukan: ${code}`);
    } else {
      console.log('✅ Data ditemukan:', rows[0]);
    }
  } catch (err) {
    console.error('❌ Query error:', err.message);
  } finally {
    await pool.end();
  }
}

test();
