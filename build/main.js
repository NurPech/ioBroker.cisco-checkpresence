"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var https = __toESM(require("https"));
class CiscoCheckpresence extends utils.Adapter {
  pollTimer = null;
  absentCount = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "cisco-checkpresence"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    if (!this.config.wlcHost || !this.config.wlcUser || !this.config.wlcPassword) {
      this.log.warn(
        "WLC-Konfiguration unvollst\xE4ndig \u2014 bitte Host, Benutzername und Passwort eintragen."
      );
      await this.setState("info.connection", false, true);
      return;
    }
    const users = Array.isArray(this.config.users) ? this.config.users : [];
    if (users.length === 0) {
      this.log.warn("Keine Benutzer konfiguriert \u2014 bitte mindestens einen Benutzer anlegen.");
    }
    await this.setObjectNotExistsAsync("info.connection", {
      type: "state",
      common: {
        name: "WLC verbunden",
        type: "boolean",
        role: "indicator.connected",
        read: true,
        write: false,
        def: false
      },
      native: {}
    });
    for (const user of users) {
      if (!user.stateName) {
        continue;
      }
      await this.setObjectNotExistsAsync(`presence.${user.stateName}`, {
        type: "channel",
        common: { name: user.username },
        native: {}
      });
      await this.setObjectNotExistsAsync(`presence.${user.stateName}.present`, {
        type: "state",
        common: {
          name: "Anwesend",
          type: "boolean",
          role: "indicator.presence",
          read: true,
          write: false,
          def: false
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`presence.${user.stateName}.ap`, {
        type: "state",
        common: {
          name: "Access Point",
          type: "string",
          role: "text",
          read: true,
          write: false,
          def: ""
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`presence.${user.stateName}.band`, {
        type: "state",
        common: {
          name: "Frequenzband",
          type: "string",
          role: "text",
          read: true,
          write: false,
          def: ""
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`presence.${user.stateName}.rssi`, {
        type: "state",
        common: {
          name: "RSSI",
          type: "number",
          role: "value",
          unit: "dBm",
          read: true,
          write: false,
          def: 0
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(`presence.${user.stateName}.snr`, {
        type: "state",
        common: {
          name: "SNR",
          type: "number",
          role: "value",
          unit: "dB",
          read: true,
          write: false,
          def: 0
        },
        native: {}
      });
    }
    await this.poll();
    const intervalMs = Math.max(10, this.config.pollInterval || 30) * 1e3;
    this.pollTimer = setInterval(() => this.poll(), intervalMs);
    this.log.info(`Gestartet. WLC: ${this.config.wlcHost}, Intervall: ${intervalMs / 1e3}s`);
  }
  async poll() {
    var _a, _b, _c, _d, _e;
    try {
      const [clients, stats] = await Promise.all([
        this.fetchClients(),
        this.fetchTrafficStats()
      ]);
      const statsByMac = new Map(stats.map((s) => [s.mac, s]));
      const enriched = clients.map((c) => {
        var _a2, _b2, _c2, _d2;
        return {
          ...c,
          rssi: (_b2 = (_a2 = statsByMac.get(c.mac)) == null ? void 0 : _a2.rssi) != null ? _b2 : null,
          snr: (_d2 = (_c2 = statsByMac.get(c.mac)) == null ? void 0 : _c2.snr) != null ? _d2 : null
        };
      });
      await this.setState("info.connection", true, true);
      const users = Array.isArray(this.config.users) ? this.config.users : [];
      for (const user of users) {
        if (!user.stateName || !user.username) {
          continue;
        }
        const client = enriched.find((c) => c.username === user.username && c.connected);
        const absentThreshold = Math.max(1, this.config.absentThreshold || 2);
        let present;
        if (client) {
          this.absentCount.set(user.stateName, 0);
          present = true;
        } else {
          const count = ((_a = this.absentCount.get(user.stateName)) != null ? _a : 0) + 1;
          this.absentCount.set(user.stateName, count);
          present = count < absentThreshold;
          if (!present) {
            this.log.debug(`${user.username}: ${count}\xD7 nicht gesehen \u2192 abwesend`);
          }
        }
        await this.setState(`presence.${user.stateName}.present`, present, true);
        await this.setState(`presence.${user.stateName}.ap`, (_b = client == null ? void 0 : client.ap) != null ? _b : "", true);
        await this.setState(`presence.${user.stateName}.band`, (_c = client == null ? void 0 : client.band) != null ? _c : "", true);
        await this.setState(`presence.${user.stateName}.rssi`, (_d = client == null ? void 0 : client.rssi) != null ? _d : 0, true);
        await this.setState(`presence.${user.stateName}.snr`, (_e = client == null ? void 0 : client.snr) != null ? _e : 0, true);
        this.log.debug(
          `${user.username} \u2192 ${present ? `anwesend (${client == null ? void 0 : client.ap}, ${client == null ? void 0 : client.band}, ${client == null ? void 0 : client.rssi} dBm)` : "abwesend"}`
        );
      }
    } catch (err) {
      this.log.error(`Poll fehlgeschlagen: ${err.message}`);
      await this.setState("info.connection", false, true);
    }
  }
  fetchClients() {
    return this.restconfGet(
      "/restconf/data/Cisco-IOS-XE-wireless-client-oper:client-oper-data/common-oper-data",
      "Cisco-IOS-XE-wireless-client-oper:common-oper-data"
    ).then(
      (entries) => entries.map((e) => {
        var _a, _b, _c, _d;
        return {
          username: String((_a = e.username) != null ? _a : ""),
          mac: String((_b = e["client-mac"]) != null ? _b : ""),
          connected: e["co-state"] === "client-status-run",
          ap: String((_c = e["ap-name"]) != null ? _c : ""),
          band: this.parseBand(String((_d = e["ms-radio-type"]) != null ? _d : ""))
        };
      })
    );
  }
  fetchTrafficStats() {
    return this.restconfGet(
      "/restconf/data/Cisco-IOS-XE-wireless-client-oper:client-oper-data/traffic-stats",
      "Cisco-IOS-XE-wireless-client-oper:traffic-stats"
    ).then(
      (entries) => entries.map((e) => {
        var _a;
        return {
          mac: String((_a = e["ms-mac-address"]) != null ? _a : ""),
          rssi: typeof e["most-recent-rssi"] === "number" ? e["most-recent-rssi"] : null,
          snr: typeof e["most-recent-snr"] === "number" ? e["most-recent-snr"] : null
        };
      })
    );
  }
  restconfGet(path, key) {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.config.wlcUser}:${this.config.wlcPassword}`).toString(
        "base64"
      );
      const req = https.request(
        {
          hostname: this.config.wlcHost,
          port: 443,
          path,
          method: "GET",
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/yang-data+json"
          },
          rejectUnauthorized: !this.config.ignoreSelfSignedCert,
          timeout: 1e4
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => data += chunk);
          res.on("end", () => {
            var _a;
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} f\xFCr ${path}`));
              return;
            }
            try {
              const parsed = JSON.parse(data);
              resolve((_a = parsed[key]) != null ? _a : []);
            } catch (e) {
              reject(new Error(`JSON-Parse fehlgeschlagen: ${e.message}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Timeout f\xFCr ${path}`));
      });
      req.end();
    });
  }
  parseBand(radioType) {
    if (radioType.includes("24-ghz") || radioType.includes("bg")) {
      return "2.4 GHz";
    }
    if (radioType.includes("6-ghz")) {
      return "6 GHz";
    }
    if (radioType.includes("5-ghz") || radioType.includes("ac") || radioType.includes("ax")) {
      return "5 GHz";
    }
    return radioType;
  }
  onUnload(callback) {
    try {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      callback();
    } catch (error) {
      this.log.error(`Fehler beim Beenden: ${error.message}`);
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new CiscoCheckpresence(options);
} else {
  (() => new CiscoCheckpresence())();
}
//# sourceMappingURL=main.js.map
