/**
 * The island the town stands on: a floating slab of grass and earth, its
 * paved roads and plaza, the tufts and flowers of its lawn, the garden, and
 * the clutter at each building's foot.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, seeded } from '../scene/kit.ts';
import { ENTRY_Z, EXIT_X, HALF, ISLAND, RAIL, SITES, SPOTS, queueSpot } from './layout.ts';
import { KERB_TONES, LIFT, PAVE, PLAZA_ACCENT, Paving, type Rect, type Road, rectAt } from './paving.ts';
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

export interface Island {
    group: THREE.Group;
    /** Sways the trees and drifts the clouds. */
    update(dt: number, time: number): void;
    /** Moves the clouds that drift where the market quarter hangs out of its way, or back home. */
    makeRoom(quarter: boolean): void;
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
    // ----- Paving: a bed for the joints, then the stones -----
    const paving = new Paving(4177);
    // A band of darker stone across the entry road under the gate: the venue's threshold.
    const threshold = rectAt(gateX, ENTRY_Z, 0.48, 1.9 - 0.4);
    paving.roads(ground, roads, (item) => (item === entry ? [threshold] : []));

    // The threshold's own stones.
    {
        const top = PAVE + entry.rank * LIFT;
        const span = (threshold.z1 - threshold.z0) / 3;
        for (let i = 0; i < 3; i += 1) {
            paving.lay(
                { x0: threshold.x0, x1: threshold.x1, z0: threshold.z0 + i * span, z1: threshold.z0 + (i + 1) * span },
                [],
                top,
                i === 1 ? '#cfc5b3' : '#c9bfad',
            );
        }
    }

    // Round the pond: two rings of kerb stones with a fan of two-tone stones between them.
    paving.pondRing(poolX, poolZ, PAVE + plaza.rank * LIFT + 0.003);
    // A round stone in the road where a visitor stands at the booth's window.
    {
        const [wx, , wz] = SPOTS.window;
        const bed = PAVE + entry.rank * LIFT + 0.003;
        paving.ringBed(wx, wz, 0, 0.43, bed, 16);
        paving.ring(wx, wz, 0.3, 0.42, 10, bed, () => paving.pick(KERB_TONES));
        flagstone(
            paving.stones,
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
    paving.stones.into(ground);

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
    // While the market quarter is there, two clouds drift elsewhere: the third would sit among the
    // quarter's rocks, and the first would peek out between the two islands, behind the quarter's boards.
    const moved: ReadonlyArray<readonly [index: number, away: readonly [number, number, number]]> = [
        [2, [-12, -5.5, 30]],
        [0, [-31, 0, 7]],
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
        makeRoom(quarter) {
            for (const [index, away] of moved) {
                const item = clouds[index];
                const home = sky[index];
                if (!item || !home) continue;
                const [x, y, z] = quarter ? away : home;
                item.node.position.set(x, y, z);
                item.base = x;
            }
        },
    };
}
