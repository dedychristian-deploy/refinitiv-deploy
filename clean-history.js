const { pool } = require('./db');
const argv = require('optimist').argv;

// Ambil argumen dari command line
const days = parseInt(argv.days) || 1; // default 1 hari

async function cleanOldHistory() {
  try {
    const result = await pool.query(`
      DELETE FROM stock_history
      WHERE ts < NOW() - INTERVAL '${days} days'
    `);
    console.log(`🧹 Deleted ${result.rowCount} old rows (older than ${days} day(s))`);
  } catch (err) {
    console.error("❌ Error cleaning stock_history:", err.message);
  }
}

// Pertama kali langsung jalan
cleanOldHistory();

// Lalu jalan ulang setiap 1 jam
setInterval(cleanOldHistory, 60 * 60 * 1000);
