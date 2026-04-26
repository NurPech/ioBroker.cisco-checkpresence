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
        type: "state",
        common: {
          name: user.username,
          type: "boolean",
          role: "indicator.presence",
          read: true,
          write: false,
          def: false
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
    try {
      const clients = await this.fetchClients();
      await this.setState("info.connection", true, true);
      const users = Array.isArray(this.config.users) ? this.config.users : [];
      for (const user of users) {
        if (!user.stateName || !user.username) {
          continue;
        }
        const present = clients.some((c) => c.username === user.username && c.connected);
        await this.setState(`presence.${user.stateName}`, present, true);
        this.log.debug(`${user.username} \u2192 ${present ? "anwesend" : "abwesend"}`);
      }
    } catch (err) {
      this.log.error(`Poll fehlgeschlagen: ${err.message}`);
      await this.setState("info.connection", false, true);
    }
  }
  fetchClients() {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.config.wlcUser}:${this.config.wlcPassword}`).toString(
        "base64"
      );
      const req = https.request(
        {
          hostname: this.config.wlcHost,
          port: 443,
          path: "/restconf/data/Cisco-IOS-XE-wireless-client-oper:client-oper-data/common-oper-data",
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
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const entries = (_a = parsed["Cisco-IOS-XE-wireless-client-oper:common-oper-data"]) != null ? _a : [];
              resolve(
                entries.map((e) => {
                  var _a2;
                  return {
                    username: String((_a2 = e.username) != null ? _a2 : ""),
                    connected: e["co-state"] === "client-status-run"
                  };
                })
              );
            } catch (e) {
              reject(new Error(`JSON-Parse fehlgeschlagen: ${e.message}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Timeout beim WLC-Request"));
      });
      req.end();
    });
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
