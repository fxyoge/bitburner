import { NS } from '@ns'
import { ReservationBook } from '/ReservationBook';

type ServerConnectionInfo = {
    hostname: string;
    depth: number;
    path: string[];
};

type Server = {
    book: ReservationBook;
    rooted: boolean;
    ram: number;
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
    private readonly payloads: string[];
    private readonly refreshFrequency: number;
    private readonly unhackable: string[];

    private readonly log: (format: string, ...values: any[]) => void;

    private servers: Record<string, Server> = {};

    constructor(opts: {
        ns: NS;
        payloads: string[];
        refreshFrequency: number;
        unhackable: string[];
        log?: (format: string, ...values: any[]) => void;
    }) {
        this.ns = opts.ns;
        this.payloads = opts.payloads;
        this.refreshFrequency = opts.refreshFrequency;
        this.unhackable = opts.unhackable;
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

        try {
            for (const payload of this.payloads) {
                this.ns.scp(payload, hostname);
            }
        } catch {
            return false;
        }

        this.log("SVL|set up %s", hostname);
        return true;
    }

    private refresh() : void {
        for (const hostname in this.servers) {
            const server = this.servers[hostname];
            if (!server.rooted) {
                const success = this.setupServer(hostname);
                if (success) {
                    server.rooted = true;
                    server.book.set("hacks", 1);
                }
            }
            let ram = this.ns.getServerMaxRam(hostname);
            if (hostname === "home") {
                ram -= this.ns.getScriptRam("runner.js");
            }
            server.book.set("ram", ram);
            server.ram = ram;
        }

        setTimeout(() => this.refresh(), this.refreshFrequency);
    }

    start() : void {
        const ss = getServers(this.ns).map(x => ({
            ...x,
            book: new ReservationBook(undefined, undefined, this.log),
            rooted: false,
            ram: 0
        } as Server));
        for (const s of ss) {
            this.servers[s.hostname] = s;
        }
        this.refresh();
    }

    getBook(hostname: string) : ReservationBook | undefined {
        return this.servers[hostname]?.book;
    }

    getRam(hostname: string) : number | undefined {
        return this.servers[hostname]?.ram;
    }

    getHackable() : string[] {
        return Object.values(this.servers)
            .filter(x => x.rooted && !this.unhackable.includes(x.hostname))
            .map(x => x.hostname);
    }

    getServers(options?: {
        rooted?: boolean;
        except?: string[];
        sortBy?: "smallest" | "largest";
    }) : string[] {
        let s = Object.values(this.servers);
        const except = options?.except;
        if (except != null) {
            s = s.filter(x => !except.includes(x.hostname));
        }

        if (options?.rooted) {
            s = s.filter(x => x.rooted);
        }

        if (options?.sortBy === "smallest") {
            s.sort((a, b) => b.ram - a.ram);
        } else if (options?.sortBy === "largest") {
            s.sort((a, b) => a.ram - b.ram);
        }

        return s.map(x => x.hostname);
    }
}
