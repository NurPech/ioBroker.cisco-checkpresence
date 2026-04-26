import * as utils from '@iobroker/adapter-core';
import * as https from 'https';

interface WlcClient {
    username: string;
    mac: string;
    connected: boolean;
    ap: string;
    band: string;
    rssi: number | null;
    snr: number | null;
}

interface TrafficStats {
    mac: string;
    rssi: number | null;
    snr: number | null;
}

class CiscoCheckpresence extends utils.Adapter {
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private absentCount: Map<string, number> = new Map();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'cisco-checkpresence',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        if (!this.config.wlcHost || !this.config.wlcUser || !this.config.wlcPassword) {
            this.log.warn(
                'WLC-Konfiguration unvollständig — bitte Host, Benutzername und Passwort eintragen.',
            );
            await this.setState('info.connection', false, true);
            return;
        }

        const users = Array.isArray(this.config.users) ? this.config.users : [];
        if (users.length === 0) {
            this.log.warn('Keine Benutzer konfiguriert — bitte mindestens einen Benutzer anlegen.');
        }

        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: {
                name: 'WLC verbunden',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });

        for (const user of users) {
            if (!user.stateName) {
                continue;
            }
            await this.setObjectNotExistsAsync(`presence.${user.stateName}`, {
                type: 'channel',
                common: { name: user.username },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${user.stateName}.present`, {
                type: 'state',
                common: {
                    name: 'Anwesend',
                    type: 'boolean',
                    role: 'indicator.presence',
                    read: true,
                    write: false,
                    def: false,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${user.stateName}.ap`, {
                type: 'state',
                common: {
                    name: 'Access Point',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: '',
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${user.stateName}.band`, {
                type: 'state',
                common: {
                    name: 'Frequenzband',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: '',
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${user.stateName}.rssi`, {
                type: 'state',
                common: {
                    name: 'RSSI',
                    type: 'number',
                    role: 'value',
                    unit: 'dBm',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${user.stateName}.snr`, {
                type: 'state',
                common: {
                    name: 'SNR',
                    type: 'number',
                    role: 'value',
                    unit: 'dB',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            });
        }

        await this.poll();

        const intervalMs = Math.max(10, this.config.pollInterval || 30) * 1000;
        this.pollTimer = setInterval(() => this.poll(), intervalMs);
        this.log.info(`Gestartet. WLC: ${this.config.wlcHost}, Intervall: ${intervalMs / 1000}s`);
    }

    private async poll(): Promise<void> {
        try {
            const [clients, stats] = await Promise.all([
                this.fetchClients(),
                this.fetchTrafficStats(),
            ]);

            const statsByMac = new Map(stats.map((s) => [s.mac, s]));
            const enriched: WlcClient[] = clients.map((c) => ({
                ...c,
                rssi: statsByMac.get(c.mac)?.rssi ?? null,
                snr: statsByMac.get(c.mac)?.snr ?? null,
            }));

            await this.setState('info.connection', true, true);

            const users = Array.isArray(this.config.users) ? this.config.users : [];
            for (const user of users) {
                if (!user.stateName || !user.username) {
                    continue;
                }
                const client = enriched.find((c) => c.username === user.username && c.connected);
                const absentThreshold = Math.max(1, this.config.absentThreshold || 2);

                let present: boolean;
                if (client) {
                    this.absentCount.set(user.stateName, 0);
                    present = true;
                } else {
                    const count = (this.absentCount.get(user.stateName) ?? 0) + 1;
                    this.absentCount.set(user.stateName, count);
                    present = count < absentThreshold;
                    if (!present) {
                        this.log.debug(`${user.username}: ${count}× nicht gesehen → abwesend`);
                    }
                }

                await this.setState(`presence.${user.stateName}.present`, present, true);
                await this.setState(`presence.${user.stateName}.ap`, client?.ap ?? '', true);
                await this.setState(`presence.${user.stateName}.band`, client?.band ?? '', true);
                await this.setState(`presence.${user.stateName}.rssi`, client?.rssi ?? 0, true);
                await this.setState(`presence.${user.stateName}.snr`, client?.snr ?? 0, true);

                this.log.debug(
                    `${user.username} → ${present ? `anwesend (${client?.ap}, ${client?.band}, ${client?.rssi} dBm)` : 'abwesend'}`,
                );
            }
        } catch (err) {
            this.log.error(`Poll fehlgeschlagen: ${(err as Error).message}`);
            await this.setState('info.connection', false, true);
        }
    }

    private fetchClients(): Promise<Omit<WlcClient, 'rssi' | 'snr'>[]> {
        return this.restconfGet<any[]>(
            '/restconf/data/Cisco-IOS-XE-wireless-client-oper:client-oper-data/common-oper-data',
            'Cisco-IOS-XE-wireless-client-oper:common-oper-data',
        ).then((entries) =>
            entries.map((e) => ({
                username: String(e.username ?? ''),
                mac: String(e['client-mac'] ?? ''),
                connected: e['co-state'] === 'client-status-run',
                ap: String(e['ap-name'] ?? ''),
                band: this.parseBand(String(e['ms-radio-type'] ?? '')),
            })),
        );
    }

    private fetchTrafficStats(): Promise<TrafficStats[]> {
        return this.restconfGet<any[]>(
            '/restconf/data/Cisco-IOS-XE-wireless-client-oper:client-oper-data/traffic-stats',
            'Cisco-IOS-XE-wireless-client-oper:traffic-stats',
        ).then((entries) =>
            entries.map((e) => ({
                mac: String(e['ms-mac-address'] ?? ''),
                rssi: typeof e['most-recent-rssi'] === 'number' ? e['most-recent-rssi'] : null,
                snr: typeof e['most-recent-snr'] === 'number' ? e['most-recent-snr'] : null,
            })),
        );
    }

    private restconfGet<T>(path: string, key: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const auth = Buffer.from(`${this.config.wlcUser}:${this.config.wlcPassword}`).toString(
                'base64',
            );

            const req = https.request(
                {
                    hostname: this.config.wlcHost,
                    port: 443,
                    path,
                    method: 'GET',
                    headers: {
                        Authorization: `Basic ${auth}`,
                        Accept: 'application/yang-data+json',
                    },
                    rejectUnauthorized: !this.config.ignoreSelfSignedCert,
                    timeout: 10000,
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        if (res.statusCode !== 200) {
                            reject(new Error(`HTTP ${res.statusCode} für ${path}`));
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            resolve((parsed[key] ?? []) as T);
                        } catch (e) {
                            reject(new Error(`JSON-Parse fehlgeschlagen: ${(e as Error).message}`));
                        }
                    });
                },
            );

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Timeout für ${path}`));
            });
            req.end();
        });
    }

    private parseBand(radioType: string): string {
        if (radioType.includes('24-ghz') || radioType.includes('bg')) {
            return '2.4 GHz';
        }
        if (radioType.includes('6-ghz')) {
            return '6 GHz';
        }
        if (radioType.includes('5-ghz') || radioType.includes('ac') || radioType.includes('ax')) {
            return '5 GHz';
        }
        return radioType;
    }

    private onUnload(callback: () => void): void {
        try {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            callback();
        } catch (error) {
            this.log.error(`Fehler beim Beenden: ${(error as Error).message}`);
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) =>
        new CiscoCheckpresence(options);
} else {
    (() => new CiscoCheckpresence())();
}
