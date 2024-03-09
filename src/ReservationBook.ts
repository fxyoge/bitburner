type Resources = {
    ram: number;
    hacks: number;
    security: number;
    growLeft: number;
};

type ReservedEvent = {
    id: number;
    time: number;
    onCalc?: (res: Resources) => boolean;
};

type ProposedEvent = {
    offset: number;
    action?: () => void | Promise<void>;
    onCalc?: (res: Resources) => boolean;
};

type Proposition = {
    name: string;
    events: ProposedEvent[];
    minOffset: number;
    maxOffset: number;
};

type Reservation = {
    name: string;
    events: ProposedEvent[];
    minTime: number;
    maxTime: number;
};

export type ScheduleClaim = {
    cancel: () => void;
};

export type ScheduleToken = {
    availability: [number, number][];
    claim: (offset: number) => ScheduleClaim | null;
};

function getZeroResources(): Resources {
    return {
        ram: 0,
        hacks: 0,
        security: 0,
        growLeft: 0,
    };
};

function defaultExpectation(res: Resources): boolean {
    return res.ram >= 0 && res.hacks >= 0;
}

export class ReservationBook {
    private readonly baseResources: Resources = getZeroResources();

    private readonly setTimeout: (callback: () => void, ms?: number) => void;
    private readonly getTime: () => number;
    private readonly log: (format: string, ...values: any[]) => void;
    private nextId = 0;

    private readonly events: ReservedEvent[] = [];

    constructor(
        st?: (callback: () => void, ms?: number) => void,
        gt?: () => number,
        log?: (format: string, ...values: any[]) => void) {
        this.setTimeout = st ?? ((c, ms) => setTimeout(c, ms));
        this.getTime = gt ?? (() => new Date().getTime());
        this.log = log ?? ((format, ...values) => {});
    }

    set(resource: keyof Resources, amount: number): void {
        this.baseResources[resource] = amount;
    }

    get(resource: keyof Resources): number {
        return this.baseResources[resource];
    }

    private check(start: number, reservation: Reservation): boolean {
        let time = Math.min(this.events[0]?.time ?? start, start);
        
        const res = { ...this.baseResources };
        let ei = 0;
        const el = this.events.length;
        for (const re of reservation.events) {
            const rt = re.offset + start;
            if (rt < reservation.minTime || rt > reservation.maxTime) {
                return false;
            }

            while (ei < el) {
                if (this.events[ei].time >= rt) {
                    break;
                } else {
                    const success = this.events[ei].onCalc?.(res);
                    if (!(success ?? true) || !defaultExpectation(res)) {
                        return false;
                    }
                    ei++;
                }
            }
            const success = re.onCalc?.(res);
            if (!(success ?? true) || !defaultExpectation(res)) {
                return false;
            }
        }

        return true;
    }

    private getAvailability(reservation: Reservation): [number, number][] {
        const reservationLength = reservation.events[reservation.events.length - 1].offset - reservation.events[0].offset;
        const reservationOffsets = new Set(reservation.events.map(x => x.offset));
        const eventTimes = new Set(this.events.map(x => x.time));
        eventTimes.add(reservation.minTime);
        eventTimes.add(reservation.maxTime);

        const startingPointsSet = new Set<number>();
        for (const ro of reservationOffsets) {
            for (const et of eventTimes) {
                const sp = et - ro;
                if (sp >= reservation.minTime) {
                    startingPointsSet.add(sp);
                }
                if ((sp - 1) >= reservation.minTime) {
                    startingPointsSet.add(sp - 1);
                }
                if ((sp + 1) >= reservation.minTime) {
                    startingPointsSet.add(sp + 1);
                }
            }
        }

        const startingPoints = [...startingPointsSet].sort((a, b) => a - b);

        const availability: [number, number][] = [];

        let start: number | null = null;
        let end: number | null = null;
        for (const sp of startingPoints) {
            if (this.check(sp, reservation)) {
                if (start == null) {
                    start = sp;
                } else {
                    end = sp;
                }
            } else {
                if (start != null && end != null) {
                    availability.push([start, end]);
                }
                start = null;
                end = null;
            }
        }

        return availability;
    }

    private delete(id: number) : void {
        for (let i = this.events.length - 1; i >= 0; i--) {
            if (this.events[i].id === id) {
                this.events.splice(i, 1);
            }
        }
    }

    getUtilization(resource: keyof Resources, slots: number, lengthMs: number) : number[] {
        if (this.baseResources[resource] === 0) {
            return Array(slots).fill(0); 
        }

        const runningTotal = { ...this.baseResources };
        const timePerSlot = lengthMs / slots;
        const now = this.getTime();

        const ut: number[] = [];
        let ei = 0;
        const el = this.events.length;
        for (let i = 0; i < slots; i++) {
            while (ei < el) {
                if (this.events[ei].time > (now + timePerSlot * i)) {
                    break;
                } else {
                    this.events[ei].onCalc?.(runningTotal);
                    ei++;
                }
            }
            ut.push(this.baseResources[resource] - runningTotal[resource]);
        }

        return ut;
    }

    schedule(proposition: Proposition): ScheduleToken | null {
        if (proposition.events.length === 0) {
            return {
                availability: [],
                claim: (offset) => {
                    return {
                        cancel: () => {}
                    };
                }
            };
        }

        for (let i = 0; i < proposition.events.length; i++) {
            if (proposition.events[i].offset < 0) {
                this.log("RVB|%s attempted with negative offset", proposition.name);
                return null;
            } else if (i === 0) {
                if (proposition.events[i].offset > 0) {
                    this.log("RVB|%s attempted with non-zero initial offset", proposition.name);
                    return null;
                }
            } else if (proposition.events[i].offset < proposition.events[i - 1].offset) {
                this.log("RVB|%s is not sorted ascending by offset", proposition.name);
                return null;
            }
        }

        const now = this.getTime();
        const reservation: Reservation = {
            name: proposition.name,
            events: proposition.events,
            minTime: proposition.minOffset + now,
            maxTime: proposition.maxOffset + now
        };
        const availability = this.getAvailability(reservation);
        if (availability.length <= 0) {
            return null;
        }
        
        return {
            availability: availability,
            claim: (start) => {
                try {
                    if (!this.check(start, reservation)) {
                        return null;
                    }
    
                    const id = this.nextId;
    
                    const now = this.getTime();
                    for (const event of reservation.events) {
                        this.events.push({
                            id: id,
                            time: start + event.offset,
                            onCalc: event.onCalc
                        });
                        this.events.sort((a, b) => a.time - b.time);

                        const action = event.action;
                        const onCalc = event.onCalc;

                        if (action != null || onCalc != null) {
                            const ms = Math.max(0, start - now + event.offset);
                            this.log("RVB|%s scheduled in %d ms", proposition.name, ms);
                            if (action != null && onCalc != null) {
                                this.setTimeout(() => { action(); onCalc(this.baseResources); }, ms);
                            } else if (action != null) {
                                this.setTimeout(() => { action(); }, ms);
                            } else if (onCalc != null) {
                                this.setTimeout(() => { onCalc(this.baseResources); }, ms);
                            }
                        }
                    }
    
                    this.setTimeout(() => {
                        this.delete(id);
                    }, Math.max(0, start - now + reservation.events[reservation.events.length - 1].offset));
                    
                    this.nextId++;
    
                    return {
                        cancel: () => {
                            this.delete(id);
                        }
                    };
                } catch (err: any) {
                    this.log("RVB|%s errored: %s", reservation.name, err);
                    if ("stack" in err && err.stack) {
                        this.log("RVB|stack: %s", err.stack);
                    }
                    if ("cause" in err && err.cause) {
                        this.log("RVB|cause: %s", err.cause);
                    }
                    return null;
                }
            }
        };
    }
}
