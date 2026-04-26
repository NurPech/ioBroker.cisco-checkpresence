import * as utils from '@iobroker/adapter-core';
import * as https from 'https';

interface WlcClient {
    username: string;
    connected: boolean;
}

class CiscoCheckpresence extends utils.Adapter {
    private pollTimer: ReturnType<typeof setInterval> | null = null;

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
                type: 'state',
                common: {
                    name: user.username,
                    type: 'boolean',
                    role: 'indicator.presence',
                    read: true,
                    write: false,
                    def: false,
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
            const clients = await this.fetchClients();
            await this.setState('info.connection', true, true);

            const users = Array.isArray(this.config.users) ? this.config.users : [];
            for (const user of users) {
                if (!user.stateName || !user.username) {
                    continue;
                }
                const present = clients.some((c) => c.username === user.username && c.connected);
                await this.setState(`presence.${user.stateName}`, present, true);
                this.log.debug(`${user.username} → ${present ? 'anwesend' : 'abwesend'}`);
            }
        } catch (err) {
            this.log.error(`Poll fehlgeschlagen: ${(err as Error).message}`);
            await this.setState('info.connection', false, true);
        }
    }

    private fetchClients(): Promise<WlcClient[]> {
        return new Promise((resolve, reject) => {
            const auth = Buffer.from(`${this.config.wlcUser}:${this.config.wlcPassword}`).toString(
                'base64',
            );

            const req = https.request(
                {
                    hostname: this.config.wlcHost,
                    port: 443,
                    path: '/restconf/data/Cisco-IOS-XE-wireless-client-oper:client-oper-data/common-oper-data',
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
                            reject(new Error(`HTTP ${res.statusCode}`));
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const entries: any[] =
                                parsed['Cisco-IOS-XE-wireless-client-oper:common-oper-data'] ?? [];
                            resolve(
                                entries.map((e) => ({
                                    username: String(e.username ?? ''),
                                    connected: e['co-state'] === 'client-status-run',
                                })),
                            );
                        } catch (e) {
                            reject(new Error(`JSON-Parse fehlgeschlagen: ${(e as Error).message}`));
                        }
                    });
                },
            );

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout beim WLC-Request'));
            });
            req.end();
        });
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
