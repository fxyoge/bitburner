import { MockEventQueue } from "./MockEventQueue";
import { ReservationBook } from "./ReservationBook";

it("reserves nothing", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    
    const token = book.schedule({ 
        name: "test reservation",
        events: [],
        minOffset: 0,
        maxOffset: 1000
    });
    expect(token).not.toBeNull();

    const claimed = token?.claim(0);
    expect(claimed).toBeTruthy();

    expect(queue.events).toHaveLength(0);
});

it("reserves more resources than the machine has", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 1);
    
    const token = book.schedule({
        name: "san diego",
        events: [{
            offset: 0,
            onCalc: (r) => { r.ram -= 2; return true; }
        }, {
            offset: 100,
            onCalc: (r) => { r.ram += 2; return true; }
        }],
        minOffset: 0,
        maxOffset: 1000
    });
    expect(token).toBeNull();
});

it("generates a single block", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 10);
    
    const state = [false, false];
    const token = book.schedule({
        name: "paris",
        events: [{
            offset: 0,
            action: () => { state[0] = true },
            onCalc: (r) => { r.ram -= 2; return true; }
        }, {
            offset: 100,
            action: () => { state[1] = true },
            onCalc: (r) => { r.ram += 2; return true; }
        }],
        minOffset: 0,
        maxOffset: 1000
    });
    expect(logs).toHaveLength(0);
    expect(token).not.toBeNull();
    expect(token?.availability).toEqual([[0, 900]]);
    const claimed = token?.claim(0);
    expect(claimed).toBeTruthy();

    expect(queue.events[0].ms).toBe(0);
    expect(queue.events[1].ms).toBe(100);
    
    expect(state[0]).toBeFalsy();
    queue.executeTo(0);
    expect(state[0]).toBeTruthy();
    expect(state[1]).toBeFalsy();
    queue.executeTo(99);
    expect(state[1]).toBeFalsy();
    queue.executeTo(100);
    expect(state[1]).toBeTruthy();
});

it("one block blocks another", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 3);
    
    const state = [false, false, false, false];
    const tokenA = book.schedule({
        name: "apples",
        events: [{ offset: 0,   action: () => { state[0] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 800, action: () => { state[1] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 100,
        maxOffset: 1000
    });

    expect(tokenA?.availability).toEqual([[100, 200]]);
    const claimedA = tokenA?.claim(100);
    expect(claimedA).toBeTruthy();

    expect(queue.events[0].ms).toBe(100);
    expect(queue.events[1].ms).toBe(900);

    const tokenB = book.schedule({
        name: "oranges",
        events: [{ offset: 0,   onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 800, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenB).toBeNull();
});

it("can't schedule a block that would go over the max", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 3);
    
    const state = [false, false, false, false];
    const tokenA = book.schedule({
        name: "garbage",
        events: [{ offset: 0,   action: () => { state[0] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 800, action: () => { state[1] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 400,
        maxOffset: 1000
    });

    expect(tokenA).toBeNull();
});

it("two blocks scheduled next to each other, in chronological order", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 3);
    
    const state = [false, false, false, false];
    const tokenA = book.schedule({
        name: "apples 2",
        events: [{ offset: 0,   action: () => { state[0] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 400, action: () => { state[1] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenA?.availability).toEqual([[0, 600]]);
    const claimedA = tokenA?.claim(200);
    expect(claimedA).not.toBeNull();

    expect(queue.events[0].ms).toBe(200);
    expect(queue.events[1].ms).toBe(600);
    expect(queue.events[2].ms).toBe(600);

    const tokenB = book.schedule({
        name: "oranges 2",
        events: [{ offset: 0,   action: () => { state[2] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 399, action: () => { state[3] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenB?.availability).toEqual([[601, 601]]);
    const claimedB = tokenB?.claim(600);
    expect(claimedB).not.toBeNull();

    expect(queue.events[3].ms).toBe(600);
    expect(queue.events[4].ms).toBe(1000);
    expect(queue.events[5].ms).toBe(1000);
});

it("two blocks scheduled next to each other, in reverse order", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 3);
    
    const state = [false, false, false, false];
    const tokenA = book.schedule({
        name: "apples 3",
        events: [{ offset: 0,   action: () => { state[0] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 400, action: () => { state[1] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenA?.availability).toEqual([[0, 600]]);
    const claimedA = tokenA?.claim(600);
    expect(claimedA).not.toBeNull();

    expect(queue.events[0].ms).toBe(600);
    expect(queue.events[1].ms).toBe(1000);
    expect(queue.events[2].ms).toBe(1000);

    const tokenB = book.schedule({
        name: "oranges 3",
        events: [{ offset: 0,   action: () => { state[2] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 400, action: () => { state[3] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenB?.availability).toEqual([[0, 199]]);
    const claimedB = tokenB?.claim(199);
    expect(claimedB).not.toBeNull();

    expect(queue.events[3].ms).toBe(199);
    expect(queue.events[4].ms).toBe(599);
    expect(queue.events[5].ms).toBe(599);
});

it("can schedule hack and ram at the same time", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("hacks", 1);
    book.set("ram", 3);
    
    const state = [false, false, false, false];
    const tokenA = book.schedule({
        name: "hacks",
        events: [{ offset: 0,    action: () => { state[0] = true }, onCalc: (r) => { r.hacks -= 1; return true; } },
                 { offset: 1000, action: () => { state[1] = true }, onCalc: (r) => { r.hacks += 1; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenA?.availability).toEqual([[0, 0]]);
    const claimedA = tokenA?.claim(0);
    expect(claimedA).not.toBeNull();

    expect(queue.events[0].ms).toBe(0);
    expect(queue.events[1].ms).toBe(1000);
    expect(queue.events[2].ms).toBe(1000);

    const tokenB = book.schedule({
        name: "ram",
        events: [{ offset: 0,    action: () => { state[2] = true }, onCalc: (r) => { r.ram -= 2; return true; } },
                 { offset: 1000, action: () => { state[3] = true }, onCalc: (r) => { r.ram += 2; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenB?.availability).toEqual([[0, 0]]);
    const claimedB = tokenB?.claim(0);
    expect(claimedB).not.toBeNull();

    expect(queue.events[3].ms).toBe(0);
    expect(queue.events[4].ms).toBe(1000);
    expect(queue.events[5].ms).toBe(1000);
});

it("sets ram to zero and can't schedule anything else", () => {
    const queue = new MockEventQueue();
    const logs: [string, ...any][] = [];
    const book = new ReservationBook(
        (callback, ms) => queue.setTimeout(callback, ms),
        () => queue.getTime(),
        (format, ...values) => logs.push([format, ...values]));
    book.set("ram", 100);
    
    const state = [false, false, false, false];
    const tokenA = book.schedule({
        name: "setter",
        events: [{ offset: 0,   action: () => { state[0] = true }, onCalc: (r) => { r.ram = 0; return true; } },
                 { offset: 100, action: () => { state[1] = true } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenA?.availability).toEqual([[0, 900]]);
    const claimedA = tokenA?.claim(0);
    expect(claimedA).not.toBeNull();

    expect(queue.events[0].ms).toBe(0);
    expect(queue.events[1].ms).toBe(100);
    expect(queue.events[2].ms).toBe(100);

    const tokenB = book.schedule({
        name: "blocked",
        events: [{ offset: 0, action: () => { state[2] = true }, onCalc: (r) => { r.ram -= 1; return true; } },
                 { offset: 1, action: () => { state[3] = true }, onCalc: (r) => { r.ram += 1; return true; } }],
        minOffset: 0,
        maxOffset: 1000
    });

    expect(tokenB).toBeNull();
});

// it("generates a block with contention", () => {
//     const queue = new MockEventQueue();
//     const logs: [string, ...any][] = [];
//     const book = new ReservationBook(
//         (callback, ms) => queue.setTimeout(callback, ms),
//         () => queue.getTime(),
//         (format, ...values) => logs.push([format, ...values]));
//     book.set("cpu", 10);
    
//     const token = book.schedule({
//         name: "a",
//         events: [{ offset: 0,   resources: { cpu: -2 } },
//                  { offset: 100, resources: { cpu:  2 } }],
//         minOffset: 0,
//         maxOffset: 1000
//     });
//     expect(logs).toHaveLength(0);
//     expect(token).not.toBeNull();
//     expect(token?.availability).toEqual([[0, 1000]]);
// });
