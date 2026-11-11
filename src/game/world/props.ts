/**
 * Small things that dress the town: trees, bushes, rocks, lanterns, fences,
 * the clutter at each building's foot, and the stones, tufts and flowers that
 * texture the ground. Each function sculpts into the `Sculpt` (or `Bits`) it
 * is given, at a ground position.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { PALETTE, type Hex, type PartOpts, type Sculpt, type V3, seeded } from '../scene/kit.ts';

type Rand = () => number;

/**
 * A box with rounded edges, anchored at the centre of its base like
 * `Sculpt.box`, but with a third of the triangles: enough for small props,
 * whose corners are a pixel or two on screen.
 */
function soft(s: Sculpt, w: number, h: number, d: number, r: number, opts: PartOpts): void {
    s.geo(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) * 0.49)), opts, h / 2);
}

function pickOne<T>(rand: Rand, list: readonly T[]): T {
    return list[Math.floor(rand() * list.length)] as T;
}

/** A blossoming tree: a bent trunk under a cloud of puffs. `tones` colours the canopy. */
export function blossomTree(
    s: Sculpt,
    at: V3,
    size = 1,
    seed = 1,
    tones: readonly Hex[] = [PALETTE.blossom, PALETTE.blossomDeep, '#fde0e8'],
): void {
    const rand = seeded(seed * 7919);
    const lean = (rand() - 0.5) * 0.3;
    s.group({ at, scale: size, rot: [0, rand() * Math.PI * 2, 0] }, (g) => {
        g.cyl(0.13, 0.2, 1.3, { color: PALETTE.woodDeep, at: [0, 0, 0], rot: [0, 0, lean], seg: 9 });
        g.cyl(0.09, 0.13, 0.9, {
            color: PALETTE.woodDeep,
            at: [-Math.sin(lean) * 1.25, 1.2, 0],
            rot: [0, 0, -lean * 1.4 + 0.25],
            seg: 8,
        });
        g.cyl(0.07, 0.1, 0.8, {
            color: PALETTE.woodDeep,
            at: [-Math.sin(lean) * 1.25, 1.15, 0],
            rot: [0.3, 0, -0.55],
            seg: 8,
        });
        const puffs = 7;
        for (let i = 0; i < puffs; i += 1) {
            const angle = (i / puffs) * Math.PI * 2 + rand();
            const reach = i === 0 ? 0 : 0.5 + rand() * 0.35;
            const r = i === 0 ? 0.82 : 0.48 + rand() * 0.26;
            g.ball(r, {
                color: pickOne(rand, tones),
                at: [Math.cos(angle) * reach, 2.15 + (i === 0 ? 0.25 : rand() * 0.5 - 0.1), Math.sin(angle) * reach],
                scale: [1, 0.82, 1],
                detail: 2,
            });
        }
    });
}

/** A maple in autumn colours. */
export function mapleTree(s: Sculpt, at: V3, size = 1, seed = 1): void {
    blossomTree(s, at, size, seed + 31, [PALETTE.maple, '#f6a85a', '#e86f48']);
}

/** A leafy green tree. */
export function greenTree(s: Sculpt, at: V3, size = 1, seed = 1): void {
    blossomTree(s, at, size, seed + 57, ['#a6d48c', '#8fc47c', '#bfe0a0']);
}

/** A garden pine: a curved trunk carrying flat pads of needles. */
export function pineTree(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 104729);
    s.group({ at, scale: size, rot: [0, rand() * Math.PI * 2, 0] }, (g) => {
        g.tube(
            [
                [0, 0, 0],
                [0.12, 0.7, 0],
                [-0.1, 1.4, 0.05],
                [0.15, 2.1, 0],
                [0.05, 2.7, 0],
            ],
            0.11,
            { color: '#9a6a4c', seg: 14 },
        );
        const pads: ReadonlyArray<readonly [number, number, number, number]> = [
            [0.55, 1.25, 0.1, 0.62],
            [-0.5, 1.75, -0.15, 0.6],
            [0.35, 2.3, 0.2, 0.55],
            [0, 2.85, 0, 0.5],
        ];
        for (const [x, y, z, r] of pads) {
            g.ball(r, {
                color: PALETTE.pineDeep,
                top: PALETTE.pine,
                at: [x, y, z],
                scale: [1.25, 0.46, 1.25],
                detail: 2,
            });
        }
    });
}

/**
 * A garden pine pruned small: the same shape as `pineTree` in a third of the
 * triangles, for a tree that stands still among the garden's dressing.
 */
export function gardenPine(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 104729);
    s.group({ at, scale: size, rot: [0, rand() * Math.PI * 2, 0] }, (g) => {
        g.tube(
            [
                [0, 0, 0],
                [0.14, 0.75, 0],
                [-0.12, 1.5, 0.05],
                [0.1, 2.3, 0],
            ],
            0.12,
            { color: '#9a6a4c', seg: 7 },
        );
        const pads: ReadonlyArray<readonly [number, number, number, number]> = [
            [0.6, 1.2, 0.1, 0.66],
            [-0.52, 1.8, -0.15, 0.62],
            [0.12, 2.45, 0.05, 0.6],
        ];
        for (const [x, y, z, r] of pads) {
            g.ball(r, {
                color: PALETTE.pineDeep,
                top: PALETTE.pine,
                at: [x, y, z],
                scale: [1.25, 0.46, 1.25],
                detail: 1,
            });
        }
    });
}

/** A clump of bamboo. */
export function bamboo(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 6151);
    s.group({ at, scale: size }, (g) => {
        for (let i = 0; i < 5; i += 1) {
            const x = (rand() - 0.5) * 0.7;
            const z = (rand() - 0.5) * 0.7;
            const h = 2.2 + rand() * 1.3;
            const lean = (rand() - 0.5) * 0.14;
            g.cyl(0.05, 0.06, h, { color: PALETTE.bamboo, at: [x, 0, z], rot: [lean, 0, lean], seg: 7 });
            for (let k = 0; k < 3; k += 1) {
                g.ball(0.2, {
                    color: k % 2 ? '#a9d67f' : '#86bd68',
                    at: [x + (rand() - 0.5) * 0.4, h * (0.62 + k * 0.14), z + (rand() - 0.5) * 0.4],
                    scale: [1.5, 0.35, 0.8],
                    rot: [0, rand() * 3, 0.3],
                    detail: 1,
                });
            }
        }
    });
}

/** A rounded bush, sometimes dotted with flowers. */
export function bush(s: Sculpt, at: V3, size = 1, seed = 1, flowers?: Hex): void {
    const rand = seeded(seed * 2749);
    s.group({ at, scale: size }, (g) => {
        g.ball(0.42, { color: '#8cc47a', top: '#b2dc98', at: [0, 0.3, 0], scale: [1.1, 0.8, 1.1], detail: 2 });
        g.ball(0.3, { color: '#7dba70', top: '#a6d48c', at: [0.34, 0.24, 0.14], scale: [1, 0.8, 1], detail: 2 });
        g.ball(0.26, { color: '#96cc82', top: '#bfe0a0', at: [-0.3, 0.2, -0.12], scale: [1, 0.8, 1], detail: 2 });
        if (flowers !== undefined) {
            for (let i = 0; i < 6; i += 1) {
                const a = rand() * Math.PI * 2;
                const r = 0.3 + rand() * 0.12;
                g.ball(0.055, {
                    color: flowers,
                    at: [Math.cos(a) * r, 0.42 + rand() * 0.16, Math.sin(a) * r],
                    detail: 0,
                    flat: true,
                });
            }
        }
    });
}

/** A garden rock. */
export function rock(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 3571);
    s.ball(0.4 * size, {
        color: PALETTE.stoneDark,
        top: PALETTE.stone,
        at: [at[0], at[1] + 0.16 * size, at[2]],
        scale: [1 + rand() * 0.4, 0.62 + rand() * 0.2, 0.9 + rand() * 0.3],
        rot: [0, rand() * 3, 0],
        detail: 1,
        flat: true,
    });
}

/** A stone garden lantern whose light box glows at night. */
export function stoneLantern(s: Sculpt, at: V3, size = 1): void {
    s.group({ at, scale: size }, (g) => {
        soft(g, 0.5, 0.14, 0.5, 0.04, { color: PALETTE.stoneDark });
        g.cyl(0.1, 0.13, 0.62, { color: PALETTE.stone, at: [0, 0.14, 0], seg: 10 });
        soft(g, 0.52, 0.09, 0.52, 0.03, { color: PALETTE.stone, at: [0, 0.76, 0] });
        soft(g, 0.34, 0.3, 0.34, 0.03, { color: PALETTE.stone, at: [0, 0.85, 0] });
        g.box(0.2, 0.2, 0.36, { color: PALETTE.windowWarm, at: [0, 0.9, 0], layer: 'window', r: 0 });
        g.box(0.36, 0.2, 0.2, { color: PALETTE.windowWarm, at: [0, 0.9, 0], layer: 'window', r: 0 });
        g.hipRoof(0.74, 0.74, 0.26, { color: PALETTE.stoneDark, at: [0, 1.15, 0], tip: 0.06 });
        g.ball(0.07, { color: PALETTE.stone, at: [0, 1.46, 0], detail: 1 });
    });
}

/** A wooden post with a paper lantern hanging from its arm. `turn` rotates the arm about Y. */
export function lanternPost(s: Sculpt, at: V3, turn = 0, color: Hex = PALETTE.vermilion): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        g.cyl(0.07, 0.09, 2.1, { color: PALETTE.woodDark, seg: 8 });
        g.box(0.75, 0.08, 0.08, { color: PALETTE.woodDark, at: [0.28, 1.92, 0], r: 0 });
        g.cyl(0.012, 0.012, 0.18, { color: PALETTE.ink, at: [0.55, 1.74, 0], seg: 5 });
        g.lathe(
            [
                [0.06, 0],
                [0.17, 0.06],
                [0.2, 0.2],
                [0.17, 0.34],
                [0.06, 0.4],
            ],
            { color: PALETTE.lantern, at: [0.55, 1.34, 0], layer: 'window', seg: 14 },
        );
        g.cyl(0.07, 0.07, 0.04, { color, at: [0.55, 1.73, 0], seg: 10 });
        g.cyl(0.07, 0.07, 0.04, { color, at: [0.55, 1.31, 0], seg: 10 });
    });
}

/** A low wooden fence from `from` to `to` (both on the ground, along X or Z). */
export function fence(s: Sculpt, from: V3, to: V3, color: Hex = PALETTE.wood): void {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const length = Math.hypot(dx, dz);
    const count = Math.max(2, Math.round(length / 0.7) + 1);
    const angle = Math.atan2(-dz, dx);
    for (let i = 0; i < count; i += 1) {
        const t = i / (count - 1);
        soft(s, 0.1, 0.52, 0.1, 0.03, { color, at: [from[0] + dx * t, from[1], from[2] + dz * t] });
    }
    for (const y of [0.2, 0.38]) {
        s.box(length, 0.06, 0.05, {
            color,
            at: [(from[0] + to[0]) / 2, from[1] + y, (from[2] + to[2]) / 2],
            rot: [0, angle, 0],
            r: 0,
        });
    }
}

/** A simple bench facing +Z. */
export function bench(s: Sculpt, at: V3, turn = 0): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        soft(g, 1.1, 0.08, 0.36, 0.03, { color: PALETTE.wood, at: [0, 0.3, 0] });
        g.box(0.08, 0.3, 0.3, { color: PALETTE.woodDark, at: [-0.42, 0, 0], r: 0 });
        g.box(0.08, 0.3, 0.3, { color: PALETTE.woodDark, at: [0.42, 0, 0], r: 0 });
    });
}

/** How far the camera looks down, in radians; clouds lean back by this much to face it. */
const CAMERA_TILT = 0.5585;

/**
 * Gives a rounded shape the soft, even light of a cloud: its normals keep
 * only a little of their own direction and otherwise point up, so the sun
 * brightens the whole of it and no side falls into hard shade.
 */
function puff(geometry: THREE.BufferGeometry, rise = 1): THREE.BufferGeometry {
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i += 1) {
        const x = normal.getX(i) * 0.75;
        const y = normal.getY(i) * 0.5 + rise;
        const z = normal.getZ(i) * 0.5 + rise * 0.55;
        const length = Math.hypot(x, y, z) || 1;
        normal.setXYZ(i, x / length, y / length, z / length);
    }
    return geometry;
}

/**
 * A stylised cloud, centred on its base line at `at`: rounded lobes standing
 * side by side on one flat bottom, a lower row stacked in front. It is flat
 * like a cushion and turned to face the fixed camera, so its outline always
 * reads as a clean base line under soft bumps.
 */
export function cloud(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 1291);
    const flip = rand() > 0.5 ? 1 : -1;
    const shade = '#e3ebf6';
    const lobe = (x: number, r: number, tall: number, deep: number, z = 0): void => {
        const fine = r > 0.5;
        const dome = puff(new THREE.SphereGeometry(r, fine ? 16 : 10, fine ? 6 : 4, 0, Math.PI * 2, 0, Math.PI / 2));
        dome.scale(1, tall, deep);
        s.geo(dome, { color: shade, top: '#ffffff', at: [x * flip, 0, z] });
    };
    // Local X runs across the screen, local Y up it, local Z towards the camera.
    s.group({ at, scale: size, rot: [0, Math.PI / 4, 0] }, (turned) => {
        turned.group({ rot: [-CAMERA_TILT, 0, 0] }, () => {
            const wobble = (): number => 0.93 + rand() * 0.14;
            // The back row: one tall lobe between two lower ones.
            lobe(-0.1, 1.08 * wobble(), 0.96, 0.55);
            lobe(0.98, 0.78 * wobble(), 0.94, 0.5);
            lobe(-1.08, 0.7 * wobble(), 0.94, 0.48);
            // The ends taper off.
            lobe(1.72, 0.44 * wobble(), 0.9, 0.46);
            lobe(-1.7, 0.4 * wobble(), 0.9, 0.44);
            // The front row sits lower and nearer, so the lobes read as stacked.
            lobe(0.44, 0.56 * wobble(), 0.86, 0.5, 0.36);
            lobe(-0.62, 0.48 * wobble(), 0.86, 0.48, 0.34);
            // A rounded lip along the flat bottom.
            const lip = puff(new THREE.CapsuleGeometry(0.15, 3.3, 3, 8).rotateZ(Math.PI / 2), 0.6);
            lip.scale(1, 1, 2.6);
            s.geo(lip, { color: shade, top: '#f2f6fc', at: [0, 0.08, 0.14] });
        });
    });
}

/** A street-food stall: a counter under a striped awning, lanterns and two stools. It faces +Z. */
export function foodStall(s: Sculpt, at: V3, turn = 0): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        // The cart and its counter.
        g.box(1.9, 0.86, 0.9, { color: PALETTE.wood, top: '#d3a273', at: [0, 0.08, 0], r: 0.05 });
        soft(g, 2.06, 0.08, 1.1, 0.03, { color: PALETTE.woodDark, at: [0, 0.94, 0.04] });
        for (const x of [-0.7, 0.7])
            g.cyl(0.16, 0.16, 0.1, { color: PALETTE.charcoal, at: [x, 0.16, 0.48], rot: [Math.PI / 2, 0, 0], seg: 14 });
        // Posts and the awning.
        for (const x of [-0.92, 0.92]) {
            for (const z of [-0.4, 0.46]) g.box(0.07, 1.36, 0.07, { color: PALETTE.woodDark, at: [x, 0.98, z], r: 0 });
        }
        const stripes = 6;
        for (let i = 0; i < stripes; i += 1) {
            g.box(2.2 / stripes + 0.004, 0.06, 1.5, {
                color: i % 2 === 0 ? PALETTE.vermilion : PALETTE.paper,
                at: [-1.1 + (2.2 / stripes) * (i + 0.5), 2.32, 0.1],
                rot: [0.2, 0, 0],
                r: 0,
            });
        }
        // A short curtain along the front, and a lantern at each end.
        for (let i = 0; i < 4; i += 1)
            g.box(0.44, 0.3, 0.03, { color: PALETTE.roofIndigo, at: [-0.69 + i * 0.46, 1.86, 0.6], r: 0 });
        for (const x of [-1.02, 1.02]) {
            g.lathe(
                [
                    [0.05, 0],
                    [0.14, 0.05],
                    [0.16, 0.17],
                    [0.14, 0.29],
                    [0.05, 0.34],
                ],
                { color: PALETTE.lantern, at: [x, 1.58, 0.68], layer: 'window', seg: 12 },
            );
        }
        // On the counter: bowls, a steaming pot, a bottle.
        for (const x of [-0.5, -0.14]) {
            g.cyl(0.13, 0.08, 0.1, { color: PALETTE.paper, at: [x, 1.02, 0.28], seg: 14, layer: 'gloss' });
            g.cyl(0.11, 0.11, 0.02, { color: '#f0c67a', at: [x, 1.1, 0.28], seg: 14 });
        }
        g.cyl(0.2, 0.18, 0.26, { color: PALETTE.charcoal, at: [0.48, 1.02, 0.02], seg: 14 });
        g.cyl(0.21, 0.21, 0.03, { color: '#7a7480', at: [0.48, 1.28, 0.02], seg: 14 });
        g.cyl(0.045, 0.06, 0.24, { color: '#7fb88a', at: [0.1, 1.02, -0.1], seg: 8, layer: 'gloss' });
        // Stools.
        for (const x of [-0.5, 0.36]) {
            g.cyl(0.17, 0.17, 0.07, { color: PALETTE.vermilion, at: [x, 0.42, 0.98], seg: 14, layer: 'gloss' });
            g.cyl(0.04, 0.06, 0.42, { color: PALETTE.woodDark, at: [x, 0, 0.98], seg: 8 });
        }
    });
}

/** A drinks vending machine, glowing at night. It faces +Z. */
export function vendingMachine(s: Sculpt, at: V3, turn = 0, color: Hex = '#5ea4e8'): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        g.box(0.86, 1.62, 0.6, { color, top: '#8fc2f2', r: 0.06, layer: 'gloss' });
        g.box(0.66, 0.86, 0.04, { color: PALETTE.windowWarm, at: [-0.04, 0.62, 0.29], layer: 'window', r: 0 });
        const drinks: readonly Hex[] = ['#ef7d6d', '#f3c45a', '#59c98a', '#f9bfd0', '#ffffff', '#9471c4'];
        drinks.forEach((tone, i) => {
            g.cyl(0.045, 0.045, 0.16, {
                color: tone,
                at: [-0.26 + (i % 3) * 0.22, 0.72 + Math.floor(i / 3) * 0.36, 0.31],
                seg: 8,
                layer: 'gloss',
            });
        });
        g.box(0.56, 0.16, 0.04, { color: PALETTE.charcoal, at: [-0.04, 0.18, 0.29], r: 0 });
        g.box(0.08, 0.2, 0.04, { color: PALETTE.paper, at: [0.34, 0.56, 0.29], r: 0 });
        soft(g, 0.9, 0.06, 0.64, 0.02, { color: '#3f6fa8', at: [0, 1.62, 0] });
    });
}

// ----- Ground texture: thousands of tiny pieces, batched by colour -----

const UP: V3 = [0, 1, 0];
/** The direction from the town to the fixed camera. */
const TO_CAMERA: V3 = [0.6, 0.53, 0.6];

/**
 * Collects many tiny single-colour pieces (paving stones, grass blades,
 * petals) as loose triangles, then sculpts each colour as one part. Thousands
 * of pieces then cost little to build and add nothing to draw. The camera
 * never rotates, so faces that turn away from it are left out.
 */
export class Bits {
    private readonly tones = new Map<string, number[]>();
    private count = 0;

    /** How many triangles have been collected. */
    get triangles(): number {
        return this.count;
    }

    /** A triangle, wound so that its front faces `out`. */
    tri(color: string, a: V3, b: V3, c: V3, out: V3 = UP): void {
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const facing = nx * out[0] + ny * out[1] + nz * out[2];
        if (facing < 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
        }
        // Skip a sliver with no area, and a face the camera sees from behind or almost edge-on.
        const area = Math.hypot(nx, ny, nz);
        const seen = nx * TO_CAMERA[0] + ny * TO_CAMERA[1] + nz * TO_CAMERA[2];
        if (area < 1e-10 || seen < 0.2 * area) return;
        let list = this.tones.get(color);
        if (!list) {
            list = [];
            this.tones.set(color, list);
        }
        if (facing >= 0) list.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        else list.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
        this.count += 1;
    }

    /** A flat four-cornered face; corners in order round its outline. */
    quad(color: string, a: V3, b: V3, c: V3, d: V3, out: V3 = UP): void {
        this.tri(color, a, b, c, out);
        this.tri(color, a, c, d, out);
    }

    /** Sculpts everything collected into `s` and empties the collection. */
    into(s: Sculpt): void {
        for (const [color, list] of this.tones) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
            s.geo(geometry, { color, flat: true });
            geometry.dispose();
        }
        this.tones.clear();
        this.count = 0;
    }
}

type Corner = readonly [number, number];

/** The top and chamfered edge of a flat stone: `outer` at height `y`, `inner` (the top) `h` above it. */
function stoneFaces(
    bits: Bits,
    color: string,
    outer: readonly Corner[],
    inner: readonly Corner[],
    y: number,
    h: number,
): void {
    const top = y + h;
    const first = inner[0] as Corner;
    for (let i = 1; i < inner.length - 1; i += 1) {
        const b = inner[i] as Corner;
        const c = inner[i + 1] as Corner;
        bits.tri(color, [first[0], top, first[1]], [b[0], top, b[1]], [c[0], top, c[1]]);
    }
    for (let i = 0; i < outer.length; i += 1) {
        const j = (i + 1) % outer.length;
        const a = outer[i] as Corner;
        const b = outer[j] as Corner;
        const c = inner[j] as Corner;
        const d = inner[i] as Corner;
        bits.quad(color, [a[0], y, a[1]], [b[0], y, b[1]], [c[0], top, c[1]], [d[0], top, d[1]]);
    }
}

/**
 * A rectangular paving stone from (x0, z0) to (x1, z1). It rises `h` from
 * the joint level `y`, and its top is `bevel` narrower all round, so each
 * stone catches the light on its own.
 */
export function paver(
    bits: Bits,
    color: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    h: number,
    bevel = 0.02,
): void {
    const b = Math.min(bevel, (x1 - x0) * 0.3, (z1 - z0) * 0.3);
    stoneFaces(
        bits,
        color,
        [
            [x0, z0],
            [x0, z1],
            [x1, z1],
            [x1, z0],
        ],
        [
            [x0 + b, z0 + b],
            [x0 + b, z1 - b],
            [x1 - b, z1 - b],
            [x1 - b, z0 + b],
        ],
        y,
        h,
    );
}

/** A flat stone of any convex outline (`corners`, in order round it), chamfered like `paver`. */
export function flagstone(
    bits: Bits,
    color: string,
    corners: readonly Corner[],
    y: number,
    h: number,
    bevel = 0.02,
): void {
    let cx = 0;
    let cz = 0;
    for (const [x, z] of corners) {
        cx += x / corners.length;
        cz += z / corners.length;
    }
    const inner = corners.map(([x, z]): Corner => {
        const reach = Math.hypot(cx - x, cz - z) || 1;
        const step = Math.min(bevel * 1.4, reach * 0.35) / reach;
        return [x + (cx - x) * step, z + (cz - z) * step];
    });
    stoneFaces(bits, color, corners, inner, y, h);
}

/** A flat many-sided patch lying at height `y`: `wobble` makes its outline irregular. */
function groundPatch(
    bits: Bits,
    color: string,
    x: number,
    y: number,
    z: number,
    r: number,
    sides: number,
    rand: Rand,
    wobble = 0.3,
    stretch = 1,
): void {
    const turn = rand() * Math.PI * 2;
    const rim: V3[] = [];
    for (let i = 0; i < sides; i += 1) {
        const a = turn + (i / sides) * Math.PI * 2;
        const reach = r * (1 - wobble / 2 + rand() * wobble);
        rim.push([x + Math.cos(a) * reach * stretch, y, z + Math.sin(a) * reach]);
    }
    for (let i = 1; i < sides - 1; i += 1) bits.tri(color, rim[0] as V3, rim[i] as V3, rim[i + 1] as V3);
}

/** A pointed blade or stem: a three-sided spike from the ground to a tip that leans by (leanX, leanZ). */
function spike(
    bits: Bits,
    color: string,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    leanX: number,
    leanZ: number,
    turn: number,
): void {
    const tip: V3 = [x + leanX, y + h, z + leanZ];
    const base: V3[] = [0, 1, 2].map((i): V3 => {
        const a = turn + (i / 3) * Math.PI * 2;
        return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    });
    for (let i = 0; i < 3; i += 1) {
        const a = base[i] as V3;
        const b = base[(i + 1) % 3] as V3;
        bits.tri(color, a, b, tip, [(a[0] + b[0]) / 2 - x, 0.4 * r, (a[2] + b[2]) / 2 - z]);
    }
}

/** A flower head: a small low pyramid whose base is centred at (x, y, z). */
function bloom(bits: Bits, color: string, x: number, y: number, z: number, r: number): void {
    const tip: V3 = [x, y + r * 0.7, z];
    const ring: V3[] = [0, 1, 2, 3].map((i): V3 => {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    });
    for (let i = 0; i < 4; i += 1) {
        const a = ring[i] as V3;
        const b = ring[(i + 1) % 4] as V3;
        bits.tri(color, a, b, tip, [(a[0] + b[0]) / 2 - x, r, (a[2] + b[2]) / 2 - z]);
    }
}

/** A stem thin enough to be one sliver, turned to the camera. */
function stem(bits: Bits, color: string, x: number, y: number, z: number, h: number, w: number): void {
    bits.tri(color, [x + w, y, z - w], [x - w, y, z + w], [x, y + h, z], TO_CAMERA);
}

const TUFT_TONES = ['#9fcd82', '#93c478', '#abd68d', '#8cc07a'] as const;

/** A tuft of grass: a few short blades fanning out from (x, z). Under 0.25 tall at size 1. */
export function grassTuft(bits: Bits, x: number, z: number, rand: Rand, size = 1, y = 0): void {
    const blades = 4 + Math.floor(rand() * 3);
    const tone = pickOne(rand, TUFT_TONES);
    for (let i = 0; i < blades; i += 1) {
        const a = rand() * Math.PI * 2;
        const reach = (i === 0 ? 0 : 0.035 + rand() * 0.065) * size;
        const h = Math.min((i === 0 ? 0.15 + rand() * 0.06 : 0.08 + rand() * 0.09) * size, 0.24);
        spike(
            bits,
            i % 2 === 0 ? tone : pickOne(rand, TUFT_TONES),
            x + Math.cos(a) * reach,
            y,
            z + Math.sin(a) * reach,
            (0.034 + rand() * 0.014) * size,
            h,
            Math.cos(a) * h * 0.35,
            Math.sin(a) * h * 0.35,
            rand() * 2,
        );
    }
}

const MOSS_TONES = ['#a0ce86', '#96c77e', '#a8d48d'] as const;

/**
 * A patch of clover or moss: a flat irregular blot at height `y` with
 * lighter leaves dotted over it and, now and then, a few white heads.
 */
export function cloverPatch(bits: Bits, x: number, z: number, rand: Rand, y: number, size = 1): void {
    const r = (0.26 + rand() * 0.2) * size;
    const tone = pickOne(rand, MOSS_TONES);
    groundPatch(bits, tone, x, y, z, r, 10, rand, 0.22, 0.85 + rand() * 0.4);
    // A second, smaller blot beside the first, so the patch is not a plain disc.
    const side = rand() * Math.PI * 2;
    groundPatch(
        bits,
        tone,
        x + Math.cos(side) * r * 0.8,
        y + 0.0004,
        z + Math.sin(side) * r * 0.8,
        r * 0.6,
        8,
        rand,
        0.22,
    );
    const leaves = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < leaves; i += 1) {
        const a = rand() * Math.PI * 2;
        const reach = rand() * r * 0.75;
        groundPatch(
            bits,
            '#c3e2a2',
            x + Math.cos(a) * reach,
            y + 0.0012,
            z + Math.sin(a) * reach,
            0.04 + rand() * 0.03,
            3,
            rand,
            0.2,
        );
    }
    if (rand() < 0.55) {
        const heads = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < heads; i += 1) {
            const a = rand() * Math.PI * 2;
            const reach = rand() * r * 0.7;
            bloom(bits, '#ffffff', x + Math.cos(a) * reach, y + 0.03, z + Math.sin(a) * reach, 0.04);
        }
    }
}

/** The flower colours of the town's lawns: pinks, whites and yellows. */
export const FLOWER_TONES = {
    pink: ['#f9bfd0', '#f29bb6', '#ffd3df'],
    white: ['#ffffff', '#fff6e4', '#ffffff'],
    yellow: ['#ffe08a', '#f7cf62', '#fff0b0'],
} as const;

/** A clump of small flowers on short stems with a few leaves, in one family of colours. Under 0.25 tall. */
export function flowerClump(
    bits: Bits,
    x: number,
    z: number,
    rand: Rand,
    tones: readonly string[] = FLOWER_TONES.pink,
    size = 1,
    y = 0,
): void {
    const blooms = 3 + Math.floor(rand() * 4);
    const spread = (0.1 + rand() * 0.12) * size;
    for (let i = 0; i < blooms; i += 1) {
        const a = rand() * Math.PI * 2;
        const reach = Math.sqrt(rand()) * spread;
        const fx = x + Math.cos(a) * reach;
        const fz = z + Math.sin(a) * reach;
        const h = (0.07 + rand() * 0.09) * size;
        stem(bits, '#86bd72', fx, y, fz, h + 0.01, 0.012 * size);
        bloom(bits, pickOne(rand, tones), fx, y + h, fz, (0.048 + rand() * 0.02) * size);
    }
    for (let i = 0; i < 2; i += 1) {
        const a = rand() * Math.PI * 2;
        const h = (0.07 + rand() * 0.06) * size;
        spike(
            bits,
            pickOne(rand, TUFT_TONES),
            x + Math.cos(a) * spread * 0.8,
            y,
            z + Math.sin(a) * spread * 0.8,
            0.03 * size,
            h,
            Math.cos(a) * h * 0.4,
            Math.sin(a) * h * 0.4,
            rand() * 2,
        );
    }
}

const PEBBLE_TONES = ['#cfc8bd', '#bdb6aa', '#ddd7cc', '#c6bca9'] as const;

/** One to three pebbles lying about (x, z). */
export function pebbles(bits: Bits, x: number, z: number, rand: Rand, size = 1, y = 0): void {
    const stones = 1 + Math.floor(rand() * 3);
    for (let n = 0; n < stones; n += 1) {
        const px = x + (n === 0 ? 0 : (rand() - 0.5) * 0.3) * size;
        const pz = z + (n === 0 ? 0 : (rand() - 0.5) * 0.3) * size;
        const r = (n === 0 ? 0.07 + rand() * 0.045 : 0.035 + rand() * 0.03) * size;
        const h = r * (0.5 + rand() * 0.3);
        const turn = rand() * 3;
        const long = 1 + rand() * 0.5;
        const color = pickOne(rand, PEBBLE_TONES);
        const foot: Corner[] = [];
        const crown: Corner[] = [];
        for (let i = 0; i < 5; i += 1) {
            const a = turn + (i / 5) * Math.PI * 2;
            const reach = r * (0.85 + rand() * 0.3);
            const ax = Math.cos(a) * reach * long;
            const az = Math.sin(a) * reach;
            foot.push([px + ax, pz + az]);
            crown.push([px + ax * 0.55, pz + az * 0.55]);
        }
        stoneFaces(bits, color, foot, crown, y, h);
    }
}

/** Petals or leaves fallen within `radius` of (x, z); `lie` gives the height to lay one at, or undefined to skip it. */
export function fallenPetals(
    bits: Bits,
    x: number,
    z: number,
    radius: number,
    count: number,
    rand: Rand,
    tones: readonly string[],
    lie: (x: number, z: number) => number | undefined,
): void {
    for (let i = 0; i < count; i += 1) {
        const a = rand() * Math.PI * 2;
        // More petals near the trunk than far from it.
        const reach = radius * (0.15 + 0.85 * rand() * rand()) + 0.25;
        const px = x + Math.cos(a) * reach;
        const pz = z + Math.sin(a) * reach;
        const turn = rand() * Math.PI;
        const long = 0.05 + rand() * 0.035;
        const wide = long * 0.6;
        const color = pickOne(rand, tones);
        const y = lie(px, pz);
        if (y === undefined) continue;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        bits.quad(
            color,
            [px + cos * long, y, pz + sin * long],
            [px - sin * wide, y, pz + cos * wide],
            [px - cos * long, y, pz - sin * long],
            [px + sin * wide, y, pz - cos * wide],
        );
    }
}

// ----- Clutter for the foot of a building -----

/** A wooden crate. `fill` heaps something in its top (fruit, scrolls, coal). */
export function crate(s: Sculpt, at: V3, size = 1, turn = 0, fill?: Hex): void {
    s.group({ at, rot: [0, turn, 0], scale: size }, (g) => {
        soft(g, 0.46, 0.32, 0.4, 0.025, { color: PALETTE.wood, top: '#d6a777' });
        // Battens on every side, a rim round the top.
        for (const x of [-0.15, 0.15]) {
            for (const z of [-0.2, 0.2]) g.box(0.06, 0.3, 0.014, { color: PALETTE.woodDark, at: [x, 0.01, z], r: 0 });
        }
        for (const z of [-0.12, 0.12]) {
            for (const x of [-0.23, 0.23]) g.box(0.014, 0.3, 0.06, { color: PALETTE.woodDark, at: [x, 0.01, z], r: 0 });
        }
        g.box(0.49, 0.045, 0.43, { color: PALETTE.woodDark, at: [0, 0.285, 0], r: 0 });
        g.box(0.41, 0.02, 0.35, { color: fill === undefined ? '#b98a5e' : PALETTE.woodDeep, at: [0, 0.315, 0], r: 0 });
        if (fill !== undefined) {
            const rand = seeded(Math.round((at[0] * 31 + at[2] * 17) * 100) + 7);
            for (let i = 0; i < 6; i += 1) {
                g.ball(0.075, {
                    color: fill,
                    at: [-0.12 + (i % 3) * 0.12 + (rand() - 0.5) * 0.04, 0.37, -0.07 + Math.floor(i / 3) * 0.14],
                    detail: 0,
                    flat: true,
                });
            }
        }
    });
}

/** A barrel standing on `at`. */
export function barrel(s: Sculpt, at: V3, size = 1, tone: Hex = PALETTE.wood): void {
    s.group({ at, scale: size }, (g) => {
        g.lathe(
            [
                [0.18, 0],
                [0.235, 0.13],
                [0.25, 0.28],
                [0.235, 0.43],
                [0.18, 0.56],
            ],
            { color: tone, top: '#d3a273', seg: 12 },
        );
        g.cyl(0.18, 0.18, 0.03, { color: PALETTE.woodDark, at: [0, 0.535, 0], seg: 12 });
        for (const y of [0.12, 0.41]) g.cyl(0.247, 0.247, 0.045, { color: PALETTE.charcoal, at: [0, y, 0], seg: 12 });
    });
}

/** A straw-wrapped cask of the kind stacked at shrines: pale, roped, with a painted mark. */
export function cask(s: Sculpt, at: V3, size = 1, turn = 0, mark: Hex = PALETTE.vermilion): void {
    s.group({ at, scale: size, rot: [0, turn, 0] }, (g) => {
        g.lathe(
            [
                [0.2, 0],
                [0.235, 0.1],
                [0.24, 0.23],
                [0.235, 0.36],
                [0.2, 0.46],
            ],
            { color: '#eadbb8', top: PALETTE.paper, seg: 12 },
        );
        g.cyl(0.2, 0.2, 0.03, { color: '#e2cfa6', at: [0, 0.435, 0], seg: 12 });
        for (const y of [0.06, 0.36]) g.cyl(0.243, 0.243, 0.03, { color: '#c9a86a', at: [0, y, 0], seg: 12 });
        // The brewer's mark, on the two sides the camera sees.
        g.box(0.17, 0.16, 0.02, { color: mark, at: [0, 0.15, 0.232], r: 0 });
        g.box(0.02, 0.16, 0.17, { color: mark, at: [0.232, 0.15, 0], r: 0 });
    });
}

/** A tied sack of grain or coins. */
export function sack(s: Sculpt, at: V3, size = 1, seed = 1, tone: Hex = '#e6d5ae'): void {
    const rand = seeded(seed * 4409);
    s.group({ at, scale: size, rot: [0, rand() * 6, (rand() - 0.5) * 0.2] }, (g) => {
        g.ball(0.2, { color: '#cbb689', top: tone, at: [0, 0.165, 0], scale: [1, 0.88, 0.84], detail: 1 });
        g.cyl(0.07, 0.045, 0.08, { color: tone, at: [0, 0.31, 0], seg: 6 });
        g.cyl(0.052, 0.052, 0.02, { color: PALETTE.woodDark, at: [0, 0.318, 0], seg: 6 });
    });
}

/** What grows in a pot. */
export type PotPlant = 'bush' | 'bloom' | 'pine' | 'reeds';

/** A glazed pot with something growing in it. `tone` colours the flowers of a 'bloom'. */
export function pottedPlant(
    s: Sculpt,
    at: V3,
    size = 1,
    seed = 1,
    plant: PotPlant = 'bush',
    glaze: Hex = '#7fa7c9',
    tone: Hex = PALETTE.blossom,
): void {
    const rand = seeded(seed * 3301);
    s.group({ at, scale: size, rot: [0, rand() * 6, 0] }, (g) => {
        g.cyl(0.19, 0.135, 0.24, { color: glaze, seg: 10, layer: 'gloss' });
        g.cyl(0.208, 0.208, 0.04, { color: glaze, at: [0, 0.215, 0], seg: 10, layer: 'gloss' });
        g.cyl(0.17, 0.17, 0.02, { color: PALETTE.earthDeep, at: [0, 0.243, 0], seg: 10 });
        if (plant === 'bush' || plant === 'bloom') {
            g.ball(0.25, { color: '#7dba70', top: '#b2dc98', at: [0, 0.43, 0], scale: [1, 0.82, 1], detail: 1 });
            g.ball(0.15, { color: '#8cc47a', top: '#bfe0a0', at: [0.13, 0.55, 0.05], detail: 1 });
            if (plant === 'bloom') {
                for (let i = 0; i < 7; i += 1) {
                    const a = rand() * Math.PI * 2;
                    const lift = 0.44 + rand() * 0.2;
                    const reach = 0.23 - (lift - 0.44) * 0.5;
                    g.ball(0.05, {
                        color: tone,
                        at: [Math.cos(a) * reach, lift, Math.sin(a) * reach],
                        detail: 0,
                        flat: true,
                    });
                }
            }
        } else if (plant === 'pine') {
            // A bonsai: a bent trunk under two pads of needles.
            g.cyl(0.028, 0.045, 0.34, { color: '#9a6a4c', at: [0.02, 0.24, 0], rot: [0, 0, 0.32], seg: 6 });
            g.ball(0.2, {
                color: PALETTE.pineDeep,
                top: PALETTE.pine,
                at: [-0.1, 0.6, 0],
                scale: [1.25, 0.46, 1.25],
                detail: 1,
            });
            g.ball(0.13, {
                color: PALETTE.pineDeep,
                top: PALETTE.pine,
                at: [0.16, 0.42, 0.06],
                scale: [1.25, 0.46, 1.25],
                detail: 1,
            });
        } else {
            for (let i = 0; i < 6; i += 1) {
                const a = (i / 6) * Math.PI * 2 + rand();
                g.cone(0.028, 0.42 + rand() * 0.28, {
                    color: i % 2 ? '#86bd68' : PALETTE.bamboo,
                    at: [Math.cos(a) * 0.07, 0.24, Math.sin(a) * 0.07],
                    rot: [Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16],
                    seg: 4,
                });
            }
        }
    });
}

/** A long wooden planter full of flowers, its length along X before `turn`. About 0.36 tall. */
export function planter(
    s: Sculpt,
    at: V3,
    length = 0.9,
    turn = 0,
    seed = 1,
    tones: readonly Hex[] = ['#ffffff', '#ffd3df', '#ffe08a'],
): void {
    const rand = seeded(seed * 2909);
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        soft(g, length, 0.2, 0.26, 0.025, { color: PALETTE.wood, top: '#d6a777' });
        g.box(length - 0.07, 0.02, 0.19, { color: PALETTE.earthDeep, at: [0, 0.19, 0], r: 0 });
        for (const x of [-length / 2 + 0.06, length / 2 - 0.06])
            g.box(0.05, 0.22, 0.28, { color: PALETTE.woodDark, at: [x, 0, 0], r: 0 });
        const plants = Math.max(3, Math.round(length / 0.13));
        for (let i = 0; i < plants; i += 1) {
            const x = -length / 2 + 0.1 + ((length - 0.2) * i) / (plants - 1);
            const z = (rand() - 0.5) * 0.1;
            g.cone(0.045, 0.1 + rand() * 0.06, { color: i % 2 ? '#8fc47c' : '#7dba70', at: [x, 0.2, z], seg: 4 });
            if (i % 2 === 0)
                g.ball(0.045, { color: pickOne(rand, tones), at: [x, 0.33 + rand() * 0.03, z], detail: 0, flat: true });
        }
    });
}

/** A broom standing on its bristles, leaning back (towards -Z before `turn`) against a wall. */
export function broom(s: Sculpt, at: V3, turn = 0, lean = 0.2): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        g.group({ rot: [-lean, 0, 0] }, (b) => {
            b.cyl(0.022, 0.022, 1.05, { color: PALETTE.wood, at: [0, 0.24, 0], seg: 5 });
            b.cyl(0.06, 0.15, 0.32, { color: '#dcb96e', top: '#c9a055', seg: 7, scale: [1, 1, 0.5] });
            b.cyl(0.066, 0.066, 0.05, { color: PALETTE.vermilion, at: [0, 0.29, 0], seg: 7, scale: [1, 1, 0.55] });
        });
    });
}

/** A wooden bucket of water with a hoop handle. */
export function bucket(s: Sculpt, at: V3, size = 1): void {
    s.group({ at, scale: size }, (g) => {
        g.cyl(0.14, 0.11, 0.2, { color: PALETTE.wood, top: '#d6a777', seg: 10 });
        g.cyl(0.142, 0.142, 0.025, { color: PALETTE.charcoal, at: [0, 0.045, 0], seg: 10 });
        g.cyl(0.115, 0.115, 0.006, { color: PALETTE.water, at: [0, 0.2, 0], seg: 10, layer: 'gloss' });
        g.tube(
            [
                [-0.13, 0.2, 0],
                [-0.1, 0.32, 0],
                [0, 0.37, 0],
                [0.1, 0.32, 0],
                [0.13, 0.2, 0],
            ],
            0.011,
            { color: PALETTE.charcoal, seg: 8 },
        );
    });
}

/** A stack of split logs, their cut ends facing +Z before `turn`. */
export function woodPile(s: Sculpt, at: V3, turn = 0): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        const rows = [3, 2, 1];
        rows.forEach((logs, row) => {
            for (let i = 0; i < logs; i += 1) {
                const x = (i - (logs - 1) / 2) * 0.175;
                const y = 0.085 + row * 0.15;
                g.cyl(0.085, 0.085, 0.52, {
                    color: row === 1 && i === 0 ? '#a8785a' : '#9a6a4c',
                    at: [x, y, -0.26],
                    rot: [Math.PI / 2, 0, 0],
                    seg: 7,
                });
                g.cyl(0.066, 0.066, 0.006, {
                    color: '#ecd2a6',
                    at: [x, y, 0.259],
                    rot: [Math.PI / 2, 0, 0],
                    seg: 7,
                });
            }
        });
    });
}

/** A small roofed notice on a post, facing +Z before `turn`. About 0.85 tall. */
export function noticeBoard(s: Sculpt, at: V3, turn = 0, paper: Hex = PALETTE.paper): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        g.box(0.06, 0.74, 0.06, { color: PALETTE.woodDark, r: 0 });
        g.box(0.52, 0.36, 0.035, { color: PALETTE.wood, at: [0, 0.4, 0.045], r: 0 });
        g.box(0.42, 0.26, 0.012, { color: paper, at: [0, 0.45, 0.064], r: 0 });
        for (let i = 0; i < 3; i += 1)
            g.box(i === 2 ? 0.18 : 0.3, 0.022, 0.008, {
                color: PALETTE.ink,
                at: [i === 2 ? -0.06 : 0, 0.63 - i * 0.065, 0.071],
                r: 0,
            });
        g.box(0.64, 0.035, 0.16, { color: PALETTE.woodDark, at: [0, 0.78, 0.04], rot: [0.12, 0, 0], r: 0 });
    });
}

/** A stone water basin with a bamboo spout and a ladle: the heart of a small garden. About 0.6 tall. */
export function waterBasin(s: Sculpt, at: V3, size = 1, turn = 0): void {
    s.group({ at, scale: size, rot: [0, turn, 0] }, (g) => {
        g.cyl(0.3, 0.35, 0.3, { color: PALETTE.stoneDark, top: PALETTE.stone, seg: 9, flat: true });
        g.cyl(0.21, 0.21, 0.01, { color: PALETTE.water, at: [0, 0.295, 0], seg: 12, layer: 'gloss' });
        // The spout: a bamboo post and a pipe sloping down to the water.
        g.cyl(0.032, 0.032, 0.58, { color: PALETTE.bamboo, at: [-0.4, 0, -0.1], seg: 6 });
        g.cyl(0.022, 0.022, 0.44, { color: '#a9d67f', at: [-0.42, 0.52, -0.1], rot: [0, 0, -1.9], seg: 6 });
        // The ladle, laid across the rim.
        g.cyl(0.012, 0.012, 0.44, {
            color: PALETTE.wood,
            at: [-0.12, 0.315, 0.2],
            rot: [0, 0.5, -Math.PI / 2],
            seg: 5,
        });
        g.cyl(0.05, 0.045, 0.06, { color: PALETTE.wood, at: [0.26, 0.29, 0.0], seg: 7 });
    });
}

/** A low mound of moss. */
export function mossMound(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 7121);
    s.ball(0.3 * size, {
        color: '#8fc47c',
        top: '#b8de9c',
        at: [at[0], at[1] + 0.02 * size, at[2]],
        scale: [1.1 + rand() * 0.4, 0.34 + rand() * 0.1, 0.9 + rand() * 0.3],
        rot: [0, rand() * 3, 0],
        detail: 1,
    });
}

/** A flat stepping stone. */
export function steppingStone(s: Sculpt, at: V3, size = 1, seed = 1): void {
    const rand = seeded(seed * 5081);
    s.cyl(0.29 * size, 0.33 * size, 0.055, {
        color: rand() > 0.5 ? PALETTE.stone : '#d9d2c6',
        at,
        seg: 7,
        scale: [1 + rand() * 0.25, 1, 0.76 + rand() * 0.2],
        rot: [0, rand() * 3, 0],
        flat: true,
    });
}
