// import { NS } from "@ns";
// import type { Server } from "./types";
// import { ServerList } from "/ServerList";
// import { ScheduleClaim } from "/ReservationBook";

// const payloads: Record<string, { ram: number }> = {};

// let ns: NS = undefined as any;
// let serverList: ServerList = undefined as any;

// const requests: {
//     script: string;
// }[] = [];

// const defaultOffsets = { minOffset: 500, maxOffset: 120000 };

// async function sleep(ms: number) : Promise<void> {
//     await new Promise(resolve => setTimeout(resolve, ms));
// }

// function firstAvailability(...availabilities: [number, number][][]) : number | null {
//     const choices = availabilities.flatMap(x => x.map(x => x[0]));
//     for (const choice of choices) {
//         const allMatch = availabilities.every(availability => {
//             for (const [start, length] of availability) {
//                 if ((choice < start) || (choice > (start + length))) {
//                     return false;
//                 }
//             }
//             return true;
//         });
//         if (allMatch) {
//             return choice;
//         }
//     }
//     return null;
// }

// async function waitPidDone(pid: number) {
//     while (true) {
//         await sleep(5000);
//         if (!ns.isRunning(pid)) {
//             return;
//         }
//     }
// }

// function scheduleInefficientScript(script: string, hostname: string, options: {
//     maxOutRam?: boolean;
//     threads?: number;
//     threadsOrMax?: number;
// }) : void {
//     const hackeeToken = serverList.getBook(hostname)?.schedule({
//         name: script,
//         events: [
//             { offset: 0, onCalc: (r) => { r.hacks -= 1; return true; } },
//             { offset: 60000*5, onCalc: (r) => { r.hacks += 1; return true; } }],
//         ...defaultOffsets,
//         maxOffset: 60000*5+4000
//     });

//     if (hackeeToken == null) {
//         return;
//     }

//     let hackeeClaim: ScheduleClaim | null = null;
//     let hackerClaim: ScheduleClaim | null = null;

//     const scriptCost = ns.getScriptRam(script);

//     for (const hacker of serverList.getServers({
//         rooted: true,
//         sortBy: "largest"
//     })) {
//         let threads = 0;
//         if (options.threads != null) {
//             threads = options.threads;
//         } else if (options.maxOutRam) {
//             threads = Math.floor((serverList.getRam(hacker) ?? 0) / scriptCost);
//         } else if (options.threadsOrMax != null) {
//             threads = Math.min(
//                 options.threadsOrMax,
//                 Math.floor((serverList.getRam(hacker) ?? 0) / scriptCost)
//             );
//         }

//         if (threads <= 0) {
//             continue;
//         }

//         const hackerToken = serverList.getBook(hacker)?.schedule({
//             name: `${hacker} ${script}<${threads}> ${hostname}`,
//             events: [{
//                 offset: 0, onCalc: (r) => { r.ram -= (scriptCost * threads); return true; },
//                 action: () => {
//                     ns.scp(script, hostname);
//                     ns.exec(script, hacker, threads, hostname);
//                 }
//             }, { offset: 60000*5, onCalc: (r) => { r.ram += (scriptCost * threads); return true; } }],
//             ...defaultOffsets,
//             maxOffset: 60000*5+4000
//         });

//         if (hackerToken == null) {
//             continue;
//         }

//         const start = firstAvailability(hackeeToken.availability, hackerToken.availability);
//         if (start == null) {
//             continue;
//         }

//         hackeeClaim = hackeeToken.claim(start);
//         if (hackeeClaim != null) {
//             hackerClaim = hackerToken.claim(start);
//             if (hackerClaim == null) {
//                 hackeeClaim.cancel();
//             } else {
//                 return;
//             }
//         }
//     }
// }

// /**
//  * This queues up an inefficient schedule for hacking a server.
//  * @param hostname The host to hack.
//  */
// function inefficientHack(hostname: string) : void {
//     const curSec = ns.getServerSecurityLevel(hostname);
//     const minSec = ns.getServerMinSecurityLevel(hostname);
//     if (curSec > minSec) {
//         const threads = Math.ceil((curSec - minSec) / 0.05);
//         scheduleInefficientScript("weaken.js", hostname, { threadsOrMax: threads });
//         return;
//     }

//     const curMoney = ns.getServerMoneyAvailable(hostname);
//     const maxMoney = ns.getServerMaxMoney(hostname);
//     if (curMoney < maxMoney) {
//         scheduleInefficientScript("grow.js", hostname, { maxOutRam: true });
//         return;
//     }

//     scheduleInefficientScript("hack.js", hostname, { maxOutRam: true });
// }

// function scheduleUtility(hostname: string, script: string) {
//     const scriptCost = ns.getScriptRam(script);

//     let claim: ScheduleClaim | null = null;
//     const token = serverList.getBook(hostname)?.schedule({
//         name: `${hostname} ${script}<1>`,
//         events: [{
//             offset: 0, onCalc: (r) => { r.ram -= scriptCost; return true; },
//             action: () => {
//                 ns.scp(script, hostname);
//                 ns.exec(script, hostname, 1);
//             }
//         }, { offset: 1000, onCalc: (r) => { r.ram += scriptCost; return true; } }],
//         minOffset: 500,
//         maxOffset: 15000
//     });
//     if (token == null) {
//         return false;
//     }

//     const start = token.availability[0][0];
//     claim = token.claim(start);
//     if (claim != null) {
//         return true;
//     }

//     return false;
// }

// async function requestUpgrades() {
//     while (true) {
//         await sleep(15000);
//         requests.push({
//             script: "upgrades.js"
//         });
//     }
// }

// export async function main(_ns: NS) : Promise<void> {
//     ns = _ns;
//     ns.disableLog("ALL");
//     ns.clearLog();

//     for (const file of ["hack.js", "grow.js", "weaken.js", "upgrades.js"]) {
//         payloads[file] = {
//             ram: ns.getScriptRam(file)
//         };
//     }

//     serverList = new ServerList({
//         ns,
//         payloads: Object.keys(payloads),
//         refreshFrequency: 60000,
//         unhackable: [
//             "home",
//             "pserv-0", "pserv-1", "pserv-2", "pserv-3", "pserv-4",
//             "pserv-5", "pserv-6", "pserv-7", "pserv-8", "pserv-9",
//             "pserv-10", "pserv-11", "pserv-12", "pserv-13", "pserv-14",
//             "pserv-15", "pserv-16", "pserv-17", "pserv-18", "pserv-19",
//             "pserv-20", "pserv-21", "pserv-22", "pserv-23", "pserv-24",
//         ],
//         log: (f, ...v) => ns.printf(f, ...v)
//     });
//     serverList.start();


//     for (const server of serverList.getServers({ except: ["home"] })) {
//         const ps = ns.ps(server);
//         for (const pid of ps.map(x => x.pid)) {
//             ns.kill(pid);
//         }
//     }

//     requestUpgrades();

//     while (true) {
//         await sleep(2000);

//         for (const hostname of serverList.getServers({
//             rooted: true,
//             sortBy: "smallest"
//         })) {
//             const nextRequest = requests[0];
//             if (nextRequest != null && scheduleUtility(hostname, nextRequest.script)) {
//                 requests.shift();
//             }
//         }

//         for (const hostname of serverList.getHackable()) {
//             inefficientHack(hostname);

//             // const ram = serverList.getBook(hostname)?.getUtilization("ram", 32, 1000);
//             // const hacks = serverList.getBook(hostname)?.getUtilization("hacks", 32, 1000);
//             // ns.printf("UTL|%s|ram   %s", hostname, ram?.map(x => Math.ceil(x * 9)).join(""));
//             // ns.printf("UTL|%s|hacks %s", hostname, hacks?.map(x => Math.ceil(x * 9)).join(""));
//         }
//     }
// }
