declare global {
    namespace ioBroker {
        interface AdapterConfig {
            wlcHost: string;
            wlcUser: string;
            wlcPassword: string;
            pollInterval: number;
            absentThreshold: number;
            ignoreSelfSignedCert: boolean;
            users: Array<{ username: string; stateName: string }>;
        }
    }
}

export {};
