import { Server as NSServer } from "@ns";
export type Server = {
    hostname: string;
    depth: number;
    path: string[];

    protected?: boolean;
    payloadVersion?: string;
    hasRootAccess?: boolean;
    schedulable?: boolean;

    serverStats?: NSServer;

    securityLevel?: number;
    minSecurityLevel?: number;
};
