/**
 * Paving: roads laid in courses of stones, a plaza of square tiles, and
 * rings of stones round a centre. Both islands are paved with it, so the
 * market quarter's paths match the town's.
 *
 * The stones gather in one `Bits` and join the ground's own mesh, so a whole
 * island's paving adds nothing to draw.
 */
import { PALETTE, type Sculpt, seeded } from '../scene/kit.ts';
import { Bits, flagstone, paver } from './props.ts';

/** Height of the road and plaza surface above the grass. */
export const PAVE = 0.05;

/** How far the joints between paving stones sink below the walking surface. */
const RELIEF = 0.012;
/** The width of a joint. */
const JOINT = 0.036;
/** Roads that overlap sit this far apart in height, so they never flicker. */
export const LIFT = 0.0006;

export const GROUT = '#c8b189';
const ROAD_TONES = ['#f0e4c9', '#ecdfc2', '#f3e8d0', '#e9dbbc'] as const;
const ROAD_ACCENTS = ['#e3ceae', '#dcd3c3', '#e8d2bc'] as const;
export const PLAZA_TONES = ['#f5ebd6', '#f2e6cf', '#f7efdd', '#efe3ca'] as const;
export const PLAZA_ACCENT = '#e8cbb3';
export const KERB_TONES = ['#d8ccb5', '#d2c6ae', '#ddd3bf'] as const;

/** A patch of ground with sides along X and Z. */
export interface Rect {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
}

/** A rectangle from its centre and size. */
export function rectAt(x: number, z: number, w: number, d: number): Rect {
    return { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
}

/** What is left of `piece` outside `hole`: up to four rectangles. */
export function cutOut(piece: Rect, hole: Rect): Rect[] {
    if (piece.x1 <= hole.x0 || piece.x0 >= hole.x1 || piece.z1 <= hole.z0 || piece.z0 >= hole.z1) return [piece];
    const left: Rect[] = [];
    if (piece.x0 < hole.x0) left.push({ ...piece, x1: hole.x0 });
    if (piece.x1 > hole.x1) left.push({ ...piece, x0: hole.x1 });
    const x0 = Math.max(piece.x0, hole.x0);
    const x1 = Math.min(piece.x1, hole.x1);
    if (piece.z0 < hole.z0) left.push({ x0, x1, z0: piece.z0, z1: hole.z0 });
    if (piece.z1 > hole.z1) left.push({ x0, x1, z0: hole.z1, z1: piece.z1 });
    return left;
}

/** A road or the plaza. `run` is the way its stones are laid; a higher `rank` runs through where two meet. */
export interface Road {
    area: Rect;
    run: 'x' | 'z' | 'plaza';
    rank: number;
}

/** Lays stones for one island, the same on every load: `seed` picks the cut of every stone and its tone. */
export class Paving {
    readonly stones = new Bits();
    private readonly laid: () => number;

    constructor(seed: number) {
        this.laid = seeded(seed);
    }

    /** One of `list`, at random. */
    pick<T>(list: readonly T[]): T {
        return list[Math.floor(this.laid() * list.length)] as T;
    }

    /** Lays one stone in `cell`, cut back to what lies outside `holes`, with half a joint clear all round. */
    lay(cell: Rect, holes: readonly Rect[], top: number, tone: string): void {
        let pieces: Rect[] = [cell];
        for (const hole of holes) pieces = pieces.flatMap((piece) => cutOut(piece, hole));
        for (const piece of pieces) {
            const x0 = piece.x0 + JOINT / 2;
            const x1 = piece.x1 - JOINT / 2;
            const z0 = piece.z0 + JOINT / 2;
            const z1 = piece.z1 - JOINT / 2;
            if (x1 - x0 < 0.09 || z1 - z0 < 0.09) continue;
            paver(this.stones, tone, x0, z0, x1, z1, top - RELIEF, RELIEF);
        }
    }

    /** Walks from `from` to `to` in stone lengths between `min` and `max`. */
    course(from: number, to: number, min: number, max: number, each: (a: number, b: number) => void): void {
        // Start part-way into a stone, so neighbouring courses break joint.
        let at = from - this.laid() * min * 0.6;
        while (at < to - 1e-6) {
            let next = at + min + this.laid() * (max - min);
            if (to - next < min * 0.6) next = to;
            each(Math.max(at, from), next);
            at = next;
        }
    }

    /**
     * Ranks `roads` in the order given (the first runs through the ones
     * after it), then lays each on a bed for its joints, with a margin a
     * step lower. `holes` lists extra patches one road leaves for stones of
     * its own.
     */
    roads(ground: Sculpt, roads: readonly Road[], holes: (road: Road) => readonly Rect[] = () => []): void {
        roads.forEach((item, i) => {
            item.rank = roads.length - i;
        });
        roads.forEach((item, index) => {
            const { area, run, rank } = item;
            const lift = rank * LIFT;
            const top = PAVE + lift;
            const w = area.x1 - area.x0;
            const d = area.z1 - area.z0;
            const centre: [number, number, number] = [(area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2];
            // The margin, a step lower, and the bed the joints show.
            ground.box(w + 0.16, PAVE * 0.6 + lift, d + 0.16, { color: PALETTE.pathEdge, at: centre, r: 0 });
            ground.box(w, PAVE - RELIEF + lift, d, { color: GROUT, at: centre, r: 0 });

            if (run === 'plaza') {
                // A border course all round, then square tiles with a regular scatter of rose ones.
                const k = 0.26;
                const { x0, x1, z0, z1 } = area;
                const border = (cell: (a: number, b: number) => Rect, from: number, to: number): void =>
                    this.course(from, to, 0.7, 1.1, (a, b) => this.lay(cell(a, b), [], top, this.pick(KERB_TONES)));
                border((a, b) => ({ x0: a, x1: b, z0, z1: z0 + k }), x0, x1);
                border((a, b) => ({ x0: a, x1: b, z0: z1 - k, z1 }), x0, x1);
                border((a, b) => ({ x0, x1: x0 + k, z0: a, z1: b }), z0 + k, z1 - k);
                border((a, b) => ({ x0: x1 - k, x1, z0: a, z1: b }), z0 + k, z1 - k);
                const nx = Math.round((w - 2 * k) / 0.64);
                const nz = Math.round((d - 2 * k) / 0.64);
                const sx = (w - 2 * k) / nx;
                const sz = (d - 2 * k) / nz;
                for (let i = 0; i < nx; i += 1) {
                    for (let j = 0; j < nz; j += 1) {
                        const tone = (i + 2 * j) % 5 === 0 ? PLAZA_ACCENT : this.pick(PLAZA_TONES);
                        this.lay(rectAt(x0 + k + (i + 0.5) * sx, z0 + k + (j + 0.5) * sz, sx, sz), [], top, tone);
                    }
                }
                return;
            }

            // A road: a kerb course down each side, courses of varied stones between.
            const cuts = [...roads.slice(0, index).map((other) => other.area), ...holes(item)];
            const alongX = run === 'x';
            const [from, to, c0, c1] = alongX
                ? [area.x0, area.x1, area.z0, area.z1]
                : [area.z0, area.z1, area.x0, area.x1];
            const cell = (a: number, b: number, c: number, e: number): Rect =>
                alongX ? { x0: a, x1: b, z0: c, z1: e } : { x0: c, x1: e, z0: a, z1: b };
            const wide = c1 - c0;
            const kerb = wide >= 1.6 ? 0.2 : 0.16;
            for (const side of [c0, c1 - kerb]) {
                this.course(from, to, 0.8, 1.3, (a, b) =>
                    this.lay(cell(a, b, side, side + kerb), cuts, top, this.pick(KERB_TONES)),
                );
            }
            const rows = Math.max(2, Math.round((wide - 2 * kerb) / 0.5));
            const step = (wide - 2 * kerb) / rows;
            for (let row = 0; row < rows; row += 1) {
                const near = c0 + kerb + row * step;
                this.course(from, to, 0.46, 0.82, (a, b) =>
                    this.lay(
                        cell(a, b, near, near + step),
                        cuts,
                        top,
                        this.laid() < 0.14 ? this.pick(ROAD_ACCENTS) : this.pick(ROAD_TONES),
                    ),
                );
            }
        });
    }

    /** Stones laid in a ring between two radii round (cx, cz), on a bed at height `y`. */
    ring(
        cx: number,
        cz: number,
        r0: number,
        r1: number,
        count: number,
        y: number,
        tone: (i: number) => string,
    ): void {
        const gap = JOINT / (r0 + r1);
        for (let i = 0; i < count; i += 1) {
            const a0 = (i / count) * Math.PI * 2 + gap;
            const a1 = ((i + 1) / count) * Math.PI * 2 - gap;
            flagstone(
                this.stones,
                tone(i),
                [
                    [cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0],
                    [cx + Math.cos(a1) * r0, cz + Math.sin(a1) * r0],
                    [cx + Math.cos(a1) * r1, cz + Math.sin(a1) * r1],
                    [cx + Math.cos(a0) * r1, cz + Math.sin(a0) * r1],
                ],
                y,
                0.007,
                0.016,
            );
        }
    }

    /** A flat ring of joint colour for ring stones to sit on. */
    ringBed(cx: number, cz: number, r0: number, r1: number, y: number, sides = 56): void {
        for (let i = 0; i < sides; i += 1) {
            const a0 = (i / sides) * Math.PI * 2;
            const a1 = ((i + 1) / sides) * Math.PI * 2;
            this.stones.quad(
                GROUT,
                [cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0],
                [cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0],
                [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1],
                [cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1],
            );
        }
    }

    /**
     * The paving round a pond, as at the town's pool: two rings of kerb
     * stones with a fan of two-tone stones between them, on a bed at `y`.
     */
    pondRing(cx: number, cz: number, y: number): void {
        this.ringBed(cx, cz, 2.1, 3.1, y);
        this.ring(cx, cz, 2.14, 2.33, 30, y, () => this.pick(KERB_TONES));
        this.ring(cx, cz, 2.37, 2.85, 24, y, (i) => (i % 2 === 0 ? PLAZA_ACCENT : this.pick(PLAZA_TONES)));
        this.ring(cx, cz, 2.89, 3.07, 42, y, () => this.pick(KERB_TONES));
    }
}
