import { NS } from "@ns";
import type { Server } from "./types";
import { getServers } from "/util";
import { ServerList } from "/ServerList";

const payloads: Record<string, { ram: number }> = {};

let ns: NS = undefined as any;
let serverList: ServerList = undefined as any;

const defaultOffsets = { minOffset: 500, maxOffset: 120000 };

function firstAvailability(...availabilities: [number, number][][]) : number | null {
    const choices = availabilities.flatMap(x => x.map(x => x[0]));
    for (const choice of choices) {
        const allMatch = availabilities.every(availability => {
            for (const [start, length] of availability) {
                if ((choice < start) || (choice > (start + length))) {
                    return false;
                }
            }
            return true;
        });
        if (allMatch) {
            return choice;
        }
    }
    return null;
}

/**
 * This queues up an inefficient schedule for hacking a server.
 * @param hostname The host to hack.
 */
function inefficientHack(hostname: string) : void {
    const curSec = ns.getServerSecurityLevel(hostname);
    const minSec = ns.getServerMinSecurityLevel(hostname);
    if (curSec > minSec) {
        const weakenCost = payloads["weaken.js"].ram;
        const threadsToWeaken = Math.ceil((curSec - minSec) / 0.05);
        const hackeeToken = serverList.getBook(hostname)?.schedule({
            name: "weaken.js",
            events: [
                { offset: 0, resources: { hacks: -1 } },
                { offset: 60000*3, resources: { hacks: 1 } }],
                ...defaultOffsets,
                maxOffset: 70000*3
        });
        if (hackeeToken == null) {
            return;
        }

        for (const hacker of serverList.getHackers()) {
            const hackerToken = serverList.getBook(hacker)?.schedule({
                name: "weaken.js",
                events: [{
                    offset: 0, resources: { ram: -weakenCost * threadsToWeaken },
                    action: () => {
                        ns.printf("RUN|%s %d|weaken.js %s", hacker, threadsToWeaken, hostname);
                        ns.exec("weaken.js", hacker, threadsToWeaken, hostname);
                    }
                }, { offset: 60000*3, resources: { ram: weakenCost * threadsToWeaken } }],
                ...defaultOffsets,
                maxOffset: 70000*3
            });
            if (hackerToken == null) {
                continue;
            }

            const start = firstAvailability(hackeeToken.availability, hackeeToken.availability);
            if (start == null) {
                continue;
            }

            hackeeToken.claim(start);
            hackerToken.claim(start);
            return;
        }

        return;
    }
}

export async function main(_ns: NS) : Promise<void> {
    ns = _ns;
    ns.disableLog("ALL");
    ns.clearLog();

    for (const file of ["hack.js", "grow.js", "weaken.js"]) {
        payloads[file] = {
            ram: ns.getScriptRam(file)
        };
    }

    serverList = new ServerList({
        ns,
        payloads: Object.keys(payloads),
        refreshFrequency: 60000,
        unhackable: [
            "home"
        ],
        log: (f, ...v) => ns.printf(f, ...v)
    });
    serverList.start();

    while (true) {
        await ns.asleep(5000);
        for (const hostname of serverList.getHackable()) {
            inefficientHack(hostname);
        }
    }
}
