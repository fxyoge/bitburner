import { NS } from "@ns";
import type { Server } from "./types";
import { getServers, openServer } from "/util";

const protectedTargets = [
    "home"
];

const payloadVersion = "1";
const payloads: Record<string, { ram: number }> = {};

let ns: NS = undefined as any;

const servers: Server[] = [];

const updateRequested = false;

function refreshServerState(server: Server) {
    if (server.protected == null && protectedTargets.includes(server.hostname)) {
        server.protected = true;
    }

    if (!server.protected && !server.hasRootAccess) {
        server.hasRootAccess = ns.hasRootAccess(server.hostname);
        if (!server.hasRootAccess) {
            openServer(ns, server.hostname);
            server.hasRootAccess = ns.hasRootAccess(server.hostname);
        }
    }

    if (server.hasRootAccess && server.payloadVersion !== payloadVersion) {
        for (const payload in payloads) {
            ns.scp(payload, server.hostname);
        }
        server.payloadVersion = payloadVersion;
        server.schedulable = true;
    }

    if (server.schedulable) {
        server.serverStats = ns.getServer();
    }

    if (server.hasRootAccess) {
        server.minSecurityLevel = ns.getServerMinSecurityLevel(server.hostname);
        server.securityLevel = ns.getServerSecurityLevel(server.hostname);
    }
}

// function updateAssignments() {
//     if (!updateRequested) {
//         return;
//     }
//     updateRequested = false;

//     for (const target of servers.filter(x => {
//         return x.hasRootAccess && !x.protected && (x.securityLevel > x.minSecurityLevel)
//     })) {
//         const threadsNeeded = (target.securityLevel - target.minSecurityLevel) / 0.05;
//         for (const s of servers.filter(x => {
//             return x.hasRootAccess && x.schedulable && ((x.serverStats?.maxRam ?? 0) - (x.serverStats?.ramUsed)) > 0;
//         }))
//     }
// }

// function requestUpdate() {
//     updateRequested = true;
//     setTimeout(() => updateAssignments());
// }

// function requestUpdatePeriodically(time: number) {
//     requestUpdate();
//     setTimeout(() => requestUpdatePeriodically(time), time);
// }

export async function main(_ns: NS) : Promise<void> {
    ns = _ns;
    ns.disableLog("ALL");

    for (const file of ["hack.js", "grow.js", "weaken.js"]) {
        payloads[file] = {
            ram: ns.getScriptRam(file)
        };
    }

    const s = getServers(ns);
    for (const server of s) {
        refreshServerState(server);
        servers.push(server);
    }

    //requestUpdatePeriodically(60000);

    // const forever = new Promise();
    // await forever;
}
