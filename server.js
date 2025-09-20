// server.js - PIPEBRIDGE BACKEND
// ----------------------------------------
// Express.js backend server untuk PipeBridge
// Mengatur route, API, config dan output Vizrt

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { pool } = require('./db'); // koneksi ke PostgreSQL

const app = express();
const PORT = 3000;
const CONFIG_PATH = './settings/server-config.json';
const { sendMarketPriceBatches } = require('./client-refinitiv-cnbc');

// Ini penting banget
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==== SETUP EJS & PUBLIC FOLDER ====

//app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // mendukung FormData dan JSON

//===== LOGIN
app.use(session({
  secret: 'rahasia_kamu', // ganti dengan secret string yang aman
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 jam
}));

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login'); // atau bisa return res.status(401).send('Unauthorized')
  }
  next();
}


const bcrypt = require('bcrypt');

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  //console.log('📥 Login Attempt:', username, password);

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    //console.log('🎯 DB Result:', result.rows);

    if (result.rows.length === 0) {
      // ❗ Selalu kirim dua-duanya: error & message
      return res.render('login', { error: '❌ Username tidak ditemukan', message: '' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    console.log('🔐 Password Match?', match);

    if (!match) {
      return res.render('login', { error: '', message: '❌ Password salah' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    res.redirect('/');
  } catch (err) {
    console.error('❌ Login Error:', err.message);
    res.status(500).send('❌ Gagal login');
  }
});


app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const message = req.query.message || '';
  res.render('login', { message, error: '' }); // ✅ Tambahkan error kosong
});



// ===== ROUTE UTAMA (UI dashboard utama) =====
//app.get('/', async (req, res) => {
//  try {
//    const stocks = await pool.query('SELECT * FROM stock_items ORDER BY stock_id DESC');
//    const { msg, type } = req.query;
//    res.render('index', {
//      rows: stocks.rows,
//      message: msg || '',
//      messageType: type || ''
//    });
//  } catch (err) {
//    res.status(500).send('❌ Error: ' + err.message);
//  }
//});

//===========dengan login
app.get('/', requireLogin, async (req, res) => {
  try {
    const stocks = await pool.query('SELECT * FROM stock_items ORDER BY stock_id DESC');
    const { msg, type } = req.query;
    res.render('index', {
      rows: stocks.rows,
      message: msg || '',
      messageType: type || ''
    });
  } catch (err) {
    res.status(500).send('❌ Error: ' + err.message);
  }
});


// ===== API: Get semua stock_items =====
app.get('/api/stocks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stock_items ORDER BY stock_id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ===== API: Tambah RIC baru =====
// ===== API: Tambah RIC baru =====
app.post('/add', async (req, res) => {
  const { code_b, stockname, category1 } = req.body;
  const ticker_active = req.body.ticker_active ? 1 : 0;

  try {
    if (!code_b || !stockname) {
      return res.json({ success: false, message: '⚠️ RIC dan Custom Name wajib diisi.' });
    }

    const ricUpper = code_b.trim().toUpperCase();
    const exists = await pool.query('SELECT 1 FROM stock_items WHERE code_b = $1', [ricUpper]);

    if (exists.rows.length > 0) {
      return res.json({ success: false, message: `⚠️ RIC ${ricUpper} sudah ada di database.` });
    }

await pool.query(`
  INSERT INTO stock_items (
    code_b, stockname, last_price, change1, percent_change,
    bid, ask, acc_volume, category1, ticker_active
  ) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, $3, $4)
`, [ricUpper, stockname, category1, ticker_active]);


    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Add Error:', err.message);
    return res.json({ success: false, message: '❌ Gagal tambah RIC: ' + err.message });
  }
});


// ===== API: Edit RIC =====
app.post('/edit', async (req, res) => {
  const { stock_id, code_b, stockname, category1 } = req.body;
  const ticker_active = req.body.ticker_active === 'on' ? 1 : 0;

  if (!stock_id || !code_b || !stockname) {
    return res.status(400).json({ success: false, message: '⚠️ Data tidak lengkap' });
  }

  try {
 await pool.query(
  'UPDATE stock_items SET code_b = $2, stockname = $3, category1 = $4, ticker_active = $5 WHERE stock_id = $1',
  [stock_id, code_b, stockname, category1, ticker_active]
);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Edit error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== API: Hapus RIC berdasarkan ID =====
app.post('/delete', async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM stock_items WHERE stock_id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send('❌ Delete error: ' + err.message);
  }
});

// ===== PAGE: History Chart (15 tick terakhir per RIC) =====
app.get('/history', requireLogin, async (req, res) => {
  const code_b = req.query.code_b || '.JKSE';
  try {
    const result = await pool.query(`
      SELECT t.tick_date, t.last_price, s.stockname
      FROM tick t
      JOIN stock_items s ON t.stock_id = s.stock_id
      WHERE s.code_b = $1
      ORDER BY t.tick_date DESC
      LIMIT 15
    `, [code_b.toUpperCase()]);

    const rows = result.rows.reverse();
    res.render('history', { rows, code_b });
  } catch (err) {
    console.error('❌ /history error:', err.message);
    res.status(500).send('❌ Error: ' + err.message);
  }
});

// ===== API: Chart per Menit (fix, 1 tick terakhir per slot) =====
const { getMarketSessionSQL } = require('./utils/market');

app.get('/api/history/:code_b', async (req, res) => {
  const { code_b } = req.params;
  const { where, params } = getMarketSessionSQL('t');
  const upperCode = code_b.toUpperCase();

  try {
    const query = `
      SELECT ts, price FROM (
        SELECT 
          date_trunc('minute', t.tick_date AT TIME ZONE 'Asia/Jakarta') AS ts,
          t.last_price AS price,
          ROW_NUMBER() OVER (
            PARTITION BY date_trunc('minute', t.tick_date AT TIME ZONE 'Asia/Jakarta')
            ORDER BY t.tick_date DESC
          ) AS rn
        FROM tick t
        JOIN stock_items s ON t.stock_id = s.stock_id
        WHERE s.code_b = $1 AND (${where})
      ) sub
      WHERE rn = 1
      ORDER BY ts ASC
    `;

    const result = await pool.query(query, [upperCode, ...params]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ /api/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});




// ===== API: Tabel 15 Tick Terakhir =====
app.get('/api/history-table/:code_b', async (req, res) => {
  const { code_b } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        (t.tick_date AT TIME ZONE 'Asia/Jakarta') AS ts,
        t.last_price AS price,
        t.acc_volume AS volume,
        s.stockname
      FROM tick t
      JOIN stock_items s ON t.stock_id = s.stock_id
      WHERE s.code_b = $1
      ORDER BY t.tick_date DESC
      LIMIT 15
    `, [code_b.toUpperCase()]);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ /api/history-table error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ===== API: Summary (last tick per RIC) =====
app.get('/api/summary/:code_b', async (req, res) => {
  const { code_b } = req.params;

  try {
    const result = await pool.query(`
      SELECT s.code_b, s.stockname, t.last_price, t.change1 AS net_change, 
             t.percent_change AS pct_change, t.tick_date AS updated_at
      FROM stock_items s
      LEFT JOIN LATERAL (
        SELECT * FROM tick WHERE stock_id = s.stock_id ORDER BY tick_date DESC LIMIT 1
      ) t ON true
      WHERE s.code_b = $1
      LIMIT 1
    `, [code_b.toUpperCase()]);

    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('❌ /api/summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== API: Status Server (MAIN/BACKUP) =====
app.get('/api/server-status', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM server_status ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error getServerStatus:", err.message);
    res.status(500).json({ error: 'Gagal membaca status server' });
  }
});

// ===== PAGE: Setting Config Manual (GUI) =====
app.get('/setting', requireLogin, (req, res) => {
  res.render('setting');
});

//get config server
app.get('/api/get-config', (req, res) => {
  fs.readFile(CONFIG_PATH, 'utf-8', (err, data) => {
    if (err) {
      console.error("❌ Error read config:", err.message);
      return res.status(500).json({ error: 'Gagal baca config.json' });
    }
    res.json(JSON.parse(data));
  });
});

//save config server
app.post('/api/save-config', (req, res) => {
  const { active, mainHost, mainPort, mainUser, mainAppid, backupHost, backupPort, backupUser, backupAppid } = req.body;

  const newConfig = {
    active,
    servers: {
      MAIN: { hostname: mainHost, port: parseInt(mainPort), user: mainUser, appId: mainAppid },
      BACKUP: { hostname: backupHost, port: parseInt(backupPort), user: backupUser, appId: backupAppid }
    }
  };

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    res.status(200).json({ message: "Config berhasil disimpan" });
  } catch (err) {
    console.error("❌ Gagal simpan config:", err.message);
    res.status(500).json({ error: "Gagal simpan config" });
  }
});


//const fs = require('fs');


// === Route: Simpan DB Config dan Market Session ===
app.post('/api/save-db-config', async (req, res) => {
  try {
    const { dbHost, dbPort, dbName, dbUser, dbPass } = req.body;

    const envContent = `
DB_HOST=${dbHost}
DB_PORT=${dbPort}
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASS=${dbPass}
`.trim();

    fs.writeFileSync(path.join(__dirname, '.env'), envContent);

    res.json({ success: true, message: '✅ DB Config saved' });
  } catch (err) {
    console.error('❌ Save DB config error:', err.message);
    res.status(500).json({ success: false, message: '❌ Gagal simpan DB config' });
  }
});


//const fs = require('fs');
//const path = require('path');
const dotenv = require('dotenv');

app.get('/api/get-db-config', (req, res) => {
  try {
    // ⬇️ Load isi .env
    const envPath = path.join(__dirname, '.env');
    const envData = dotenv.parse(fs.readFileSync(envPath));

    // ⬇️ Load market-session.json
    const marketPath = path.join(__dirname, './settings/market-hours.json');
    const marketData = JSON.parse(fs.readFileSync(marketPath, 'utf-8'));

    // ⬆️ Kirim gabungan config
    res.json({
      dbHost: envData.DB_HOST || '',
      dbPort: envData.DB_PORT || '',
      dbName: envData.DB_NAME || '',
      dbUser: envData.DB_USER || '',
      dbPass: envData.DB_PASS || '',
      sessions: marketData.sessions || []
    });
  } catch (err) {
    console.error('❌ Gagal baca konfigurasi:', err.message);
    res.status(500).json({ error: 'Gagal baca konfigurasi' });
  }
});

// ===== API: Trigger reconnect client-refinitiv =====
const axios = require('axios');

app.post('/api/trigger-reconnect', async (req, res) => {
  try {
    const resp = await axios.post('http://localhost:9910/api/trigger-reconnect');
    if (resp.data.success) {
      console.log("✅ Trigger reconnect ke client-refinitiv sukses");
      return res.json({ success: true, message: 'Reconnect sukses' });
    } else {
      return res.json({ success: false, message: resp.data.message || 'Reconnect gagal' });
    }
  } catch (err) {
    console.error("❌ Gagal trigger reconnect:", err.message);
    return res.status(500).json({ success: false, message: '❌ Error trigger reconnect' });
  }
});



//====save jam buka pasar
app.post('/api/save-market-hours', async (req, res) => {
  try {
    const { session1Open, session1Close, session2Open, session2Close } = req.body;

    const marketSession = {
      sessions: [
        { open: session1Open, close: session1Close },
        { open: session2Open, close: session2Close }
      ]
    };

    fs.writeFileSync(path.join(__dirname, './settings/market-hours.json'), JSON.stringify(marketSession, null, 2));

    res.json({ success: true, message: '✅ Market hours saved' });
  } catch (err) {
    console.error('❌ Save market hours error:', err.message);
    res.status(500).json({ success: false, message: '❌ Gagal simpan market hours' });
  }
});



// ===== API: Output untuk Vizrt (format text ticker) =====
app.get('/api/vizrt/ticker-datapool', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT code_b, stockname, last_price, change1, percent_change, acc_volume
      FROM stock_items
      WHERE ticker_active = 1
      ORDER BY stockname ASC
    `);

    const lines = result.rows.map(r => {
      let condition = 2;
      if (r.percent_change > 0) condition = 1;
      else if (r.percent_change < 0) condition = 0;

      let volume = r.acc_volume;
      if (volume >= 1_000_000) volume = (volume / 1_000_000).toFixed(2) + ' m';
      else if (volume >= 1_000) volume = (volume / 1_000).toFixed(2) + ' k';

      const stockcode = r.stockname.toUpperCase();
      return `STOCK[_${r.code_b}]={{shortname=${r.stockname};fullname=;price=${r.last_price};change=${Math.abs(r.change1)};condition=${condition};close=1;percent=${Math.abs(r.percent_change)}%;volume=${volume};shortname2=;fullname2=;stockcode=${stockcode};}};`;
    });

    res.setHeader('Content-Type', 'text/plain');
    res.send(lines.join(''));
  } catch (err) {
    console.error('❌ Ticker DataPool API error:', err.message);
    res.status(500).send('Internal server error');
  }
});

//====send command

// ✅ API: Ambil 1 server status berdasarkan nama
app.get('/api/server-status/:name', async (req, res) => {
  const { name } = req.params;

  try {
    const result = await pool.query(`
      SELECT name, host, port, status, last_check, is_active
      FROM server_status
      WHERE name = $1
    `, [name]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '❌ Server tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error ambil server status:', err.message);
    res.status(500).json({ error: '❌ Gagal ambil status server' });
  }
});

const viz = require('./viz-client');
const vizbackup = require('./viz-client-backup');
//viz.new("127.0.0.1", 6100); // ⬅️ wajib sekali, jangan di-dalem POST handler
//vizbackup.new("127.0.0.1", 6100); // ⬅️ wajib sekali, jangan di-dalem POST handler


app.post('/api/server-status/toggle/:name', async (req, res) => {
  const { name } = req.params;

  try {
    const check = await pool.query('SELECT is_active FROM server_status WHERE name = $1', [name]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    const current = check.rows[0].is_active;
    const update = !current;

    // ▶️ Handle Viz hanya jika TICKER_MAIN
    if (name === 'TICKER_MAIN') {
      if (update) {
        if (!viz.isConnected) {
          try {
            await viz.connect();
          } catch (err) {
            console.warn('⚠️ Gagal konek ke Viz MAIN:', err.message);
            return res.json({ success: false, message: 'Gagal konek ke Viz MAIN' });
          }
        }

        viz.startSendingFromApi("http://localhost:3000/api/vizrt/ticker-datapool");
      } else {
        viz.disconnect();
      }
    }

    // ▶️ Handle Viz hanya jika TICKER_BACKUP
    else if (name === 'TICKER_BACKUP') {
      if (update) {
        if (!vizbackup.isConnected) {
          try {
            await vizbackup.connect();
          } catch (err) {
            console.warn('⚠️ Gagal konek ke Viz BACKUP:', err.message);
            return res.json({ success: false, message: 'Gagal konek ke Viz BACKUP' });
          }
        }

        vizbackup.startSendingFromApi("http://localhost:3000/api/vizrt/ticker-datapool");
      } else {
        vizbackup.disconnect();
      }
    }

    // ✅ Update status di DB hanya jika berhasil
    await pool.query('UPDATE server_status SET is_active = $1 WHERE name = $2', [update, name]);
    res.json({ success: true, is_active: update });

  } catch (err) {
    console.error('❌ Error toggle server:', err);
    res.status(500).json({ success: false });
  }
});


const fsviz = require('fs');
//const path = require('path');
const vizConfigPath = path.join(__dirname, 'viz-config.json');
const reconnectVizEngines = require('./reconnectVizEngines');
reconnectVizEngines(); // ⬅️ panggil sekali saat server start

app.get('/api/get-ticker-config', async (req, res) => {
  try {
    const main = await pool.query("SELECT host, port FROM server_status WHERE name = 'TICKER_MAIN'");
    const backup = await pool.query("SELECT host, port FROM server_status WHERE name = 'TICKER_BACKUP'");

    res.json({
      servers: {
        MAIN: {
          hostname: main.rows[0]?.host || '',
          port: main.rows[0]?.port || ''
        },
        BACKUP: {
          hostname: backup.rows[0]?.host || '',
          port: backup.rows[0]?.port || ''
        }
      }
    });
  } catch (err) {
    console.error('❌ Gagal ambil config ticker:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/save-ticker-config', async (req, res) => {
  const {
    tickermainHost,
    tickermainPort,
    tickerbackupHost,
    tickerbackupPort
  } = req.body;

  if (
    !tickermainHost || isNaN(tickermainPort) ||
    !tickerbackupHost || isNaN(tickerbackupPort)
  ) {
    return res.status(400).json({ success: false, message: '❌ Semua field wajib diisi dengan benar' });
  }

  const newConfig = {
    servers: {
      MAIN: {
        hostname: tickermainHost.trim(),
        port: Number(tickermainPort)
      },
      BACKUP: {
        hostname: tickerbackupHost.trim(),
        port: Number(tickerbackupPort)
      }
    }
  };

  try {
    fsviz.writeFileSync(vizConfigPath, JSON.stringify(newConfig, null, 2));

    await pool.query(
      `UPDATE server_status SET host = $1, port = $2 WHERE name = 'TICKER_MAIN'`,
      [tickermainHost.trim(), Number(tickermainPort)]
    );
    await pool.query(
      `UPDATE server_status SET host = $1, port = $2 WHERE name = 'TICKER_BACKUP'`,
      [tickerbackupHost.trim(), Number(tickerbackupPort)]
    );

    res.json({ success: true, message: '✅ Config berhasil disimpan' });
  } catch (err) {
    console.error('❌ Gagal simpan config:', err);
    res.status(500).json({ success: false, message: '❌ Gagal simpan config' });
  }

  reconnectVizEngines();
});


//diskonel all
// Saat server pertama kali jalan, matikan semua status server
(async () => {
  try {
    await pool.query(`UPDATE server_status SET is_active = false`);
    console.log('🔁 Semua server_status di-set ke false saat startup');
    viz.disconnect();
    vizbackup.disconnect();

  } catch (err) {
    console.error('❌ Gagal reset status server saat startup:', err.message);
  }
})();


//User
// Route: GET all users
app.get('/api/users', async (req, res) => {
  const result = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY id ASC');
  res.json(result.rows);
});

// Route: Add new user
app.post('/api/add-user', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.json({ success: false, message: 'Username & password wajib diisi' });

  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
      [username, hashed, role || 'user']
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.json({ success: false, message: 'Username sudah digunakan' });
    res.json({ success: false, message: 'Server error' });
  }
});

// Route: Edit user
app.post('/api/edit-user', async (req, res) => {
  const { id, username, password, role } = req.body;
  if (!id || !username || !role) return res.json({ success: false });

  try {
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET username=$1, password_hash=$2, role=$3 WHERE id=$4', [username, hashed, role, id]);
    } else {
      await pool.query('UPDATE users SET username=$1, role=$2 WHERE id=$3', [username, role, id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});
// Route: Delete user
app.post('/api/delete-user', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.json({ success: false, message: 'ID tidak ditemukan' });

  try {
    // 🚫 Cegah user hapus dirinya sendiri
    if (req.session.user && req.session.user.id == id) {
      return res.json({ success: false, message: 'Kamu tidak bisa menghapus akun sendiri' });
    }

    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete user error:', err.message);
    res.json({ success: false, message: 'Server error' });
  }
});



app.get('/user', requireLogin, (req, res) => {
  try {
    res.render('user');
  } catch (err) {
    console.error('❌ /user error:', err.message);
    res.status(500).send('❌ Error: ' + err.message);
  }
});




// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://<your-local-ip>:${PORT}`);
});
