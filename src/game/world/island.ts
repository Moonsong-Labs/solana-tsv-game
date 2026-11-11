/**
 * The island the town stands on: a floating slab of grass and earth, its
 * paved roads and plaza, the tufts and flowers of its lawn, the garden, and
 * the clutter at each building's foot.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, seeded } from '../scene/kit.ts';
import { ENTRY_Z, EXIT_X, HALF, ISLAND, RAIL, SITES, SPOTS, queueSpot } from './layout.ts';
import {
    Bits,
    FLOWER_TONES,
    bamboo,
    barrel,
    bench,
    blossomTree,
    broom,
    bucket,
    bush,
    cask,
    cloud,
    cloverPatch,
    crate,
    fallenPetals,
    fence,
    flagstone,
    flowerClump,
    foodStall,
    gardenPine,
    grassTuft,
    greenTree,
    lanternPost,
    mapleTree,
    mossMound,
    noticeBoard,
    paver,
    pebbles,
    pineTree,
    planter,
    pottedPlant,
    rock,
    sack,
    steppingStone,
    stoneLantern,
    vendingMachine,
    waterBasin,
    woodPile,
} from './props.ts';

/** Height of the road and plaza surface above the grass. */
export const PAVE = 0.05;

/** How far the joints between paving stones sink below the walking surface. */
const RELIEF = 0.012;
/** The width of a joint. */
const JOINT = 0.036;
/** Roads that overlap sit this far apart in height, so they never flicker. */
const LIFT = 0.0006;

const GROUT = '#c8b189';
const ROAD_TONES = ['#f0e4c9', '#ecdfc2', '#f3e8d0', '#e9dbbc'] as const;
const ROAD_ACCENTS = ['#e3ceae', '#dcd3c3', '#e8d2bc'] as const;
const PLAZA_TONES = ['#f5ebd6', '#f2e6cf', '#f7efdd', '#efe3ca'] as const;
const PLAZA_ACCENT = '#e8cbb3';
const KERB_TONES = ['#d8ccb5', '#d2c6ae', '#ddd3bf'] as const;

export interface Island {
    group: THREE.Group;
    /** Sways the trees and drifts the clouds. */
    update(dt: number, time: number): void;
}

/** A patch of ground with sides along X and Z. */
interface Rect {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
}

/** A rectangle from its centre and size. */
function rectAt(x: number, z: number, w: number, d: number): Rect {
    return { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
}

/** What is left of `piece` outside `hole`: up to four rectangles. */
function cutOut(piece: Rect, hole: Rect): Rect[] {
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
interface Road {
    area: Rect;
    run: 'x' | 'z' | 'plaza';
    rank: number;
}

export function createIsland(): Island {
    const group = new THREE.Group();
    group.name = 'island';
    const rand = seeded(20261110);

    // ----- The slab -----
    const ground = new Sculpt();
    ground.box(ISLAND, 0.9, ISLAND, { color: PALETTE.grass, at: [0, -0.9, 0], r: 0.35 });
    ground.box(ISLAND - 0.3, 1.1, ISLAND - 0.3, { color: PALETTE.earth, at: [0, -1.85, 0], r: 0.3 });
    ground.box(ISLAND - 1.3, 1.0, ISLAND - 1.3, { color: PALETTE.earthDeep, at: [0, -2.7, 0], r: 0.4 });
    // Rock hanging under the island, so it reads as floating.
    const chunks: ReadonlyArray<readonly [number, number, number, number]> = [
        [0, 0, 9.5, 5.6],
        [-5.5, -4.5, 5.2, 3.6],
        [5.8, 4.2, 5.4, 3.9],
        [5, -5.6, 4.2, 3.1],
        [-5.2, 5.4, 4.4, 3.2],
        [-8.6, 0.4, 2.6, 2.2],
        [8.8, -0.6, 2.4, 2],
        [0.6, 8.8, 2.6, 2.1],
        [-0.4, -8.9, 2.6, 2.3],
    ];
    for (const [x, z, r, h] of chunks) {
        ground.cyl(r, r * 0.16, h, {
            color: PALETTE.earthDark,
            top: PALETTE.earthDeep,
            at: [x, -2.6 - h, z],
            seg: 7,
            flat: true,
            rot: [0, rand() * 3, 0],
        });
    }
    // Patches of lighter and deeper grass.
    for (let i = 0; i < 26; i += 1) {
        const x = (rand() - 0.5) * (ISLAND - 3);
        const z = (rand() - 0.5) * (ISLAND - 3);
        const r = 0.8 + rand() * 1.5;
        // Each patch sits at its own height, so overlapping ones never flicker.
        ground.cyl(r, r, 0.02, {
            color: rand() > 0.5 ? PALETTE.grassLight : PALETTE.grassDeep,
            at: [x, -0.016 + i * 0.0004, z],
            seg: 22,
            scale: [1, 1, 0.7 + rand() * 0.5],
        });
    }

    // ----- Roads and plaza: where they run -----
    const [poolX, poolZ] = SITES.pool;
    const [gateX] = SITES.gate;
    const roads: Road[] = [];
    const road = (x: number, z: number, w: number, d: number, run: Road['run']): Road => {
        const made: Road = { area: rectAt(x, z, w, d), run, rank: 0 };
        roads.push(made);
        return made;
    };
    // Listed from the one that runs through to the ones that stop at its edge.
    // The plaza around the pool.
    const plaza = road(poolX + 0.3, poolZ - 0.4, 8.4, 8, 'plaza');
    // The entry road, from the back-left edge to the plaza.
    const entry = road((-HALF + 0.3 + (poolX - 3.2)) / 2, ENTRY_Z, poolX - 3.2 - (-HALF + 0.3), 1.9, 'x');
    // The exit road, from the plaza to the front-left edge.
    road(EXIT_X, (poolZ + 3.2 + HALF - 0.3) / 2, 1.8, HALF - 0.3 - (poolZ + 3.2), 'z');
    // Side paths: to the bureau in the left corner, from the issuer's door round to the road,
    // to the council, to the exchange, to the dock and to the indexer.
    road(-6.4, 7.6, 1.3, 5.6, 'z');
    road(-7.2, 10, 1.6, 1.3, 'x');
    road(-4.4, -1.2, 1.2, 8.6, 'z');
    road(-6.9, -5.3, 6.2, 1.2, 'x');
    road(SITES.council[0], -3.3, 1.5, 4.2, 'z');
    road(4.4, -3.5, 1.3, 4.6, 'z');
    road(6.6, -5.6, 5.8, 1.3, 'x');
    road(7.9, 2.4, 3.6, 1.4, 'x');
    road(4.9, 9.6, 3.6, 1.2, 'x');
    roads.forEach((item, i) => {
        item.rank = roads.length - i;
    });

    // ----- Paving: a bed for the joints, then the stones -----
    const stones = new Bits();
    const laid = seeded(4177);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(laid() * list.length)] as T;
    /** Lays one stone in `cell`, cut back to what lies outside `holes`, with half a joint clear all round. */
    const lay = (cell: Rect, holes: readonly Rect[], top: number, tone: string): void => {
        let pieces: Rect[] = [cell];
        for (const hole of holes) pieces = pieces.flatMap((piece) => cutOut(piece, hole));
        for (const piece of pieces) {
            const x0 = piece.x0 + JOINT / 2;
            const x1 = piece.x1 - JOINT / 2;
            const z0 = piece.z0 + JOINT / 2;
            const z1 = piece.z1 - JOINT / 2;
            if (x1 - x0 < 0.09 || z1 - z0 < 0.09) continue;
            paver(stones, tone, x0, z0, x1, z1, top - RELIEF, RELIEF);
        }
    };
    /** Walks from `from` to `to` in stone lengths between `min` and `max`. */
    const course = (from: number, to: number, min: number, max: number, each: (a: number, b: number) => void): void => {
        // Start part-way into a stone, so neighbouring courses break joint.
        let at = from - laid() * min * 0.6;
        while (at < to - 1e-6) {
            let next = at + min + laid() * (max - min);
            if (to - next < min * 0.6) next = to;
            each(Math.max(at, from), next);
            at = next;
        }
    };

    // A band of darker stone across the entry road under the gate: the venue's threshold.
    const threshold = rectAt(gateX, ENTRY_Z, 0.48, 1.9 - 0.4);

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
                course(from, to, 0.7, 1.1, (a, b) => lay(cell(a, b), [], top, pick(KERB_TONES)));
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
                    const tone = (i + 2 * j) % 5 === 0 ? PLAZA_ACCENT : pick(PLAZA_TONES);
                    lay(rectAt(x0 + k + (i + 0.5) * sx, z0 + k + (j + 0.5) * sz, sx, sz), [], top, tone);
                }
            }
            return;
        }

        // A road: a kerb course down each side, courses of varied stones between.
        const holes = roads.slice(0, index).map((other) => other.area);
        if (item === entry) holes.push(threshold);
        const alongX = run === 'x';
        const [from, to, c0, c1] = alongX ? [area.x0, area.x1, area.z0, area.z1] : [area.z0, area.z1, area.x0, area.x1];
        const cell = (a: number, b: number, c: number, e: number): Rect =>
            alongX ? { x0: a, x1: b, z0: c, z1: e } : { x0: c, x1: e, z0: a, z1: b };
        const wide = c1 - c0;
        const kerb = wide >= 1.6 ? 0.2 : 0.16;
        for (const side of [c0, c1 - kerb]) {
            course(from, to, 0.8, 1.3, (a, b) => lay(cell(a, b, side, side + kerb), holes, top, pick(KERB_TONES)));
        }
        const rows = Math.max(2, Math.round((wide - 2 * kerb) / 0.5));
        const step = (wide - 2 * kerb) / rows;
        for (let row = 0; row < rows; row += 1) {
            const near = c0 + kerb + row * step;
            course(from, to, 0.46, 0.82, (a, b) =>
                lay(cell(a, b, near, near + step), holes, top, laid() < 0.14 ? pick(ROAD_ACCENTS) : pick(ROAD_TONES)),
            );
        }
    });

    // The threshold's own stones.
    {
        const top = PAVE + entry.rank * LIFT;
        const span = (threshold.z1 - threshold.z0) / 3;
        for (let i = 0; i < 3; i += 1) {
            lay(
                { x0: threshold.x0, x1: threshold.x1, z0: threshold.z0 + i * span, z1: threshold.z0 + (i + 1) * span },
                [],
                top,
                i === 1 ? '#cfc5b3' : '#c9bfad',
            );
        }
    }

    /** Stones laid in a ring between two radii round (cx, cz), on a bed at height `y`. */
    const ringOf = (
        cx: number,
        cz: number,
        r0: number,
        r1: number,
        count: number,
        y: number,
        tone: (i: number) => string,
    ): void => {
        const gap = JOINT / (r0 + r1);
        for (let i = 0; i < count; i += 1) {
            const a0 = (i / count) * Math.PI * 2 + gap;
            const a1 = ((i + 1) / count) * Math.PI * 2 - gap;
            flagstone(
                stones,
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
    };
    /** A flat ring of joint colour for ring stones to sit on. */
    const ringBed = (cx: number, cz: number, r0: number, r1: number, y: number, sides = 56): void => {
        for (let i = 0; i < sides; i += 1) {
            const a0 = (i / sides) * Math.PI * 2;
            const a1 = ((i + 1) / sides) * Math.PI * 2;
            stones.quad(
                GROUT,
                [cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0],
                [cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0],
                [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1],
                [cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1],
            );
        }
    };

    // Round the pond: two rings of kerb stones with a fan of two-tone stones between them.
    {
        const bed = PAVE + plaza.rank * LIFT + 0.003;
        ringBed(poolX, poolZ, 2.1, 3.1, bed);
        ringOf(poolX, poolZ, 2.14, 2.33, 30, bed, () => pick(KERB_TONES));
        ringOf(poolX, poolZ, 2.37, 2.85, 24, bed, (i) => (i % 2 === 0 ? PLAZA_ACCENT : pick(PLAZA_TONES)));
        ringOf(poolX, poolZ, 2.89, 3.07, 42, bed, () => pick(KERB_TONES));
    }
    // A round stone in the road where a visitor stands at the booth's window.
    {
        const [wx, , wz] = SPOTS.window;
        const bed = PAVE + entry.rank * LIFT + 0.003;
        ringBed(wx, wz, 0, 0.43, bed, 16);
        ringOf(wx, wz, 0.3, 0.42, 10, bed, () => pick(KERB_TONES));
        flagstone(
            stones,
            PLAZA_ACCENT,
            Array.from({ length: 12 }, (_, i): [number, number] => {
                const a = (i / 12) * Math.PI * 2;
                return [wx + Math.cos(a) * 0.275, wz + Math.sin(a) * 0.275];
            }),
            bed,
            0.007,
            0.016,
        );
    }
    stones.into(ground);

    // Stepping stones: through the garden, and to the doors the roads stop short of.
    const steps: ReadonlyArray<readonly [number, number, number]> = [
        [-5.35, 8.5, 1],
        [-4.62, 8.78, 0.95],
        [-3.9, 8.55, 1],
        [-4.95, 9.4, 0.85],
        // To the archive's door.
        [7.02, -0.92, 0.9],
        [7.56, -0.74, 1],
        // To the indexer's hut.
        [7.02, 9.25, 0.9],
        [7.5, 8.92, 0.85],
    ];
    steps.forEach(([x, z, size], i) => steppingStone(ground, [x, 0, z], size, i + 1));
    // The rail bed.
    ground.box(1.7, 0.06, ISLAND - 0.5, { color: '#d8cdb8', at: [RAIL.x, 0, 0], r: 0.02 });

    // ----- What must stay clear of anything with height -----
    const blocks: Rect[] = roads.map((item) => item.area);
    const rounds: [number, number, number][] = [];
    /** True where the lawn's scatter must not go: paving, buildings, props, and where people stand and walk. */
    const taken = (x: number, z: number, pad = 0, skip = -1): boolean => {
        for (const b of blocks) {
            if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
        }
        for (let i = 0; i < rounds.length; i += 1) {
            if (i === skip) continue;
            const [cx, cz, r] = rounds[i] as [number, number, number];
            if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < (r + pad) * (r + pad)) return true;
        }
        return false;
    };
    /** Keeps a round patch clear; returns its index. */
    const clear = (x: number, z: number, r: number): number => rounds.push([x, z, r]) - 1;
    // The footprint of each place, with the dressing at its own foot.
    const site = (id: keyof typeof SITES, dx: number, dz: number, w: number, d: number): void => {
        blocks.push(rectAt(SITES[id][0] + dx, SITES[id][1] + dz, w, d));
    };
    site('bureau', 0.35, 0.05, 4.2, 4.7);
    site('issuer', 0.03, -0.04, 4.5, 3.9);
    site('council', 0, 0.45, 6.1, 5.2);
    site('exchange', 0.06, 0.38, 4.4, 5);
    site('haltBoard', 0.03, -0.03, 1.9, 1.9);
    site('archive', 0, 0.25, 3.2, 3.2);
    site('indexer', 0, -0.1, 3.1, 3.2);
    site('booth', 0, 0.1, 2.3, 2.6);
    site('gate', 0.1, 0, 1.3, 3.8);
    site('dock', -1.45, 0.05, 1.3, 4.1);
    clear(gateX - 3.45, SITES.gate[1] - 1.75, 0.5);
    // The rail, to the island's edge.
    blocks.push({ x0: RAIL.x - 0.95, x1: HALF, z0: -HALF, z1: HALF });
    // Where people stand, and the lines they walk.
    const standing: ReadonlyArray<readonly [number, number]> = [
        ...Object.values(SPOTS).map(([x, , z]): [number, number] => [x, z]),
        ...[0, 1, 2, 3].map((slot): [number, number] => [queueSpot(slot)[0], queueSpot(slot)[2]]),
        [-9, 5.1],
        [-9.3, 4.9],
        // The officer, the bell ringer, the three bots and the four signers.
        [SITES.bureau[0] + 2.35, SITES.bureau[1] + 1.05],
        [SITES.exchange[0] + 0.9, SITES.exchange[1] + 3.1],
        [SITES.indexer[0] - 0.65, SITES.indexer[1] + 1.55],
        [SITES.archive[0] - 0.53, SITES.archive[1] + 2.45],
        [SITES.haltBoard[0] - 0.26, SITES.haltBoard[1] + 1.14],
        ...[0, 1, 2, 3].map((i): [number, number] => [
            SITES.council[0] - 1.8 + i * 1.2,
            SITES.council[1] + 3.9 + (i % 2) * 0.35,
        ]),
    ];
    for (const [x, z] of standing) clear(x, z, 0.62);
    const walks: ReadonlyArray<readonly (readonly [number, number, number])[]> = [
        [SPOTS.spawn, SPOTS.window, SPOTS.barrier, SPOTS.pastGate, SPOTS.poolRim, SPOTS.exitStart, SPOTS.exitEnd],
        [SPOTS.bureauTurn, SPOTS.bureauPath, SPOTS.bureauDoor],
        [SPOTS.bureauTurn, queueSpot(0)],
        [[-9, 0, 5.1], SPOTS.spawn],
        [SPOTS.exitStart, SPOTS.lpSpot],
    ];
    for (const walk of walks) {
        for (let i = 0; i < walk.length - 1; i += 1) {
            const a = walk[i] as readonly [number, number, number];
            const b = walk[i + 1] as readonly [number, number, number];
            const count = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.4);
            for (let n = 0; n <= count; n += 1) {
                clear(a[0] + ((b[0] - a[0]) * n) / count, a[2] + ((b[2] - a[2]) * n) / count, 0.58);
            }
        }
    }
    for (const [x, z, size] of steps) clear(x, z, 0.3 * size);

    // ----- Garden: static dressing -----
    const garden = new Sculpt();
    /** Things tufts crowd against, as indexes into `rounds`. */
    const hugged: number[] = [];
    const hug = (x: number, z: number, r: number): void => {
        hugged.push(clear(x, z, r));
    };

    // None stands in the strip in front of the entry road, where it would hide the people on it:
    // the gate's own lantern is beyond the road, to the right of the gate as the camera sees it.
    const lanterns: ReadonlyArray<readonly [number, number, number]> = [
        [-2.05, 1.2, 1],
        [6.5, 4.9, 0.9],
        [-0.5, 9.3, 0.9],
    ];
    for (const [x, z, size] of lanterns) {
        stoneLantern(garden, [x, 0, z], size);
        hug(x, z, 0.3 * size);
    }
    // One lights the queue from behind the road; two flank the way out.
    lanternPost(garden, [-10.2, 0, 2.3], -Math.PI / 2);
    lanternPost(garden, [0.7, 0, 9.4], 0);
    lanternPost(garden, [3.7, 0, 9.4], Math.PI);
    for (const [x, z] of [
        [-10.2, 2.3],
        [0.7, 9.4],
        [3.7, 9.4],
    ] as const)
        hug(x, z, 0.1);
    bench(garden, [-4.6, 0, 7.4]);
    clear(-4.6, 7.4, 0.62);
    bench(garden, [4.2, 0, 7.2], Math.PI / 2);
    clear(4.2, 7.2, 0.62);
    // A food stall and a vending machine: somewhere to wait for the gate to open.
    foodStall(garden, [-2.5, 0, 8.7]);
    blocks.push({ x0: -3.75, x1: -1.25, z0: 8.0, z1: 9.95 });
    vendingMachine(garden, [0.7, 0, 6.7]);
    blocks.push(rectAt(0.7, 6.7, 1.05, 0.8));
    fence(garden, [-5.6, 0, 11.5], [-0.4, 0, 11.5]);
    blocks.push({ x0: -5.7, x1: -0.3, z0: 11.4, z1: 11.6 });

    const rocks: ReadonlyArray<readonly [number, number, number]> = [
        [-8.6, 0.2, 1.1],
        [-9.5, -0.3, 0.7],
        [-4.62, 11.1, 0.7],
        [-11.2, -10.9, 1.1],
        [2.2, -11.2, 0.8],
        [-3.1, -2.6, 0.6],
        [-6.2, -3.9, 0.7],
        [-3.9, 10.5, 0.45],
    ];
    rocks.forEach(([x, z, size], i) => {
        rock(garden, [x, 0, z], size, i + 1);
        hug(x, z, 0.4 * size);
    });
    const bushes: ReadonlyArray<readonly [number, number, number, string | undefined]> = [
        [-11.2, 1.6, 1, '#ffffff'],
        [-5, 6.2, 0.6, PALETTE.blossom],
        [-0.3, 7, 1, undefined],
        [4.6, 6.4, 0.9, '#ffe08a'],
        [-3.1, -3.75, 1, undefined],
        [2.4, -6.3, 0.9, '#ffffff'],
        [-11.3, -4.6, 0.9, PALETTE.blossom],
        [4.9, 7.6, 0.9, undefined],
        [-9.6, -1.4, 1.1, '#ffe08a'],
        [-5.6, -11.3, 1, undefined],
        [2.9, -2.85, 0.8, PALETTE.blossom],
        [-3.75, 9.9, 0.7, PALETTE.blossom],
    ];
    bushes.forEach(([x, z, size, tone], i) => {
        bush(garden, [x, 0, z], size, i + 1, tone);
        hug(x, z, 0.5 * size);
    });

    // A small water garden in the corner where the bureau's path meets the fence.
    // Everything here stays low: a tree would hide the bureau's door.
    waterBasin(garden, [-5.12, 0, 10.95], 1, 0.3);
    hug(-5.12, 10.95, 0.4);
    clear(-5.52, 10.97, 0.16);
    const moss: ReadonlyArray<readonly [number, number, number]> = [
        [-4.5, 10.55, 0.9],
        [-5.5, 10.42, 0.6],
        [-4.2, 11.12, 0.7],
    ];
    moss.forEach(([x, z, size], i) => {
        mossMound(garden, [x, 0, z], size, i + 1);
        clear(x, z, 0.3 * size);
    });
    // A garden pine, pruned small, softens the bureau's blank corner.
    gardenPine(garden, [SITES.bureau[0] - 1.35, 0, SITES.bureau[1] + 2.56], 0.5, 15);
    hug(SITES.bureau[0] - 1.35, SITES.bureau[1] + 2.56, 0.12);

    // ----- Clutter at each building's foot, on the two faces the camera sees -----
    /** Places a prop and keeps the lawn's scatter off it. */
    const put = (x: number, z: number, r: number, build: (at: [number, number, number]) => void): void => {
        build([x, 0, z]);
        clear(x, z, r);
    };
    {
        // The credential bureau: stores along the blank side wall; a flower box, a broom and a bucket by the counter.
        const [x, z] = SITES.bureau;
        put(x - 0.62, z + 2.58, 0.28, (at) => barrel(garden, at, 0.92));
        put(x + 0.02, z + 2.6, 0.32, (at) => crate(garden, at, 1, 0.12));
        crate(garden, [x - 0.01, 0.32, z + 2.59], 0.68, -0.35, '#f3c45a');
        put(x + 0.6, z + 2.58, 0.24, (at) => sack(garden, at, 1, 3));
        put(x + 0.98, z + 2.62, 0.2, (at) => sack(garden, at, 0.8, 4, '#dcc79c'));
        put(x + 2.02, z - 0.72, 0.34, (at) => planter(garden, at, 0.9, Math.PI / 2, 2));
        put(x + 1.6, z + 0.27, 0.14, (at) => broom(garden, at, Math.PI / 2, 0.22));
        put(x + 1.9, z + 0.13, 0.18, (at) => bucket(garden, at, 1.05));
    }
    {
        // The gatekeeper's booth: a potted pine at its front corner. The gate's beam hides the rest of that side.
        const [x, z] = SITES.booth;
        put(x + 1.36, z + 0.62, 0.22, (at) => pottedPlant(garden, at, 0.9, 2, 'pine', '#c9705e'));
    }
    {
        // The issuer's mint: sacks and a crate of blanks beside the press.
        const [x, z] = SITES.issuer;
        put(x + 2.62, z - 0.95, 0.24, (at) => sack(garden, at, 1, 11));
        put(x + 2.95, z - 0.62, 0.22, (at) => sack(garden, at, 0.85, 12, '#dcc79c'));
        put(x + 2.7, z + 1.2, 0.3, (at) => crate(garden, at, 0.95, -0.2, PALETTE.gold));
        put(x - 2.0, z + 2.05, 0.2, (at) => pottedPlant(garden, at, 0.85, 5, 'bloom', '#7fa7c9', '#ffffff'));
    }
    {
        // The council hall: offering casks by the steps, a potted pine, firewood and a broom along its side.
        const [x, z] = SITES.council;
        put(x - 2.42, z + 2.5, 0.27, (at) => cask(garden, at, 1));
        put(x - 1.9, z + 2.52, 0.27, (at) => cask(garden, at, 1, 0, PALETTE.roofPlum));
        cask(garden, [x - 2.16, 0.45, z + 2.5], 0.92, 0.3, PALETTE.gold);
        put(x + 2.45, z + 2.55, 0.26, (at) => pottedPlant(garden, at, 1.15, 3, 'pine', '#8f7ab8'));
        put(x + 3.42, z - 0.3, 0.34, (at) => woodPile(garden, at, Math.PI / 2));
        put(x + 3.14, z + 0.75, 0.12, (at) => broom(garden, at, Math.PI / 2, 0.2));
    }
    {
        // The archive: a pot of reeds under its lantern, boxes of scrolls by the drawer.
        const [x, z] = SITES.archive;
        put(x - 1.36, z + 1.6, 0.2, (at) => pottedPlant(garden, at, 0.9, 6, 'reeds', '#6e86b8'));
        put(x + 0.72, z + 2.25, 0.3, (at) => crate(garden, at, 0.9, -0.15, PALETTE.paper));
        put(x + 1.22, z + 2.12, 0.22, (at) => crate(garden, at, 0.62, 0.4));
    }
    {
        // The indexer: a barrel and a crate of spare parts at the foot of its board, left of the post.
        // The tunnel house hides the hut's own foot.
        const [x, z] = SITES.indexer;
        put(x - 2.12, z + 1.62, 0.26, (at) => barrel(garden, at, 0.85, '#b88a5c'));
        put(x - 1.68, z + 1.42, 0.28, (at) => crate(garden, at, 0.85, 0.5, PALETTE.gold));
    }
    {
        // The dock: freight waiting at the end of the platform, and a notice of the day's blocks.
        const [x, z] = SITES.dock;
        put(x - 1.72, z + 2.3, 0.3, (at) => crate(garden, at, 1, 0.2));
        crate(garden, [x - 1.7, 0.32, z + 2.28], 0.66, -0.2);
        put(x - 1.22, z + 2.42, 0.22, (at) => sack(garden, at, 0.9, 21));
        put(x - 1.75, z - 2.3, 0.26, (at) => barrel(garden, at, 0.85));
        put(x - 2.35, z + 2.9, 0.2, (at) => noticeBoard(garden, at, Math.PI / 4));
    }
    group.add(garden.build('garden'));

    // ----- Trees: one group each, so they can sway -----
    const trees: { node: THREE.Group; phase: number; amount: number }[] = [];
    const plant = (build: (s: Sculpt) => void, x: number, z: number, amount = 0.022): void => {
        const s = new Sculpt();
        build(s);
        const node = s.build('tree');
        node.position.set(x, 0, z);
        group.add(node);
        trees.push({ node, phase: rand() * 6.28, amount });
        hug(x, z, 0.22);
    };
    /** Blossom trees shed petals; [x, z, how far they fall]. */
    const shedding: ReadonlyArray<readonly [number, number, number]> = [
        [-9.4, -2.2, 2.3],
        [-3.3, 11.05, 1.5],
        [5.1, 10.9, 1.9],
    ];
    plant((s) => blossomTree(s, [0, 0, 0], 1.25, 1), -9.4, -2.2);
    // Small, and kept to the right of the garden, so it never stands between the camera and the bureau's door.
    plant((s) => blossomTree(s, [0, 0, 0], 0.72, 2), -3.3, 11.05);
    plant((s) => greenTree(s, [0, 0, 0], 1.1, 3), -11.1, -11.1);
    plant((s) => blossomTree(s, [0, 0, 0], 0.95, 4), 5.1, 10.9);
    plant((s) => mapleTree(s, [0, 0, 0], 0.95, 6), -4.8, -10.6);
    plant((s) => pineTree(s, [0, 0, 0], 1.1, 7), -11.2, -0.6, 0.012);
    plant((s) => pineTree(s, [0, 0, 0], 0.9, 8), 0.5, 11.25, 0.012);
    plant((s) => pineTree(s, [0, 0, 0], 0.95, 9), -6.3, -2.2, 0.012);
    plant((s) => greenTree(s, [0, 0, 0], 1.05, 10), 3.2, -11);
    plant((s) => bamboo(s, [0, 0, 0], 1, 12), -11.3, -3.6, 0.03);
    plant((s) => bamboo(s, [0, 0, 0], 0.9, 13), -11.4, -6.4, 0.03);

    // ----- The lawn: tufts, clover, flowers and pebbles, the same on every load -----
    const lawn = new Bits();
    const EDGE = HALF - 0.42;
    /** Slow swells across the island: where flowers gather, and in which colour. */
    const swell = (x: number, z: number, a: number, b: number): number =>
        0.5 + 0.3 * Math.sin(x * 0.52 + a) * Math.cos(z * 0.47 + b) + 0.2 * Math.sin((x + z) * 0.9 + a * 2);
    const families = [FLOWER_TONES.pink, FLOWER_TONES.white, FLOWER_TONES.yellow] as const;
    const CELL = 0.56;
    const cells = Math.ceil((EDGE * 2) / CELL);
    let level = 0;
    for (let ix = 0; ix < cells; ix += 1) {
        for (let iz = 0; iz < cells; iz += 1) {
            const dice = seeded(900001 + ix * 7919 + iz * 104729);
            const x = -EDGE + (ix + 0.08 + dice() * 0.84) * CELL;
            const z = -EDGE + (iz + 0.08 + dice() * 0.84) * CELL;
            const roll = dice();
            if (Math.abs(x) > EDGE || Math.abs(z) > EDGE || taken(x, z, 0.14)) continue;
            const meadow = swell(x, z, 1.7, -0.6);
            const flowers = 0.05 + 0.26 * meadow;
            if (roll < flowers) {
                const family = families[Math.floor(swell(x, z, 4.1, 2.3) * 2.999)] ?? FLOWER_TONES.white;
                flowerClump(lawn, x, z, dice, family);
            } else if (roll < flowers + 0.13) {
                // Each on its own level, above the grass patches and below every road's margin.
                level = (level + 1) % 9;
                cloverPatch(lawn, x, z, dice, 0.0165 + level * 0.0014);
            } else if (roll < flowers + 0.2) {
                pebbles(lawn, x, z, dice);
            } else if (roll < 0.93) {
                grassTuft(lawn, x, z, dice, 0.9 + dice() * 0.35);
                // Often a second, smaller tuft beside it.
                if (dice() < 0.3) {
                    const a = dice() * Math.PI * 2;
                    const bx = x + Math.cos(a) * 0.22;
                    const bz = z + Math.sin(a) * 0.22;
                    if (!taken(bx, bz, 0.1)) grassTuft(lawn, bx, bz, dice, 0.7);
                }
            }
        }
    }
    // Tufts crowd the foot of rocks, lanterns, bushes and trunks, so they sit in the grass.
    const footing = seeded(5519);
    for (const index of hugged) {
        const [cx, cz, r] = rounds[index] as [number, number, number];
        const count = 3 + Math.floor(footing() * 3);
        for (let i = 0; i < count; i += 1) {
            const a = footing() * Math.PI * 2;
            const x = cx + Math.cos(a) * (r + 0.05);
            const z = cz + Math.sin(a) * (r + 0.05);
            const size = 0.75 + footing() * 0.4;
            if (Math.abs(x) > EDGE || Math.abs(z) > EDGE || taken(x, z, 0.06, index)) continue;
            grassTuft(lawn, x, z, footing, size);
        }
    }
    // Flower beds planted on purpose: by the rocks, under the trees, in the water garden.
    const beds: ReadonlyArray<readonly [number, number, 0 | 1 | 2]> = [
        [-10, 0.6, 1],
        [-10.6, -2.6, 0],
        [1.4, -3.4, 2],
        [5.9, 7.4, 0],
        [-0.9, 10.4, 2],
        [-4.35, 9.5, 0],
        [-5.0, 10.2, 1],
        [-2.0, 7.2, 1],
        [2.6, -9.7, 0],
        [-7.5, -3.4, 2],
    ];
    const bedding = seeded(8087);
    for (const [bx, bz, family] of beds) {
        for (let i = 0; i < 5; i += 1) {
            const a = bedding() * Math.PI * 2;
            const reach = 0.12 + Math.sqrt(bedding()) * 0.42;
            const x = bx + Math.cos(a) * reach;
            const z = bz + Math.sin(a) * reach;
            if (taken(x, z, 0.1)) continue;
            flowerClump(lawn, x, z, bedding, families[family], 1.1);
        }
    }
    // Petals under the blossom trees, leaves under the maple. They lie flat, on grass and paving alike.
    const lie = (x: number, z: number): number | undefined => {
        if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return undefined;
        for (const item of roads) {
            const { x0, x1, z0, z1 } = item.area;
            if (x > x0 + 0.06 && x < x1 - 0.06 && z > z0 + 0.06 && z < z1 - 0.06) return PAVE + 0.0085;
            if (x > x0 - 0.16 && x < x1 + 0.16 && z > z0 - 0.16 && z < z1 + 0.16) return undefined;
        }
        return 0.0335;
    };
    const falling = seeded(6113);
    for (const [x, z, reach] of shedding)
        fallenPetals(lawn, x, z, reach, 70, falling, ['#f9bfd0', '#fbd3df', '#f29bb6'], lie);
    fallenPetals(lawn, -4.8, -10.6, 1.7, 46, falling, ['#f08a4b', '#f6a85a', '#e86f48'], lie);

    // The scatter joins the ground's own mesh, so it adds nothing to draw.
    lawn.into(ground);
    group.add(ground.build('ground'));

    // ----- Clouds drifting past, below and beside the island -----
    const clouds: { node: THREE.Group; speed: number; base: number }[] = [];
    const sky: ReadonlyArray<readonly [number, number, number, number]> = [
        [-19.5, -3.5, 9, 1.15],
        [16.5, -5, -4, 1.3],
        [-4, -6.5, 18.5, 1],
        [9, -7, 15, 0.85],
        [-19, 1, -9, 0.95],
        [19, 2.5, -15, 1.05],
    ];
    sky.forEach(([x, y, z, size], i) => {
        const s = new Sculpt();
        cloud(s, [0, 0, 0], size, i + 1);
        const node = s.build('cloud');
        node.position.set(x, y, z);
        for (const child of node.children) {
            child.castShadow = false;
            child.receiveShadow = false;
        }
        group.add(node);
        clouds.push({ node, speed: 0.1 + rand() * 0.12, base: x });
    });

    return {
        group,
        update(_dt, time) {
            for (const tree of trees) {
                tree.node.rotation.z = Math.sin(time * 0.9 + tree.phase) * tree.amount;
                tree.node.rotation.x = Math.cos(time * 0.7 + tree.phase * 1.7) * tree.amount * 0.7;
            }
            for (const item of clouds) {
                item.node.position.x = item.base + Math.sin(time * item.speed * 0.25 + item.base) * 1.6;
                item.node.position.y += Math.sin(time * 0.5 + item.base) * 0.0006;
            }
        },
    };
}
