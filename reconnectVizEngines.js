// reconnectVizEngines.js
const fs = require('fs');
const path = require('path');
const viz = require('./viz-client');
const vizbackup = require('./viz-client-backup');

const configPath = path.join(__dirname, 'viz-config.json');

function reconnectVizEngines() {
  try {
    const raw = fs.readFileSync(configPath);
    const config = JSON.parse(raw);

    // Reassign koneksi host+port
    viz.new(config.servers.MAIN.hostname, config.servers.MAIN.port);
    vizbackup.new(config.servers.BACKUP.hostname, config.servers.BACKUP.port);

    console.log('✅ Viz Engine config di-refresh ulang dari file');

  } catch (err) {
    console.error('❌ Gagal load config JSON:', err.message);
  }
}

module.exports = reconnectVizEngines;
