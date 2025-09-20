const net = require("net");
const fetch = require("node-fetch"); // npm install node-fetch@2

class Viz {
  constructor() {
    this.client = null;
    this.host = null;
    this.port = null;
    this.isConnected = false;
    this.intervalId = null;
  }

  new(host, port) {
    this.host = host;
    this.port = parseInt(port, 10);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.client = new net.Socket();

      this.client.connect(this.port, this.host, () => {
        this.isConnected = true;
        console.log("✅ Connected to Viz Engine");
        resolve();
      });

      this.client.on("data", (data) => {
        console.log("📩 Response:", data.toString());
      });

      this.client.on("close", () => {
        console.log("🔌 Connection closed");
        this.isConnected = false;
        clearInterval(this.intervalId);
      });

      this.client.on("error", (err) => {
        console.error("❌ Viz Engine connection error:", err.message);
        this.isConnected = false;
        clearInterval(this.intervalId);
        reject(err);
      });
    });
  }

  sendCommand(command) {
    if (this.isConnected && this.client) {
      this.client.write(command + "\r\n");
      //console.log("➡️ Sent:", command);
    } else {
      console.log("⚠️ Not connected, skipped");
    }
  }

  async fetchAndSend(apiUrl) {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      this.sendCommand(`0 RENDERER*FUNCTION*DataPool*Data SET ${text} \0`);
    } catch (err) {
      console.error("❌ API fetch error:", err.message);
    }
  }

  startSendingFromApi(apiUrl, intervalMs = 2000) {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      this.fetchAndSend(apiUrl);
    }, intervalMs);
  }

  disconnect() {
    if (this.client) {
      clearInterval(this.intervalId);
      this.client.destroy();
      this.isConnected = false;
      console.log("🔴 Disconnected from Viz Engine");
    }
  }
}

// ✅ ekspor 1 objek siap pakai
module.exports = new Viz();
