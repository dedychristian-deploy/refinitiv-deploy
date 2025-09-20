const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const CONFIG_PATH = path.join(__dirname, 'settings', 'server-config.json');

async function readConfigAndUpdateDB() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    const active = config.active?.toUpperCase();

    const updates = ['MAIN', 'BACKUP'].map(name => {
      const s = config.servers[name];
      return {
        name,
        host: s.hostname,
        port: s.port,
        user_api: s.user || null,
        app_id: s.appId || null,
        is_active: active === name
      };
    });

    for (const server of updates) {
      await pool.query(`
        INSERT INTO server_status (name, host, port, user_api, app_id, is_active, last_check)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (name) DO UPDATE SET 
          host = EXCLUDED.host,
          port = EXCLUDED.port,
          user_api = EXCLUDED.user_api,
          app_id = EXCLUDED.app_id,
          is_active = EXCLUDED.is_active,
          last_check = NOW()
      `, [
        server.name,
        server.host,
        server.port,
        server.user_api,
        server.app_id,
        server.is_active
      ]);
    }

    console.log(`✅ Config updated. ACTIVE → ${active}`);
  } catch (err) {
    console.error('❌ Gagal baca config.json atau update DB:', err.message);
  }
}

// Load pertama kali
readConfigAndUpdateDB();

// Watch kalau config.json berubah
fs.watchFile(CONFIG_PATH, { interval: 1000 }, () => {
  console.log('🔁 config.json berubah');
  readConfigAndUpdateDB();
});
