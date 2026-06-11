import * as utils from '@iobroker/adapter-core';
import * as https from 'node:https';

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

/**
 * Removes characters forbidden in ioBroker object IDs and replaces spaces with underscores.
 *
 * @param name the raw state name as entered by the user
 */
function sanitizeStateName(name: string): string {
    return name
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[\]["'`*,;<>?.(){}\\]/g, '');
}

class CiscoCheckpresence extends utils.Adapter {
    private pollTimer: ioBroker.Timeout | undefined = undefined;
    private absentCount: Map<string, number> = new Map();
    private intervalMs = 30000;

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
                'WLC configuration is incomplete. Please provide host, username, and password.',
            );
            await this.setState('info.connection', false, true);
            return;
        }

        const users = Array.isArray(this.config.users) ? this.config.users : [];
        if (users.length === 0) {
            this.log.warn('No users configured — please add at least one user.');
        }

        await this.setObjectNotExistsAsync(`info`, {
            type: 'folder',
            common: { name: `info` },
            native: {},
        });
        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: {
                name: 'WLC connected',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync(`presence`, {
            type: 'folder',
            common: { name: `presence` },
            native: {},
        });

        for (const user of users) {
            const stateName = sanitizeStateName(user.stateName ?? '');
            if (!stateName) {
                continue;
            }
            await this.setObjectNotExistsAsync(`presence.${stateName}`, {
                type: 'channel',
                common: { name: user.username },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${stateName}.present`, {
                type: 'state',
                common: {
                    name: 'Presence',
                    type: 'boolean',
                    role: 'indicator',
                    read: true,
                    write: false,
                    def: false,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${stateName}.ap`, {
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
            await this.setObjectNotExistsAsync(`presence.${stateName}.band`, {
                type: 'state',
                common: {
                    name: 'Frequency band',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: '',
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(`presence.${stateName}.rssi`, {
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
            await this.setObjectNotExistsAsync(`presence.${stateName}.snr`, {
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

        this.intervalMs = Math.min(Math.max(10, this.config.pollInterval || 30), 300) * 1000;
        this.log.info(
            `Service started. WLC Host: ${this.config.wlcHost}, Polling Interval: ${this.intervalMs / 1000}s`,
        );

        await this.poll();
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
            const absentThreshold = Math.min(Math.max(1, this.config.absentThreshold || 2), 100);
            for (const user of users) {
                const stateName = sanitizeStateName(user.stateName ?? '');
                if (!stateName || !user.username) {
                    continue;
                }
                const client = enriched.find((c) => c.username === user.username && c.connected);

                let present: boolean;
                if (client) {
                    this.absentCount.set(stateName, 0);
                    present = true;
                } else {
                    const count = (this.absentCount.get(stateName) ?? 0) + 1;
                    this.absentCount.set(stateName, count);
                    present = count < absentThreshold;
                    if (!present) {
                        this.log.debug(`${user.username}: Not seen ${count}× → absent`);
                    }
                }

                await this.setState(`presence.${stateName}.present`, present, true);
                await this.setState(`presence.${stateName}.ap`, client?.ap ?? '', true);
                await this.setState(`presence.${stateName}.band`, client?.band ?? '', true);
                await this.setState(`presence.${stateName}.rssi`, client?.rssi ?? 0, true);
                await this.setState(`presence.${stateName}.snr`, client?.snr ?? 0, true);

                this.log.debug(
                    `${user.username} → ${present ? `home (${client?.ap}, ${client?.band}, ${client?.rssi} dBm)` : 'away'}`,
                );
            }
        } catch (err) {
            this.log.error(`Failed to poll WLC: ${(err as Error).message}`);
            await this.setState('info.connection', false, true);
        } finally {
            this.pollTimer = this.setTimeout(() => {
                void this.poll();
            }, this.intervalMs);
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
                            reject(new Error(`HTTP ${res.statusCode} for ${path}`));
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            resolve((parsed[key] ?? []) as T);
                        } catch (e) {
                            reject(new Error(`Failed to parse JSON: ${(e as Error).message}`));
                        }
                    });
                },
            );

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Connection timed out for ${path}`));
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
            this.clearTimeout(this.pollTimer);
            this.pollTimer = undefined;

            callback();
        } catch (error) {
            this.log.error(`Error during shutdown: ${(error as Error).message}`);
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
