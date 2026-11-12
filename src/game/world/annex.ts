/**
 * The market quarter: a second floating island off the town's front edge,
 * where the other three stocks' pools stand in a row. The exit road crosses
 * to it over a short bridge and runs on to the quarter's front edge; a path
 * along the front leads to each pool's jetty.
 *
 * Manager mode shows it; the gatekeeper's day never does. The pools
 * themselves are places of their own (`createPool`); this is the ground
 * they stand on, the bridge and the dressing.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, makeSign, seeded } from '../scene/kit.ts';
import { ANNEX, BRIDGE, EXIT_X, FRONT_Z, POOL_SITES, QUARTER_STOCKS, poolRim } from './layout.ts';
import { LIFT, PAVE, Paving, type Rect, type Road } from './paving.ts';
import {
    Bits,
    FLOWER_TONES,
    blossomTree,
    bush,
    cloverPatch,
    fallenPetals,
    flowerClump,
    grassTuft,
    lanternPost,
    pebbles,
    pineTree,
    rock,
    stoneLantern,
} from './props.ts';

export interface Annex {
    /** The island, the bridge and the dressing. Hidden until manager mode shows it. */
    group: THREE.Group;
    /** Where blossom petals fall from on the quarter: its cherry trees' crowns. */
    petals: THREE.Vector3[];
    /** Sways the trees. */
    update(dt: number, time: number): void;
}

export function createAnnex(): Annex {
    const group = new THREE.Group();
    group.name = 'market-quarter';
    const rand = seeded(20261111);
    const { x0, x1, z0, z1 } = ANNEX;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // ----- The slab, as the town's: grass on earth, rock hanging under it -----
    const ground = new Sculpt();
    ground.box(w, 0.9, d, { color: PALETTE.grass, at: [cx, -0.9, cz], r: 0.35 });
    ground.box(w - 0.3, 1.1, d - 0.3, { color: PALETTE.earth, at: [cx, -1.85, cz], r: 0.3 });
    ground.box(w - 1.3, 1.0, d - 1.3, { color: PALETTE.earthDeep, at: [cx, -2.7, cz], r: 0.4 });
    // A long slab hangs on a keel of rock: long ridges stretched along it, the deepest under its
    // middle, and smaller lumps beside them, so the underside reads as one mass and not a row of teeth.
    const chunks: ReadonlyArray<readonly [number, number, number, number, number]> = [
        [-1.5, 0, 3.6, 4.6, 2.1],
        [-10, 0.2, 3.4, 3.6, 1.6],
        [8, -0.2, 3.3, 3.2, 1.7],
        [-14.2, -0.4, 2.2, 1.9, 1.2],
        [12.6, 0.4, 2, 1.8, 1.2],
        [3.2, 2.2, 2, 2.2, 1],
        [-5.6, -2.3, 2, 2.1, 1],
        [-12, 2.4, 1.6, 1.6, 1],
    ];
    for (const [x, z, r, h, stretch] of chunks) {
        ground.cyl(r, r * 0.16, h, {
            color: PALETTE.earthDark,
            top: PALETTE.earthDeep,
            at: [cx + x, -2.6 - h, cz + z],
            seg: 7,
            flat: true,
            scale: [stretch, 1, 1],
            rot: [0, (rand() - 0.5) * 0.3, 0],
        });
    }
    // Patches of lighter and deeper grass, each at its own height so none flickers.
    for (let i = 0; i < 12; i += 1) {
        const r = 0.8 + rand() * 1.3;
        ground.cyl(r, r, 0.02, {
            color: rand() > 0.5 ? PALETTE.grassLight : PALETTE.grassDeep,
            at: [x0 + 1.5 + rand() * (w - 3), -0.016 + i * 0.0004, z0 + 1.5 + rand() * (d - 3)],
            seg: 22,
            scale: [1, 1, 0.7 + rand() * 0.5],
        });
    }

    // ----- The bridge: planks across the gap, on two beams, between low rails -----
    {
        const { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } = BRIDGE;
        const mid = (bx0 + bx1) / 2;
        const planks = 10;
        const each = (bz1 - bz0) / planks;
        for (let i = 0; i < planks; i += 1) {
            // Level with the paving, so walkers cross on the flat.
            ground.box(bx1 - bx0, 0.08, each - 0.03, {
                color: i % 3 === 1 ? '#c99a6c' : PALETTE.wood,
                top: '#d4a779',
                at: [mid, PAVE + 0.004 - 0.08, bz0 + each * (i + 0.5)],
                r: 0.015,
            });
        }
        for (const x of [bx0 + 0.25, bx1 - 0.25])
            ground.box(0.16, 0.2, bz1 - bz0 + 0.8, {
                color: PALETTE.woodDeep,
                at: [x, -0.27, (bz0 + bz1) / 2],
                r: 0.03,
            });
        // The rails span the gap, from one slab's edge to the other's.
        const r0 = bz0 + 0.3;
        const r1 = bz1 - 0.3;
        for (const x of [bx0 + 0.05, bx1 - 0.05]) {
            for (const z of [r0, (r0 + r1) / 2, r1]) {
                ground.box(0.1, 0.62, 0.1, { color: PALETTE.woodDark, at: [x, PAVE - 0.02, z], r: 0.02 });
                // An onion-capped post top, as on old wooden bridges.
                ground.lathe(
                    [
                        [0.065, 0],
                        [0.08, 0.05],
                        [0.055, 0.11],
                        [0.012, 0.18],
                    ],
                    { color: PALETTE.gold, at: [x, PAVE + 0.6, z], seg: 10, layer: 'gloss' },
                );
            }
            for (const y of [0.3, 0.52]) {
                ground.box(0.06, 0.05, r1 - r0 + 0.1, {
                    color: PALETTE.wood,
                    at: [x, PAVE + y, (r0 + r1) / 2],
                    r: 0.015,
                });
            }
        }
    }

    // ----- Paving: the quarter's road, the front path, a spur to each jetty, a ring round each pond -----
    const roads: Road[] = [];
    const road = (area: Rect, run: Road['run']): void => {
        roads.push({ area, run, rank: 0 });
    };
    // The exit road goes on from the bridge to the quarter's front edge, where the traders leave.
    road({ x0: EXIT_X - 0.9, x1: EXIT_X + 0.9, z0: z0 + 0.3, z1: z1 - 0.3 }, 'z');
    const left = Math.min(...QUARTER_STOCKS.map((stock) => poolRim(stock)[0])) - 0.75;
    road({ x0: left, x1: EXIT_X, z0: FRONT_Z - 0.65, z1: FRONT_Z + 0.65 }, 'x');
    for (const stock of QUARTER_STOCKS) {
        const [x, , z] = poolRim(stock);
        // Up to the ring, stopping short of the pond's own basin.
        road({ x0: x - 0.6, x1: x + 0.6, z0: z + 0.3, z1: FRONT_Z }, 'z');
    }
    const paving = new Paving(4211);
    paving.roads(ground, roads);
    // The rings sit above every road, and cover the spurs' ends.
    for (const stock of QUARTER_STOCKS) {
        const [x, z] = POOL_SITES[stock];
        paving.pondRing(x, z, PAVE + roads.length * LIFT + 0.003);
    }
    paving.stones.into(ground);

    // ----- What the lawn's scatter keeps clear of -----
    const blocks: Rect[] = roads.map(({ area }) => ({
        x0: area.x0 - 0.1,
        x1: area.x1 + 0.1,
        z0: area.z0 - 0.1,
        z1: area.z1 + 0.1,
    }));
    const rounds: [number, number, number][] = [];
    for (const stock of QUARTER_STOCKS) {
        const [x, z] = POOL_SITES[stock];
        rounds.push([x, z, 3.15]);
        // The vaults, their gauges and the price board behind the pond.
        blocks.push({ x0: x - 4.3, x1: x + 2.3, z0: z - 3.95, z1: z - 1.6 });
    }
    const taken = (x: number, z: number, pad = 0): boolean =>
        blocks.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) ||
        rounds.some(([rx, rz, r]) => (x - rx) * (x - rx) + (z - rz) * (z - rz) < (r + pad) * (r + pad));
    const clear = (x: number, z: number, r: number): void => {
        rounds.push([x, z, r]);
    };

    // ----- Dressing: low things only, so the town behind and the pools stay in view -----
    const garden = new Sculpt();
    // Two lanterns flank the road where the bridge lands, as two flank the town's way out.
    lanternPost(garden, [EXIT_X - 1.45, 0, z0 + 0.75], 0);
    lanternPost(garden, [EXIT_X + 1.45, 0, z0 + 0.75], Math.PI);
    clear(EXIT_X - 1.45, z0 + 0.75, 0.15);
    clear(EXIT_X + 1.45, z0 + 0.75, 0.15);
    // Between two ponds: a stone lantern where the rings come closest, a bush and a rock in front,
    // and a low bush between one pool's vault and the next one's board.
    const sites = QUARTER_STOCKS.map((stock) => POOL_SITES[stock]);
    for (const [i, [ax, az]] of sites.entries()) {
        const next = sites[i + 1];
        if (!next) break;
        const [bx] = next;
        const between = (ax + bx) / 2;
        stoneLantern(garden, [between, 0, az - 0.2], 0.85);
        clear(between, az - 0.2, 0.25);
        bush(garden, [between - 0.15, 0, az + 2.25], 0.95, 40 + i, i === 0 ? PALETTE.blossom : '#ffe08a');
        clear(between - 0.15, az + 2.25, 0.5);
        rock(garden, [between + 0.75, 0, az + 2.8], 0.6, 50 + i);
        clear(between + 0.75, az + 2.8, 0.25);
        const gap = (ax - 4.15 + bx + 2.1) / 2;
        bush(garden, [gap, 0, z0 + 1.05], 0.75, 44 + i);
        clear(gap, z0 + 1.05, 0.4);
    }
    // The strip right of the road: bushes and rocks, nothing tall enough to hide the walkers.
    for (const [x, z, size, tone] of [
        [3.95, 18.6, 0.85, '#ffffff'],
        [4.05, 21.2, 0.7, undefined],
    ] as const) {
        bush(garden, [x, 0, z], size, 60 + z, tone);
        clear(x, z, 0.45 * size);
    }
    rock(garden, [3.85, 0, 22.6], 0.75, 61);
    clear(3.85, 22.6, 0.3);
    rock(garden, [x0 + 0.9, 0, z1 - 0.9], 0.8, 62);
    clear(x0 + 0.9, z1 - 0.9, 0.35);
    bush(garden, [x0 + 0.85, 0, z0 + 0.95], 0.8, 63, '#ffffff');
    clear(x0 + 0.85, z0 + 0.95, 0.4);

    // The quarter's name, on a roofed board by the landing.
    const signAt: readonly [number, number] = [x1 - 0.85, z0 + 2.3];
    garden.group({ at: [signAt[0], 0, signAt[1]], rot: [0, Math.PI / 4, 0] }, (g) => {
        for (const x of [-0.72, 0.72]) g.box(0.09, 1.5, 0.09, { color: PALETTE.woodDark, at: [x, 0, 0], r: 0.02 });
        g.box(1.62, 0.62, 0.07, { color: PALETTE.wood, at: [0, 0.78, -0.02], r: 0.02 });
        g.gableRoof(0.42, 1.86, 0.16, {
            color: PALETTE.roofJade,
            at: [0, 1.5, 0],
            rot: [0, Math.PI / 2, 0],
            thickness: 0.05,
            layer: 'gloss',
        });
    });
    clear(signAt[0], signAt[1], 0.7);
    const sign = makeSign({
        width: 1.48,
        height: 0.5,
        text: 'MARKET QUARTER',
        sub: QUARTER_STOCKS.join(' · '),
        color: '#6a4a36',
        background: '#fff6e2',
        border: '#c08e62',
        weight: 700,
        density: 200,
    });
    sign.mesh.position.set(signAt[0], 1.09, signAt[1]);
    sign.mesh.rotation.y = Math.PI / 4;
    sign.mesh.translateZ(0.025);
    group.add(sign.mesh);
    group.add(garden.build('quarter-garden'));

    // ----- Trees: only at the far end, where nothing stands behind them; anywhere else one would
    // hide a board, a pond or the town -----
    const trees: { node: THREE.Group; phase: number; amount: number }[] = [];
    const plant = (build: (s: Sculpt) => void, x: number, z: number, amount = 0.022): void => {
        const s = new Sculpt();
        build(s);
        const node = s.build('tree');
        node.position.set(x, 0, z);
        group.add(node);
        trees.push({ node, phase: rand() * 6.28, amount });
        clear(x, z, 0.3);
    };
    const cherry: readonly [number, number] = [x0 + 1.75, z1 - 2.6];
    plant((s) => blossomTree(s, [0, 0, 0], 1.05, 21), cherry[0], cherry[1]);
    plant((s) => pineTree(s, [0, 0, 0], 0.85, 22), x0 + 1.15, z0 + 3.4, 0.012);

    // ----- The lawn: tufts, clover, flowers and pebbles -----
    const lawn = new Bits();
    const CELL = 0.56;
    const families = [FLOWER_TONES.pink, FLOWER_TONES.white, FLOWER_TONES.yellow] as const;
    const swell = (x: number, z: number, a: number, b: number): number =>
        0.5 + 0.3 * Math.sin(x * 0.52 + a) * Math.cos(z * 0.47 + b) + 0.2 * Math.sin((x + z) * 0.9 + a * 2);
    const inside = (x: number, z: number): boolean => x > x0 + 0.42 && x < x1 - 0.42 && z > z0 + 0.42 && z < z1 - 0.42;
    let level = 0;
    for (let ix = 0; ix < Math.ceil(w / CELL); ix += 1) {
        for (let iz = 0; iz < Math.ceil(d / CELL); iz += 1) {
            const dice = seeded(700001 + ix * 7919 + iz * 104729);
            const x = x0 + (ix + 0.08 + dice() * 0.84) * CELL;
            const z = z0 + (iz + 0.08 + dice() * 0.84) * CELL;
            const roll = dice();
            if (!inside(x, z) || taken(x, z, 0.14)) continue;
            const flowers = 0.05 + 0.26 * swell(x, z, 1.7, -0.6);
            if (roll < flowers) {
                const family = families[Math.floor(swell(x, z, 4.1, 2.3) * 2.999)] ?? FLOWER_TONES.white;
                flowerClump(lawn, x, z, dice, family);
            } else if (roll < flowers + 0.13) {
                level = (level + 1) % 9;
                cloverPatch(lawn, x, z, dice, 0.0165 + level * 0.0014);
            } else if (roll < flowers + 0.2) {
                pebbles(lawn, x, z, dice);
            } else if (roll < 0.93) {
                grassTuft(lawn, x, z, dice, 0.9 + dice() * 0.35);
            }
        }
    }
    // Petals under the cherry, on the grass and on the path alike.
    const lie = (x: number, z: number): number | undefined => {
        if (!inside(x, z)) return undefined;
        for (const { area } of roads) {
            if (x > area.x0 + 0.06 && x < area.x1 - 0.06 && z > area.z0 + 0.06 && z < area.z1 - 0.06)
                return PAVE + 0.0085;
            if (x > area.x0 - 0.16 && x < area.x1 + 0.16 && z > area.z0 - 0.16 && z < area.z1 + 0.16)
                return undefined;
        }
        return rounds.some(([rx, rz, r]) => (x - rx) ** 2 + (z - rz) ** 2 < r * r) ? undefined : 0.0335;
    };
    fallenPetals(lawn, cherry[0], cherry[1], 1.8, 60, seeded(6131), ['#f9bfd0', '#fbd3df', '#f29bb6'], lie);
    lawn.into(ground);
    group.add(ground.build('quarter-ground'));

    return {
        group,
        petals: [new THREE.Vector3(cherry[0], 3, cherry[1])],
        update(_dt, time) {
            if (!group.visible) return;
            for (const tree of trees) {
                tree.node.rotation.z = Math.sin(time * 0.9 + tree.phase) * tree.amount;
                tree.node.rotation.x = Math.cos(time * 0.7 + tree.phase * 1.7) * tree.amount * 0.7;
            }
        },
    };
}
