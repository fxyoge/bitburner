import { NS } from "@ns";

let ns: NS = undefined as any;

function logNoodles() {
    const stats = {
        bsec: ns.getServerBaseSecurityLevel("n00dles"),
        msec: ns.getServerMinSecurityLevel("n00dles"),
        sec: ns.getServerSecurityLevel("n00dles"),
        mcash: ns.getServerMaxMoney("n00dles"),
        cash: ns.getServerMoneyAvailable("n00dles"),
    };
    ns.print(stats);
}

export async function main(_ns: NS) : Promise<void> {
    ns = _ns;
    ns.disableLog("ALL");

    logNoodles();
    await ns.weaken("n00dles");
    logNoodles();
}
