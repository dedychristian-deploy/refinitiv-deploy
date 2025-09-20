// server-monitor.js
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { pool } = require('./db');

const CONFIG_PATH = path.join(__dirname, 'settings', 'server-config.json');

async function checkServer(name, { hostname, port }) {
  const wsUrl = `ws://${hostname}:${port}/WebSocket`;
  const timeoutMs = 3000;
  let ws;
  let timeout;

  return new Promise((resolve) => {
    let status = 'UNKNOWN';

    try {
      ws = new WebSocket(wsUrl, 'tr_json2');

      timeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          ws.terminate();
          status = 'CLOSED';
          resolve({ name, status });
        }
      }, timeoutMs);

      ws.on('open', () => {
        clearTimeout(timeout);
        status = 'RUNNING';
        ws.close();
      });

      ws.on('close', () => {
        resolve({ name, status });
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        status = 'CLOSED';
        resolve({ name, status });
      });
    } catch (err) {
      clearTimeout(timeout);
      status = 'CLOSED';
      resolve({ name, status });
    }
  });
}

async function updateStatusToDB(name, status) {
  try {
    await pool.query(
      `UPDATE server_status SET status=$1, last_check=NOW() WHERE name=$2`,
      [status, name]
    );
    console.log(`📡 [${name}] → ${status}`);
  } catch (err) {
    console.error(`❌ Gagal update DB untuk ${name}:`, err.message);
  }
}

async function monitorServers() {
  let configRaw;
  try {
    configRaw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  } catch (err) {
    console.error('❌ Tidak bisa baca config.json:', err.message);
    return;
  }

  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (err) {
    console.error('❌ Format config.json tidak valid:', err.message);
    return;
  }

  const servers = config.servers || {};

  for (const [name, detail] of Object.entries(servers)) {
    const { name: serverName, status } = await checkServer(name.toUpperCase(), detail);
    await updateStatusToDB(serverName, status);
  }
}

// 🔁 Cek setiap 10 detik
monitorServers();
setInterval(monitorServers, 10_000);
