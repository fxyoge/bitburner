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
