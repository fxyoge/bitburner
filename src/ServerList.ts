import { NS } from '@ns'
import { ReservationBook } from '/ReservationBook';

type ServerConnectionInfo = {
    hostname: string;
    depth: number;
    path: string[];
};

type Server = {
    initialized: boolean;
    rooted: boolean;
    ram: number;
    reqHackingLevel: number;
    maxMoney: number;
} & ServerConnectionInfo;

function getServers(ns: NS): ServerConnectionInfo[] {
    return [...recurseServers()].filter(s => {
        return s.hostname != "darkweb";
    });

    /**
     * @generator Traverses the connection tree in pre-order
     * @param current Starting point default to home
     * @param {string[]} visited Array of already visited servers
     * @param depth The current depth in traversal
     */
    function* recurseServers(current = "home", visited: string[] = [], depth = 0): any {
        if (!visited.includes(current)) {
            //ns.print(depth.toString().padStart(4) + " ||  ".repeat(depth + 1) + current)
            yield { hostname: current, depth: depth, path: [...visited.slice().reverse(), current] };
            const next = ns.scan(current);
            for (const n of next) {
                yield* recurseServers(n, [current, ...visited], depth + 1);
            }
        }
    }
}

const hacks: Record<string, (ns: NS, target: string) => void> = {
    "BruteSSH.exe":  (ns: NS, target: string) => ns.brutessh(target),
    "FTPCrack.exe":  (ns: NS, target: string) => ns.ftpcrack(target),
    "relaySMTP.exe": (ns: NS, target: string) => ns.relaysmtp(target),
    "HTTPWorm.exe":  (ns: NS, target: string) => ns.httpworm(target),
    "SQLInject.exe": (ns: NS, target: string) => ns.sqlinject(target)
};

export class ServerList {
    private readonly ns: NS;
    private readonly refreshFrequency: number;

    private readonly log: (format: string, ...values: any[]) => void;

    private servers: Record<string, Server> = {};

    private readonly onAnyUpdated: (() => (void | Promise<void>))[] = [];

    constructor(opts: {
        ns: NS;
        refreshFrequency: number;
        log?: (format: string, ...values: any[]) => void;
    }) {
        this.ns = opts.ns;
        this.refreshFrequency = opts.refreshFrequency;
        this.log = opts.log ?? ((format, ...values) => {});
    }

    private setupServer(hostname: string) : boolean {
        if (this.ns.getHackingLevel() < this.ns.getServerRequiredHackingLevel(hostname)) {
            return false;
        }

        try {
            for (const filename in hacks) {
                if (this.ns.fileExists(filename)) {
                    hacks[filename](this.ns, hostname);
                }
            }
        } catch {
            return false;
        }

        if (!this.ns.hasRootAccess(hostname)) {
            try {
                this.ns.nuke(hostname);
            } catch {
                return false;
            }
        }

        this.log("SVL|set up %s", hostname);
        return true;
    }

    private refresh() : void {
        let updated = false;

        for (const hostname in this.servers) {
            const server = this.servers[hostname];
            if (!server.initialized) {
                server.initialized = true;
                updated = true;
            }

            const reqHackingLevel = this.ns.getServerRequiredHackingLevel(hostname);
            if (server.reqHackingLevel !== reqHackingLevel) {
                server.reqHackingLevel = reqHackingLevel;
                updated = true;
            }

            const maxMoney = this.ns.getServerMaxMoney(hostname);
            if (server.maxMoney !== maxMoney) {
                server.maxMoney = maxMoney;
                updated = true;
            }

            if (!server.rooted) {
                const success = this.setupServer(hostname);
                if (success) {
                    server.rooted = true;
                    updated = true;
                }
            }

            const ram = this.ns.getServerMaxRam(hostname);
            if (server.ram !== ram) {
                server.ram = ram;
                updated = true;
            }
        }

        if (updated) {
            for (const fn of this.onAnyUpdated) {
                setTimeout(() => fn(), 0);
            }
        }

        setTimeout(() => this.refresh(), this.refreshFrequency);
    }

    start() : void {
        const ss = getServers(this.ns).map(x => ({
            ...x,
            rooted: false,
            ram: 0,
            initialized: false
        } as Server));
        for (const s of ss) {
            this.servers[s.hostname] = s;
        }
        this.refresh();
    }

    getRam(hostname: string) : number | undefined {
        return this.servers[hostname]?.ram;
    }

    getServer(hostname: string): Server | undefined {
        return this.servers[hostname];
    }

    getServers(options?: {
        rooted?: boolean;
        except?: string[];
        sortBy?: "smallest" | "largest";
    }): Server[] {
        let s = Object.values(this.servers);
        const except = options?.except;
        if (except != null) {
            s = s.filter(x => !except.includes(x.hostname));
        }

        if (options?.rooted) {
            s = s.filter(x => x.rooted);
        }

        if (options?.sortBy === "smallest") {
            s.sort((a, b) => a.ram - b.ram);
        } else if (options?.sortBy === "largest") {
            s.sort((a, b) => b.ram - a.ram);
        }

        return s;
    }

    on(event: "anyUpdated", fn: () => (void | Promise<void>)) {
        this.onAnyUpdated.push(fn);
    }
}
