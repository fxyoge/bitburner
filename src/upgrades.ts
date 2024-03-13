import { NS, Multipliers } from "@ns";

async function sleep(ms: number) : Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
}

let ns: NS = undefined as any;
let servers: {
    level: number;
    ram: number;
    cores: number;
    production: number;
    gainIfLevel: number | null;
    gainIfRam: number | null;
    gainIfCores: number | null;
}[] = [];

function getHacknodeProductionRate(level: number, ram: number, cores: number, mult: number): number {
    return (
        (level * 1.5) *
        (Math.pow(1.035, ram - 1)) *
        ((cores + 5) / 6) *
        mult
    );
}

function refreshHacknetServer(index: number): void {
    const stats = ns.hacknet.getNodeStats(index);

    const production = stats.production;

    const mult = ns.getHacknetMultipliers().production;

    const levelCost = ns.hacknet.getLevelUpgradeCost(index);
    const gainIfLevel = !Number.isFinite(levelCost)
        ? null
        : (getHacknodeProductionRate(stats.level + 1, stats.ram, stats.cores, mult) - production) / levelCost;

    const ramCost = ns.hacknet.getRamUpgradeCost(index);
    const gainIfRam = !Number.isFinite(ramCost)
        ? null
        : (getHacknodeProductionRate(stats.level, stats.ram * 2, stats.cores, mult) - production) / ramCost;

    const coresCost = ns.hacknet.getCoreUpgradeCost(index);
    const gainIfCores = !Number.isFinite(coresCost)
        ? null
        : (getHacknodeProductionRate(stats.level, stats.ram, stats.cores + 1, mult) - production) / coresCost;

    servers[index] = {
        level: stats.level,
        ram: stats.ram,
        cores: stats.cores,
        production,
        gainIfLevel,
        gainIfRam,
        gainIfCores
    };
}

function getBestAction(): ["level" | "ram" | "cores" | null, number, number] {
    let bestAction: "level" | "ram" | "cores" | null = null;
    let bestIndex = -1;
    let bestGain = -10000;

    for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        if (server.gainIfLevel != null && server.gainIfLevel > bestGain) {
            bestAction = "level";
            bestIndex = i;
            bestGain = server.gainIfLevel;
        }
        if (server.gainIfRam != null && server.gainIfRam > bestGain) {
            bestAction = "ram";
            bestIndex = i;
            bestGain = server.gainIfRam;
        }
        if (server.gainIfCores != null && server.gainIfCores > bestGain) {
            bestAction = "cores";
            bestIndex = i;
            bestGain = server.gainIfCores;
        }
    }

    return [bestAction, bestIndex, bestGain];
}

function upgradeHacknet() {
    for (let i = 0; i < 10; i++) {
        if (ns.hacknet.purchaseNode() < 0) {
            break;
        } else {
            ns.print("bought a new hacknet node");
        }
    }

    const numNodes = ns.hacknet.numNodes();
    for (let i = 0; i < numNodes; i++) {
        refreshHacknetServer(i);
    }

    for (let i = 0; i < 100; i++) {
        try {
            const [action, index, gain] = getBestAction();
            if (action == null) {
                break;
            }

            ns.printf("upgrading %s for hacknet node %d, for %f gain", action, index, gain);

            if (action === "level") {
                if (!ns.hacknet.upgradeLevel(index)) {
                    break;
                }
            } else if (action === "cores") {
                if (!ns.hacknet.upgradeCore(index)) {
                    break;
                }
            } else if (action === "ram") {
                if (!ns.hacknet.upgradeRam(index)) {
                    break;
                }
            } else {
                throw new Error("bruh");
            }
            
            refreshHacknetServer(index);
        } catch {
            break;
        }
    }
}

function upgradeServers() {
    let pservers = ns.getPurchasedServers();
    for (let i = pservers.length; i < ns.getPurchasedServerLimit(); i++) {
        const hostname = ns.purchaseServer("pserv-0", 2);
        if (hostname !== "") {
            ns.print("purchased a new server!");
        }
    }

    pservers = ns.getPurchasedServers();
    const maxRam = ns.getPurchasedServerMaxRam();
    for (const pserver of pservers) {
        const currentRam = ns.getServerMaxRam(pserver);
        if (currentRam >= maxRam) {
            continue;
        }

        if (ns.upgradePurchasedServer(pserver, currentRam * 2)) {
            ns.printf("upgraded %s to %d ram", pserver, currentRam * 2);
        }
    }
}

export async function main(_ns: NS) : Promise<void> {
    ns = _ns;
    ns.disableLog("ALL");
    ns.clearLog();

    while (true) {
        upgradeServers();
        upgradeHacknet();
        await sleep(5000);
    }
}
