import { NS } from "@ns";
import type { Server } from "./types";

export function getServers(ns: NS): Server[] {
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
    "BruteSSH.exe": (ns: NS, target: string) => ns.brutessh(target),
    "FTPCrack.exe": (ns: NS, target: string) => ns.ftpcrack(target),
    "relaySMTP.exe": (ns: NS, target: string) => ns.relaysmtp(target),
    "HTTPWorm.exe": (ns: NS, target: string) => ns.httpworm(target),
    "SQLInject.exe": (ns: NS, target: string) => ns.sqlinject(target)
};

export function openServer(ns: NS, hostname: string): boolean {
    if (ns.hasRootAccess(hostname)) {
        return true;
    }

    if (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(hostname)) {
        return false;
    }

    try {
        for (const filename in hacks) {
            if (ns.fileExists(filename)) {
                hacks[filename](ns, hostname);
            }
        }
    } catch (err) {
        ns.print(`cannot open ports on ${hostname}: ${err}`);
    }

    try {
        ns.nuke(hostname);
    } catch (err) {
        ns.print(`cannot nuke ${hostname}: ${err}`);
    }

    if (ns.hasRootAccess(hostname)) {
        return true;
    }

    return false;
}
