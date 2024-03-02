export class MockEventQueue {
    now: number;
    readonly events: { callback: () => void, ms: number }[];
    
    constructor() {
        this.now = 0;
        this.events = [];
    }

    setTimeout(callback: () => void, ms?: number): void {
        this.events.push({ callback, ms: ms ?? 0 });
    }

    getTime(): number {
        return this.now;
    }

    executeTo(ms: number): void {
        if (this.now > ms) {
            throw new Error("cannot go back in time");
        }
        
        this.now = ms;

        if (this.events.length <= 0) {
            return;
        }

        this.events.sort((a, b) => (a.ms < b.ms ? -1 : a.ms === b.ms ? 0 : 1));

        let removeUpTo = -1;
        for (let i = 0; i < this.events.length; i++) {
            const event = this.events[i];
            if (event.ms <= this.now) {
                removeUpTo = i;
                event.callback();
            } else {
                break;
            }
        }

        if (removeUpTo > -1) {
            this.events.splice(0, removeUpTo + 1);
        }
    }
}
