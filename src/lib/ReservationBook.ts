type Resources = {
    cpu: number;
    ram: number;
    hacks: number;
};

type ReservedEvent = {
    id: number;
    time: number;
    resources: Partial<Resources>;
};

type ProposedEvent = {
    offset: number;
    resources: Partial<Resources>;
    action?: () => void;
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

type ScheduleToken = {
    availability: [number, number][];
    claim: (offset: number) => boolean;
};

function getZeroResources(): Resources {
    return {
        cpu: 0,
        ram: 0,
        hacks: 0,
    };
};

function addResources(a: Resources, b: Partial<Resources>): void {
    for (const k in b) {
        const key = k as keyof Resources;
        const value = b[key];
        if (value != null) {
            a[key] += value;
        }
    }
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
        this.setTimeout = st ?? setTimeout;
        this.getTime = gt ?? (() => new Date().getTime());
        this.log = log ?? ((format, ...values) => {});
    }

    set(resource: keyof Resources, amount: number): void {
        this.baseResources[resource] = amount;
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

            while (ei < el) {;
                if (this.events[ei].time > rt) {
                    break;
                } else {
                    addResources(res, this.events[ei].resources);
                    ei++;
                }
            }
            addResources(res, re.resources);
            for (const k in res) {
                const key = k as keyof Resources;
                if (res[key] < 0) {
                    return false;
                }
            }
        }

        return true;
    }

    private getAvailability(reservation: Reservation): [number, number][] {
        const reservationLength = reservation.events[reservation.events.length - 1].offset - reservation.events[0].offset;
        const reservationOffsets = new Set(reservation.events.map(x => x.offset));
        const eventTimes = new Set(this.events.map(x => x.time));

        const startingPointsSet = new Set<number>();
        for (const ro of reservationOffsets) {
            for (const et of eventTimes) {
                const sp = et - ro;
                if (sp >= reservation.minTime) {
                    startingPointsSet.add(sp);
                }
            }
        }

        startingPointsSet.add(reservation.minTime);
        startingPointsSet.add(reservation.maxTime);

        const startingPoints = [...startingPointsSet].sort((a, b) => a - b);
        const availability: [number, number][] = [];

        let start: number | undefined;
        for (const sp of startingPoints) {
            if (this.check(sp, reservation)) {
                if (start == null) {
                    start = sp;
                }
            } else {
                if (start != null) {
                    const end = sp - reservationLength;
                    if (end >= start) {
                        availability.push([start, end]);
                    }
                    start = undefined;
                }
            }
        }

        if (start != null) {
            const end = reservation.maxTime - reservationLength;
            if (end >= start) {
                availability.push([start, end]);
            }
        }

        return availability;
    }

    schedule(proposition: Proposition): ScheduleToken | null {
        if (proposition.events.length === 0) {
            return {
                availability: [],
                claim: (offset) => {
                    return true;
                }
            };
        }

        for (let i = 0; i < proposition.events.length; i++) {
            if (proposition.events[i].offset < 0) {
                this.log("reservation '%s' attempted with negative offset", proposition.name);
                return null;
            } else if (i === 0) {
                if (proposition.events[i].offset > 0) {
                    this.log("reservation '%s' attempted with non-zero initial offset", proposition.name);
                    return null;
                }
            } else if (proposition.events[i].offset < proposition.events[i - 1].offset) {
                this.log("reservation '%s' is not sorted ascending by offset", proposition.name);
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
                if (!this.check(start, reservation)) {
                    return false;
                }

                const id = this.nextId;

                const now = this.getTime();
                for (const event of reservation.events) {
                    this.events.push({
                        id: id,
                        time: start + event.offset,
                        resources: { ...event.resources }
                    });
                    this.events.sort((a, b) => a.time - b.time);
                    const action = event.action;
                    if (action != null) {
                        this.setTimeout(() => action(), Math.max(0, start - now + event.offset));
                    }
                }

                this.setTimeout(() => {
                    for (let i = this.events.length - 1; i >= 0; i--) {
                        if (this.events[i].id === id) {
                            this.events.splice(i, 1);
                        }
                    }
                }, Math.max(0, start - now + reservation.events[reservation.events.length - 1].offset));
                this.nextId++;

                return true;
            }
        };
    }
}
