import { NS } from "@ns";
import type { Server } from "./types";
import { ServerList } from "/ServerList";
import { ScheduleClaim } from "/ReservationBook";

const payloads: Record<string, { ram: number }> = {};

let ns: NS = undefined as any;
let servers: ServerList = undefined as any;

const roles: Record<string, { kind: "home" } | { kind: "upgrades" } | { kind: "hacker"; target: string; weaken: number; grow: number; hack: number; }> = {};

let target = "n00dles";
const ratio : Record<string, number> = {
    hack: 0,
    grow: 0,
    weaken: 1,
    alpha: 0.001
};

function runScript(script: string, hostname: string, threads: number, ...args: (string | number | boolean)[]) {
    ns.printf("RUN|%s: exec %s<%d> %j", hostname, script, threads, args);
    ns.scp(script, hostname);
    ns.exec(script, hostname, threads, ...args);
}

async function sleep(ms: number) : Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function forever() : Promise<void> {
    await new Promise<void>(() => {});
}

async function startReassigningRoles() {
    while (true) {
        const home = servers.getServer("home");
    
        const scriptRam : Record<string, number> = {
            "upgrades.js": ns.getScriptRam("upgrades.js"),
            "hack-loop.js": ns.getScriptRam("hack-loop.js"),
            "grow-loop.js": ns.getScriptRam("grow-loop.js"),
            "weaken-loop.js": ns.getScriptRam("weaken-loop.js"),
        };
        const upgrades = servers.getServers({
            rooted: true,
            sortBy: "smallest",
            except: ["home"]
        }).filter(x => x.ram >= scriptRam["upgrades.js"])[0];
    
        const hackers = servers.getServers({
            rooted: true,
            sortBy: "largest",
            except: ["home", ...(upgrades ? [upgrades.hostname] : [])]
        });
    
        if (upgrades != null) {
            if (roles[upgrades.hostname]?.kind !== "upgrades") {
                roles[upgrades.hostname] = { kind: "upgrades" };
                ns.killall(upgrades.hostname);
                runScript("upgrades.js", upgrades.hostname, 1);
            }
        }
    
        for (const h of hackers) {
            const threads : Record<string, number> = {
                weaken: 0,
                grow: 0,
                hack: 0
            };
            
            let ramLeft = h.ram;
            for (const s of ["weaken", "grow", "hack"]) {
                if (ramLeft <= 0) {
                    continue;
                }
    
                threads[s] = Math.round((h.ram * ratio[s]) / scriptRam[`${s}-loop.js`]);
                while (threads[s] > 0 && ramLeft < 0) {
                    ramLeft += scriptRam[`${s}-loop.js`];
                    threads[s] -= 1;
                }
    
                if (threads[s] > 0) {
                    ramLeft -= threads[s] * scriptRam[`${s}-loop.js`];
                }
            }
    
            const role = roles[h.hostname];
            if (role?.kind !== "hacker"
                || (role.kind === "hacker" && (
                    role.target !== target
                    || role.hack !== threads.hack
                    || role.grow !== threads.grow
                    || role.weaken !== threads.weaken
            ))) {
                roles[h.hostname] = {
                    kind: "hacker",
                    target,
                    hack: threads.hack,
                    grow: threads.grow,
                    weaken: threads.weaken
                };
                ns.killall(h.hostname);
                for (const s in threads) {
                    if (threads[s] > 0) {
                        runScript(`${s}-loop.js`, h.hostname, threads[s], target);
                    }
                }
            }
        }

        await sleep(60000);
    }
}

async function startAdjustingRatios() {
    while (true) {
        const originalRatioLogText = `RUN|new ratios: H${Math.round(ratio.hack * 100)} / G${Math.round(ratio.grow * 100)} / W${Math.round(ratio.weaken * 100)}`;

        const secLevel = ns.getServerSecurityLevel(target);
        const minSecLevel = ns.getServerMinSecurityLevel(target);
        const moneyAvailable = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);

        if (secLevel > (5 + minSecLevel)) {
            ratio.weaken += ratio.alpha;
            ratio.hack -= ratio.alpha;
        } else {
            ratio.weaken -= ratio.alpha;
            ratio.hack += ratio.alpha;

            if (moneyAvailable < (maxMoney * 0.9)) {
                ratio.grow += ratio.alpha;
                ratio.hack -= ratio.alpha;
            } else {
                ratio.grow -= ratio.alpha;
                ratio.hack += ratio.alpha;
            }
        }

        ratio.grow = Math.max(0, ratio.grow);
        ratio.weaken = Math.max(0, ratio.weaken);
        ratio.hack = Math.max(0, ratio.hack);

        const total = ratio.grow + ratio.hack + ratio.weaken;
        const copy = { ...ratio };
        ratio.hack = copy.hack / total;
        ratio.grow = copy.grow / total;
        ratio.weaken = copy.weaken / total;

        const newRatioLogText = `RUN|new ratios: H${Math.round(ratio.hack * 100)} / G${Math.round(ratio.grow * 100)} / W${Math.round(ratio.weaken * 100)}`;

        if (originalRatioLogText !== newRatioLogText) {
            ns.print(newRatioLogText);
        }

        await sleep(5000);
    }
}

async function startSelectingTargets() {
    while (true) {
        const myHackingLevel = ns.getHackingLevel();
        const hackable = servers.getServers()
            .filter(x => x.reqHackingLevel < (myHackingLevel * 0.333))
            .filter(x => x.hostname !== "home" && !x.hostname.startsWith("pserv-"));
        hackable.sort((a, b) => (b.maxMoney - a.maxMoney));
        
        const newTarget = hackable.length <= 0
            ? "n00dles"
            : hackable[0].hostname;
        if (target !== newTarget) {
            target = newTarget;
            ns.printf("RUN|new target: %s with max money %d", target, hackable[0].maxMoney);
        }
        await sleep(120000);
    }
}

export async function main(_ns: NS) : Promise<void> {
    ns = _ns;
    ns.disableLog("ALL");
    ns.clearLog();

    servers = new ServerList({
        ns: _ns,
        refreshFrequency: 10000,
    });

    servers.start();

    for (const hostname of servers.getServers({ except: ["home"] }).map(x => x.hostname)) {
        ns.killall(hostname);
    }
    
    startAdjustingRatios();

    await sleep(5000);
    startSelectingTargets();

    await sleep(5000);
    startReassigningRoles();

    await forever();
}
