/**
 * Waits and tweens that run on the stage's clock, so the game's speed
 * setting and pause apply to every scripted moment, and that can all be
 * cancelled at once when the player restarts or jumps to another chapter.
 */
import type { Stage } from '../scene/stage.ts';

/** Thrown inside a scripted sequence when it is cancelled. Sequences let it propagate; the runner swallows it. */
export class Cancelled extends Error {
    constructor() {
        super('cancelled');
        this.name = 'Cancelled';
    }
}

interface Waiter {
    until: number;
    resolve: () => void;
    reject: (error: Error) => void;
}

interface Tween {
    start: number;
    duration: number;
    update: (t: number) => void;
    resolve: () => void;
    reject: (error: Error) => void;
}

export class Timeline {
    private waiters: Waiter[] = [];
    private tweens: Tween[] = [];
    private epoch = 0;
    private now = 0;

    constructor(stage: Stage) {
        this.now = stage.time;
        stage.onUpdate((_dt, time) => this.tick(time));
    }

    private tick(time: number): void {
        this.now = time;
        if (this.waiters.length > 0) {
            const due = this.waiters.filter((waiter) => waiter.until <= time);
            if (due.length > 0) {
                this.waiters = this.waiters.filter((waiter) => waiter.until > time);
                for (const waiter of due) waiter.resolve();
            }
        }
        if (this.tweens.length > 0) {
            const done: Tween[] = [];
            for (const tween of this.tweens) {
                const t = Math.min((time - tween.start) / tween.duration, 1);
                tween.update(t);
                if (t >= 1) done.push(tween);
            }
            if (done.length > 0) {
                this.tweens = this.tweens.filter((tween) => !done.includes(tween));
                for (const tween of done) tween.resolve();
            }
        }
    }

    /** Resolves after `seconds` of stage time. */
    wait(seconds: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.waiters.push({ until: this.now + Math.max(seconds, 0), resolve, reject });
        });
    }

    /** Calls `update` with 0..1 every frame for `seconds`, then resolves. */
    tween(seconds: number, update: (t: number) => void): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.tweens.push({ start: this.now, duration: Math.max(seconds, 0.0001), update, resolve, reject });
        });
    }

    /** Awaits a promise from outside the timeline (a walk, a flight) and throws if the sequence was cancelled meanwhile. */
    async guard<T>(promise: Promise<T>): Promise<T> {
        const epoch = this.epoch;
        const value = await promise;
        if (epoch !== this.epoch) throw new Cancelled();
        return value;
    }

    /** Cancels every pending wait and tween; sequences awaiting them throw `Cancelled`. */
    cancel(): void {
        this.epoch += 1;
        const waiters = this.waiters;
        const tweens = this.tweens;
        this.waiters = [];
        this.tweens = [];
        const error = new Cancelled();
        for (const waiter of waiters) waiter.reject(error);
        for (const tween of tweens) tween.reject(error);
    }

    get time(): number {
        return this.now;
    }
}

/** Runs a scripted sequence and ignores its cancellation. Other errors are reported. */
export function run(sequence: () => Promise<void>): void {
    sequence().catch((error: unknown) => {
        if (error instanceof Cancelled) return;
        console.error(error);
    });
}
