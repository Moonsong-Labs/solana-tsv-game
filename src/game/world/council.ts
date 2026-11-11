/**
 * The council hall: the venue's four role multisigs (emergency, operations,
 * structural, upgrade). Each role has its own signers, threshold and time
 * lock; pool rules, pauses and admissions change only through them.
 *
 * In the town it is a small two-tiered hall on a stone terrace. Each role
 * keeps a standard at the front of the terrace: a banner in its colour with
 * its emblem, a string of vote lanterns beside it and, while its time lock
 * runs, a dial over the pole. The gong at the head of the steps is struck when a
 * proposal executes.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, type Layer, type V3, clamp, damp, ease } from '../scene/kit.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, makeHitbox } from './place.ts';

export type Role = 'emergency' | 'operations' | 'structural' | 'upgrade';
export const ROLES: readonly Role[] = ['emergency', 'operations', 'structural', 'upgrade'];

export interface Council extends Place {
    /**
     * Shows a role's vote: `approved` of its `threshold` lanterns lit. Zero
     * approvals returns the role to rest.
     */
    setVotes(role: Role, approved: number, threshold: number): void;
    /** Shows a role's time lock running: 0 hides it, 0..1 fills it, 1 is elapsed. */
    setTimeLock(role: Role, progress: number): void;
    /** Strikes the gong: a proposal executes. */
    gong(): void;
    anchors: Place['anchors'] & {
        /** The top of each role's banner, where its messages leave from. */
        emergency: THREE.Vector3;
        operations: THREE.Vector3;
        structural: THREE.Vector3;
        upgrade: THREE.Vector3;
        /** The foot of the steps, where signers gather. */
        steps: THREE.Vector3;
        gong: THREE.Vector3;
    };
}

/** Each role's colour, where its pole stands along the terrace front, and the threshold shown before the first vote. */
const ROLE_LOOK: Record<Role, { color: string; x: number; threshold: number }> = {
    emergency: { color: '#e8574a', x: -2.39, threshold: 2 },
    operations: { color: '#4d8fe8', x: -1.405, threshold: 2 },
    structural: { color: '#9471c4', x: 1.405, threshold: 3 },
    upgrade: { color: '#edb94c', x: 2.39, threshold: 3 },
};

/** Vote lanterns built per role; a role shows as many as its threshold. */
const LANTERNS = 5;
/** Segments in a time-lock dial's fill. */
const DIAL_STEPS = 60;

const PLUM_DEEP = '#7657ab';
const PLUM_RIB = '#8a66bb';
const STONE_LIGHT = '#ddd7cc';
const BRONZE = '#e6b04c';
const BRONZE_DEEP = '#c58a36';

/** A plain box without rounded edges: a dozen triangles, for small trim. */
function bar(s: Sculpt, w: number, h: number, d: number, color: string, at: V3, rot?: V3, layer?: Layer): void {
    s.box(w, h, d, { color, at, rot, r: 0, layer });
}

/** A paper screen on a +Z face: a dark frame, a glowing pane and a lattice. `at` is the centre of its bottom edge. */
function paperScreen(s: Sculpt, at: V3, w: number, h: number, columns: number, rows: number): void {
    s.group({ at }, (g) => {
        bar(g, w + 0.1, h + 0.1, 0.06, PALETTE.woodDeep, [0, -0.05, 0]);
        bar(g, w, h, 0.08, PALETTE.windowWarm, [0, 0, 0.005], undefined, 'window');
        for (let i = 1; i < columns; i += 1)
            bar(g, 0.025, h, 0.02, PALETTE.woodDeep, [-w / 2 + (w / columns) * i, 0, 0.045]);
        for (let j = 1; j < rows; j += 1) bar(g, w, 0.025, 0.02, PALETTE.woodDeep, [0, (h / rows) * j - 0.012, 0.045]);
    });
}

/** A small stone lantern for the stair cheeks. */
function cheekLantern(s: Sculpt, at: V3): void {
    s.group({ at }, (g) => {
        g.cyl(0.07, 0.09, 0.24, { color: PALETTE.stone, seg: 8 });
        bar(g, 0.3, 0.05, 0.3, PALETTE.stoneDark, [0, 0.24, 0]);
        bar(g, 0.22, 0.2, 0.22, PALETTE.stone, [0, 0.29, 0]);
        bar(g, 0.15, 0.14, 0.26, PALETTE.windowWarm, [0, 0.32, 0], undefined, 'window');
        bar(g, 0.26, 0.14, 0.15, PALETTE.windowWarm, [0, 0.32, 0], undefined, 'window');
        g.hipRoof(0.46, 0.46, 0.17, { color: PALETTE.stoneDark, at: [0, 0.49, 0], tip: 0.05 });
        g.ball(0.05, { color: PALETTE.stone, at: [0, 0.69, 0], detail: 1 });
    });
}

/** The outline of a hip roof made by `Sculpt.hipRoof`, wider than deep. */
interface HipShape {
    w: number;
    d: number;
    h: number;
    ridge: number;
    tip: number;
}

/** Where a hip roof's corner line is at `t` from the eaves (0) to the top (1): half-width, half-depth, height, and how far the corner is lifted. */
function hipAt(roof: HipShape, t: number): { x: number; z: number; y: number; lift: number } {
    const s = 1 - Math.pow(1 - t, 1.7);
    return {
        x: roof.w / 2 + (roof.ridge / 2 - roof.w / 2) * s,
        z: (roof.d / 2) * (1 - s),
        y: roof.h * t,
        lift: roof.tip * Math.pow(1 - t, 3),
    };
}

/**
 * Dresses a hip roof: ridges down the three corner lines the camera sees,
 * a gold bead on each upturned corner, and rows of tiles down the +Z and +X
 * slopes. `until` is how far up the roof stays visible (1 for the whole roof).
 */
function tileHipRoof(s: Sculpt, at: V3, roof: HipShape, until: number): void {
    const steps = 6;
    s.group({ at }, (g) => {
        for (const [sx, sz] of [
            [1, 1],
            [1, -1],
            [-1, 1],
        ] as const) {
            const line: V3[] = [];
            for (let i = 0; i <= steps; i += 1) {
                const p = hipAt(roof, (until * i) / steps);
                line.push([sx * p.x, p.y + p.lift + 0.03, sz * p.z]);
            }
            g.tube(line, 0.06, { color: PLUM_DEEP, seg: steps * 2, layer: 'gloss' });
            const corner = hipAt(roof, 0);
            g.ball(0.09, {
                color: PALETTE.gold,
                at: [sx * corner.x, corner.lift + 0.04, sz * corner.z],
                detail: 1,
                layer: 'gloss',
            });
        }
        const rows = (half: number, onFront: boolean): void => {
            const count = Math.max(2, Math.round((half * 2 - 0.5) / 0.37));
            for (let n = 0; n <= count; n += 1) {
                const c = -half + 0.25 + ((half * 2 - 0.5) * n) / count;
                const reach = (t: number): number => (onFront ? hipAt(roof, t).x : hipAt(roof, t).z);
                // A row runs up until it meets a corner ridge, or the top.
                let end = until;
                if (reach(until) < Math.abs(c) + 0.05) {
                    let low = 0;
                    for (let i = 0; i < 12; i += 1) {
                        const mid = (low + end) / 2;
                        if (reach(mid) < Math.abs(c) + 0.05) end = mid;
                        else low = mid;
                    }
                }
                if (end < 0.1) continue;
                const line: V3[] = [];
                for (let i = 0; i <= 4; i += 1) {
                    const p = hipAt(roof, (end * i) / 4);
                    const y = p.y + (p.lift * Math.abs(c)) / (onFront ? p.x : p.z) + 0.018;
                    line.push(onFront ? [c, y, p.z] : [p.x, y, c]);
                }
                g.tube(line, 0.034, { color: PLUM_RIB, seg: 6, layer: 'gloss' });
            }
        };
        rows(roof.w / 2, true);
        rows(roof.d / 2, false);
    });
}

/** The emblem on a role's banner, in raised white, centred on `y` and standing `z` proud of the cloth. */
function emblem(s: Sculpt, role: Role, cloth: string, y: number, z: number): void {
    const white = PALETTE.paper;
    const flat = (w: number, h: number, x: number, dy: number, turn = 0, color: string = white): void => {
        s.geo(new THREE.BoxGeometry(w, h, 0.02), { color, at: [x, y + dy, z], rot: [0, 0, turn] });
    };
    if (role === 'emergency') {
        // A pause mark: this role can only pause.
        flat(0.11, 0.34, -0.095, 0);
        flat(0.11, 0.34, 0.095, 0);
    } else if (role === 'operations') {
        // A gear: day-to-day running.
        s.cyl(0.125, 0.125, 0.02, { color: white, at: [0, y, z - 0.01], rot: [Math.PI / 2, 0, 0], seg: 18 });
        for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * Math.PI * 2;
            flat(0.075, 0.09, Math.cos(a) * 0.15, Math.sin(a) * 0.15, a - Math.PI / 2);
        }
        s.cyl(0.055, 0.055, 0.024, { color: cloth, at: [0, y, z - 0.01], rot: [Math.PI / 2, 0, 0], seg: 14 });
    } else if (role === 'structural') {
        // A pillar: the venue's structure.
        flat(0.34, 0.05, 0, 0.165);
        flat(0.24, 0.045, 0, 0.115);
        for (const x of [-0.07, 0, 0.07]) flat(0.045, 0.2, x, -0.005);
        flat(0.24, 0.045, 0, -0.125);
        flat(0.34, 0.05, 0, -0.175);
    } else {
        // An up arrow: program upgrades.
        s.extrude(
            [
                [0, 0.2],
                [-0.18, 0.01],
                [-0.075, 0.01],
                [-0.075, -0.2],
                [0.075, -0.2],
                [0.075, 0.01],
                [0.18, 0.01],
            ],
            0.02,
            { color: white, at: [0, y, z] },
        );
    }
}

/** A flat disc slice that fills clockwise from twelve o'clock as its draw range grows. */
function dialFill(radius: number): THREE.BufferGeometry {
    const positions: number[] = [];
    for (let i = 0; i < DIAL_STEPS; i += 1) {
        const a = Math.PI / 2 - (i / DIAL_STEPS) * Math.PI * 2;
        const b = Math.PI / 2 - ((i + 1) / DIAL_STEPS) * Math.PI * 2;
        positions.push(
            0,
            0,
            0,
            Math.cos(b) * radius,
            Math.sin(b) * radius,
            0,
            Math.cos(a) * radius,
            Math.sin(a) * radius,
            0,
        );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Normals keep the ambient-occlusion pass from reading the fill as a hole.
    geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(
            positions.map((_, i) => (i % 3 === 2 ? 1 : 0)),
            3,
        ),
    );
    geometry.setDrawRange(0, 0);
    return geometry;
}

/** A count from the caller as a whole number, never negative. */
function whole(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** What one role's station remembers between frames. */
interface Station {
    role: Role;
    color: THREE.Color;
    banner: THREE.Group;
    threshold: number;
    approved: number;
    passed: boolean;
    cheerAt: number;
    lanterns: { shown: number; level: number; lit: boolean; popAt: number }[];
    lock: number;
    dial: THREE.Group;
    dialSize: number;
    fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    done: boolean;
    doneAt: number;
}

export function createCouncil(): Council {
    const group = new THREE.Group();
    group.name = 'council';
    group.position.set(SITES.council[0], 0, SITES.council[1]);

    // The terrace, and the hall on it.
    const T = 0.72;
    const TW = 6;
    const TD = 4.2;
    const edge = TD / 2;
    const HW = 3.3;
    const HD = 2.0;
    const HZ = -0.8;
    const FLOOR = T + 0.1;
    const WALL = 2.0;
    const wallTop = FLOOR + WALL;
    const hallFront = HZ + HD / 2;
    const hallSide = HW / 2;
    /** Where the role standards stand, along the terrace front. */
    const SZ = 1.72;

    const s = new Sculpt();

    // ----- Terrace: a base course, the body and a pale coping -----
    s.box(TW, 0.28, TD, { color: PALETTE.stoneDark, r: 0.05 });
    s.box(TW - 0.14, T - 0.08, TD - 0.14, { color: '#c2baae', top: PALETTE.stone, r: 0.04 });
    s.box(TW, 0.1, TD, { color: STONE_LIGHT, at: [0, T - 0.1, 0], r: 0.04 });
    // Joints in the two faces the camera sees.
    for (const x of [-2.2, -1.5, 1.5, 2.2]) bar(s, 0.025, 0.3, 0.02, '#a9a195', [x, 0.3, edge - 0.065]);
    for (const z of [-1.4, -0.7, 0, 0.7, 1.4]) bar(s, 0.02, 0.3, 0.025, '#a9a195', [TW / 2 - 0.065, 0.3, z]);

    // A low rail along the +X edge, beside the hall.
    for (let i = 0; i < 4; i += 1) {
        const z = -1.92 + i * 0.96;
        bar(s, 0.1, 0.5, 0.1, PALETTE.woodDeep, [TW / 2 - 0.16, T, z]);
        bar(s, 0.14, 0.045, 0.14, PALETTE.gold, [TW / 2 - 0.16, T + 0.5, z], undefined, 'gloss');
    }
    for (const y of [0.2, 0.39]) bar(s, 0.05, 0.05, 2.88, PALETTE.woodDark, [TW / 2 - 0.16, T + y, -0.48]);

    // ----- The steps down the +Z side, between two cheeks with lanterns -----
    const stepW = 2.0;
    for (let i = 0; i < 3; i += 1) {
        s.box(stepW, 0.18, 0.9 - i * 0.3, {
            color: i % 2 === 0 ? '#d6cfc3' : STONE_LIGHT,
            at: [0, i * 0.18, edge + (0.9 - i * 0.3) / 2],
            r: 0.03,
        });
    }
    for (const side of [-1, 1]) {
        const x = side * (stepW / 2 + 0.17);
        s.box(0.34, 0.6, 0.9, { color: PALETTE.stoneDark, top: PALETTE.stone, at: [x, 0, edge + 0.45], r: 0.05 });
        bar(s, 0.42, 0.07, 0.94, STONE_LIGHT, [x, 0.6, edge + 0.45]);
        cheekLantern(s, [x, 0.67, edge + 0.64]);
    }

    // ----- The hall: plaster and dark timber, a porch with four columns -----
    s.box(HW + 0.4, 0.1, HD + 0.95, { color: PALETTE.wood, top: '#cc9d70', at: [0, T, HZ + 0.38], r: 0.03 });
    s.box(HW, WALL, HD, { color: PALETTE.plasterShade, top: PALETTE.plaster, at: [0, FLOOR, HZ], r: 0.04 });
    for (const [x, z] of [
        [-hallSide, hallFront],
        [hallSide, hallFront],
        [hallSide, HZ - HD / 2],
    ] as const) {
        s.box(0.18, WALL, 0.18, { color: PALETTE.woodDeep, at: [x, FLOOR, z], r: 0.03 });
    }
    s.box(HW + 0.06, 0.4, HD + 0.06, { color: PALETTE.woodDark, at: [0, FLOOR, HZ], r: 0.03 });
    const columnZ = hallFront + 0.55;
    for (const x of [-1.6, -0.56, 0.56, 1.6]) {
        s.cyl(0.13, 0.15, 0.07, { color: PALETTE.stone, at: [x, FLOOR, columnZ], seg: 12 });
        s.cyl(0.08, 0.09, WALL - 0.07, { color: PALETTE.woodDeep, at: [x, FLOOR + 0.07, columnZ], seg: 12 });
        s.cyl(0.1, 0.1, 0.06, { color: PALETTE.gold, at: [x, wallTop - 0.42, columnZ], seg: 12, layer: 'gloss' });
        bar(s, 0.26, 0.09, 0.26, PALETTE.woodDark, [x, wallTop - 0.25, columnZ]);
    }
    // The beam the roof sits on, around the hall and across the columns.
    const beamD = HD + 0.73;
    const beamZ = HZ + 0.29;
    s.box(HW + 0.26, 0.16, beamD, { color: PALETTE.woodDeep, at: [0, wallTop - 0.16, beamZ], r: 0.03 });

    // Front (+Z): paper screens either side of a pair of paper doors under a short curtain.
    for (const x of [-1.07, 1.07]) paperScreen(s, [x, FLOOR + 0.46, hallFront], 0.8, 1.2, 3, 4);
    bar(s, 1.16, 1.78, 0.07, PALETTE.woodDeep, [0, FLOOR, hallFront]);
    for (const x of [-0.265, 0.265]) paperScreen(s, [x, FLOOR + 0.07, hallFront + 0.01], 0.47, 1.62, 2, 5);
    for (let i = 0; i < 4; i += 1) {
        const x = -0.42 + i * 0.28;
        bar(s, 0.25, 0.3, 0.025, PLUM_DEEP, [x, FLOOR + 1.5, hallFront + 0.09]);
        s.cyl(0.05, 0.05, 0.012, {
            color: PALETTE.gold,
            at: [x, FLOOR + 1.63, hallFront + 0.1],
            rot: [Math.PI / 2, 0, 0],
            seg: 10,
        });
    }
    // Side (+X): two more screens.
    s.group({ at: [hallSide, 0, HZ], rot: [0, Math.PI / 2, 0] }, (g) => {
        for (const x of [-0.46, 0.46]) paperScreen(g, [x, FLOOR + 0.46, 0], 0.7, 1.2, 3, 4);
    });

    // ----- The roofs: a wide lower skirt, a short upper storey with a band of windows, and the top roof -----
    const lower: HipShape = { w: HW + 0.26 + 0.84, d: beamD + 0.84, h: 1.15, ridge: 1.1, tip: 0.3 };
    const lowerY = wallTop + 0.02;
    s.hipRoof(lower.w, lower.d, lower.h, {
        color: PALETTE.roofPlum,
        at: [0, lowerY, beamZ],
        tip: lower.tip,
        ridge: lower.ridge,
        thickness: 0.12,
        layer: 'gloss',
    });
    tileHipRoof(s, [0, lowerY, beamZ], lower, 0.5);

    const UW = 2.2;
    const UD = 1.24;
    const upperY = lowerY + 0.46;
    const upperTop = upperY + 0.78;
    s.box(UW, upperTop - upperY, UD, {
        color: PALETTE.plasterShade,
        top: PALETTE.plaster,
        at: [0, upperY, beamZ],
        r: 0.03,
    });
    bar(s, UW + 0.08, 0.1, UD + 0.08, PALETTE.woodDeep, [0, upperY + 0.14, beamZ]);
    s.box(UW + 0.12, 0.12, UD + 0.12, { color: PALETTE.woodDeep, at: [0, upperTop - 0.12, beamZ], r: 0.02 });
    // The window band glows on the two faces the camera sees.
    bar(s, UW - 0.3, 0.32, 0.05, PALETTE.windowWarm, [0, upperY + 0.28, beamZ + UD / 2], undefined, 'window');
    for (let i = 0; i <= 6; i += 1)
        bar(s, 0.035, 0.34, 0.03, PALETTE.woodDeep, [
            -(UW - 0.3) / 2 + ((UW - 0.3) * i) / 6,
            upperY + 0.27,
            beamZ + UD / 2 + 0.025,
        ]);
    bar(s, 0.05, 0.32, UD - 0.3, PALETTE.windowWarm, [UW / 2, upperY + 0.28, beamZ], undefined, 'window');
    for (let i = 0; i <= 3; i += 1)
        bar(s, 0.03, 0.34, 0.035, PALETTE.woodDeep, [
            UW / 2 + 0.025,
            upperY + 0.27,
            beamZ - (UD - 0.3) / 2 + ((UD - 0.3) * i) / 3,
        ]);

    const upper: HipShape = { w: UW + 1.0, d: UD + 1.0, h: 1.0, ridge: 1.1, tip: 0.26 };
    s.hipRoof(upper.w, upper.d, upper.h, {
        color: PALETTE.roofPlum,
        at: [0, upperTop, beamZ],
        tip: upper.tip,
        ridge: upper.ridge,
        layer: 'gloss',
    });
    tileHipRoof(s, [0, upperTop, beamZ], upper, 1);
    // The ridge: a cap, a gold horn at each end and the council's seal in the middle.
    const ridgeY = upperTop + upper.h;
    s.cyl(0.085, 0.085, upper.ridge + 0.2, {
        color: PLUM_DEEP,
        at: [-(upper.ridge + 0.2) / 2, ridgeY + 0.03, beamZ],
        rot: [0, 0, -Math.PI / 2],
        seg: 10,
        layer: 'gloss',
    });
    for (const side of [-1, 1]) {
        const x = side * (upper.ridge / 2 + 0.06);
        s.tube(
            [
                [x, ridgeY, beamZ],
                [x + side * 0.15, ridgeY + 0.2, beamZ],
                [x + side * 0.08, ridgeY + 0.42, beamZ],
                [x - side * 0.06, ridgeY + 0.5, beamZ],
            ],
            0.055,
            { color: PALETTE.gold, seg: 8, layer: 'gloss' },
        );
    }
    const sealY = ridgeY + 0.36;
    s.cyl(0.05, 0.07, 0.14, { color: PALETTE.gold, at: [0, ridgeY + 0.06, beamZ], seg: 8, layer: 'gloss' });
    s.cyl(0.24, 0.24, 0.07, {
        color: PALETTE.gold,
        at: [0, sealY, beamZ - 0.035],
        rot: [Math.PI / 2, 0, 0],
        seg: 22,
        layer: 'gloss',
    });
    s.cyl(0.19, 0.19, 0.012, {
        color: '#fff3d0',
        at: [0, sealY, beamZ + 0.035],
        rot: [Math.PI / 2, 0, 0],
        seg: 22,
        layer: 'gloss',
    });
    ROLES.forEach((role, i) => {
        // Four dots on the seal, one per role.
        s.cyl(0.055, 0.055, 0.012, {
            color: ROLE_LOOK[role].color,
            at: [(i % 2 === 0 ? -1 : 1) * 0.075, sealY + (i < 2 ? 0.075 : -0.075), beamZ + 0.045],
            rot: [Math.PI / 2, 0, 0],
            seg: 10,
            layer: 'gloss',
        });
    });
    const roofTop = sealY + 0.24;

    // ----- The role standards: a socket, a pole and a crossbar each -----
    const barY = 3.3;
    const poleTop = T + 2.78;
    for (const role of ROLES) {
        const look = ROLE_LOOK[role];
        const out = Math.sign(look.x);
        s.cyl(0.15, 0.19, 0.2, { color: PALETTE.stoneDark, top: PALETTE.stone, at: [look.x, T, SZ], seg: 8 });
        s.cyl(0.04, 0.05, poleTop - T, { color: PALETTE.woodDeep, at: [look.x, T, SZ], seg: 8 });
        s.cyl(0.065, 0.065, 0.1, { color: look.color, at: [look.x, T + 0.42, SZ], seg: 10, layer: 'gloss' });
        s.ball(0.075, { color: PALETTE.gold, at: [look.x, poleTop + 0.05, SZ], detail: 1, layer: 'gloss' });
        // The banner hangs outward of the pole, the lanterns inward.
        const from = look.x - out * 0.3;
        const to = look.x + out * 0.64;
        s.cyl(0.03, 0.03, Math.abs(to - from), {
            color: PALETTE.woodDeep,
            at: [Math.min(from, to), barY, SZ],
            rot: [0, 0, -Math.PI / 2],
            seg: 6,
        });
        for (const x of [from, to])
            s.ball(0.045, { color: PALETTE.gold, at: [x, barY, SZ], detail: 1, layer: 'gloss' });
    }

    // ----- The gong's frame, at the head of the steps. It is modelled facing +X and turned to face the steps. -----
    const GZ = 1.66;
    const beamY = T + 1.9;
    s.group({ at: [0, 0, GZ], rot: [0, -Math.PI / 2, 0] }, (g) => {
        for (const dz of [-0.88, 0.88]) {
            g.box(0.16, 1.92, 0.16, { color: PALETTE.woodDeep, at: [0, T, dz], r: 0.03 });
            bar(g, 0.56, 0.12, 0.22, PALETTE.woodDeep, [0, T, dz]);
            bar(g, 0.2, 0.08, 0.2, PALETTE.gold, [0, T + 0.3, dz], undefined, 'gloss');
        }
        g.box(0.2, 0.2, 2.0, { color: PALETTE.woodDeep, at: [0, beamY, 0], r: 0.04 });
        g.box(0.3, 0.1, 2.08, { color: PALETTE.woodDark, at: [0, beamY + 0.2, 0], r: 0.03 });
        for (const dz of [-1.04, 1.04])
            bar(g, 0.34, 0.14, 0.08, PALETTE.gold, [0, beamY + 0.18, dz], undefined, 'gloss');
        // The arm the mallet hangs from.
        bar(g, 0.34, 0.07, 0.08, PALETTE.woodDeep, [0.2, beamY - 0.1, 0]);
        g.ball(0.05, { color: PALETTE.gold, at: [0.37, beamY - 0.065, 0], detail: 1, layer: 'gloss' });
    });

    group.add(s.build('council'));

    // ----- The gong: it hangs from the beam and swings about it -----
    const DROP = 0.98;
    const gongBody = new Sculpt();
    for (const dz of [-0.26, 0.26])
        gongBody.cyl(0.014, 0.014, 0.4, { color: PALETTE.woodDeep, at: [0, -0.4, dz], seg: 5, layer: 'gloss' });
    gongBody.cyl(0.66, 0.66, 0.08, {
        color: BRONZE,
        at: [-0.04, -DROP, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 36,
        layer: 'gloss',
    });
    gongBody.torus(0.65, 0.055, {
        color: BRONZE_DEEP,
        at: [0, -DROP, 0],
        rot: [0, 0, Math.PI / 2],
        seg: 36,
        layer: 'gloss',
    });
    gongBody.cyl(0.44, 0.44, 0.012, {
        color: BRONZE_DEEP,
        at: [0.04, -DROP, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 32,
        layer: 'gloss',
    });
    gongBody.cyl(0.4, 0.4, 0.014, {
        color: '#efbf5c',
        at: [0.044, -DROP, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 32,
        layer: 'gloss',
    });
    gongBody.ball(0.2, { color: '#f8d878', at: [0.05, -DROP, 0], scale: [0.5, 1, 1], detail: 2, layer: 'gloss' });
    const rig = new THREE.Group();
    rig.name = 'gong-rig';
    rig.position.set(0, 0, GZ);
    rig.rotation.y = -Math.PI / 2;
    group.add(rig);
    const gongNode = gongBody.build('gong');
    gongNode.position.set(0, beamY, 0);
    rig.add(gongNode);

    const malletBody = new Sculpt();
    malletBody.cyl(0.022, 0.022, DROP - 0.1, { color: PALETTE.wood, at: [0, -(DROP - 0.1), 0], seg: 6 });
    malletBody.cyl(0.125, 0.125, 0.26, {
        color: '#f6ead6',
        at: [-0.15, -(DROP - 0.1), 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 14,
    });
    for (const x of [-0.13, 0.07])
        malletBody.cyl(0.132, 0.132, 0.05, {
            color: PLUM_DEEP,
            at: [x, -(DROP - 0.1), 0],
            rot: [0, 0, -Math.PI / 2],
            seg: 14,
        });
    const mallet = malletBody.build('mallet');
    mallet.position.set(0.32, beamY - 0.07, 0);
    rig.add(mallet);

    // Rings of sound that leave the gong when it is struck.
    const waveGeometry = new THREE.TorusGeometry(0.5, 0.022, 6, 44);
    const waves = [0, 1].map(() => {
        const material = new THREE.MeshBasicMaterial({
            color: '#fff0c0',
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(waveGeometry, material);
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(0.2, beamY - DROP, 0);
        mesh.visible = false;
        rig.add(mesh);
        return { mesh, material };
    });

    // ----- The vote lanterns: one shape drawn twenty times, each with its own colour -----
    const lanternShape = new Sculpt();
    lanternShape.lathe(
        [
            [0.04, 0],
            [0.098, 0.04],
            [0.115, 0.115],
            [0.098, 0.19],
            [0.04, 0.23],
        ],
        { color: '#ffffff', at: [0, -0.115, 0], seg: 12, layer: 'lit' },
    );
    for (const y of [-0.137, 0.109])
        lanternShape.cyl(0.054, 0.054, 0.028, { color: '#6e6a66', at: [0, y, 0], seg: 8, layer: 'lit' });
    lanternShape.cyl(0.008, 0.008, 0.07, { color: '#6e6a66', at: [0, 0.135, 0], seg: 4, layer: 'lit' });
    const lanternMesh = lanternShape.build().children[0] as THREE.Mesh;
    const lanterns = new THREE.InstancedMesh(
        lanternMesh.geometry,
        new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
        ROLES.length * LANTERNS,
    );
    lanterns.name = 'vote-lanterns';
    lanterns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The lanterns move every frame, so the fixed bounds would be wrong.
    lanterns.frustumCulled = false;
    group.add(lanterns);

    // ----- The time-lock dials: one face and one tick, each drawn once for all four roles -----
    const faceShape = new Sculpt();
    faceShape.cyl(0.34, 0.34, 0.05, {
        color: PALETTE.gold,
        at: [0, 0, -0.03],
        rot: [Math.PI / 2, 0, 0],
        seg: 30,
        layer: 'gloss',
    });
    faceShape.cyl(0.285, 0.285, 0.014, {
        color: PALETTE.paper,
        at: [0, 0, 0.018],
        rot: [Math.PI / 2, 0, 0],
        seg: 30,
        layer: 'gloss',
    });
    for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        faceShape.geo(new THREE.BoxGeometry(0.02, i % 3 === 0 ? 0.07 : 0.04, 0.01), {
            color: PALETTE.woodDeep,
            at: [Math.sin(a) * 0.312, Math.cos(a) * 0.312, 0.022],
            rot: [0, 0, -a],
            layer: 'gloss',
        });
    }
    const faceMesh = faceShape.build().children[0] as THREE.Mesh;
    const dialFaces = new THREE.InstancedMesh(faceMesh.geometry, faceMesh.material, ROLES.length);
    dialFaces.name = 'timelock-faces';
    dialFaces.castShadow = true;
    dialFaces.receiveShadow = true;
    const tickShape = new Sculpt();
    tickShape.geo(new THREE.BoxGeometry(0.06, 0.16, 0.012), {
        color: '#ffffff',
        at: [-0.08, -0.035, 0.05],
        rot: [0, 0, Math.PI / 4],
        layer: 'lit',
    });
    tickShape.geo(new THREE.BoxGeometry(0.06, 0.31, 0.012), {
        color: '#ffffff',
        at: [0.062, 0.035, 0.05],
        rot: [0, 0, -Math.PI / 5],
        layer: 'lit',
    });
    const tickMesh = tickShape.build().children[0] as THREE.Mesh;
    const dialTicks = new THREE.InstancedMesh(tickMesh.geometry, tickMesh.material, ROLES.length);
    dialTicks.name = 'timelock-ticks';
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const dials of [dialFaces, dialTicks]) {
        dials.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        dials.frustumCulled = false;
        dials.visible = false;
        ROLES.forEach((_, i) => dials.setMatrixAt(i, hidden));
        group.add(dials);
    }

    // ----- Per role: the banner, and the fill of its time-lock dial over the pole -----
    const stations = {} as Record<Role, Station>;
    for (const role of ROLES) {
        const look = ROLE_LOOK[role];
        const out = Math.sign(look.x);
        const color = new THREE.Color(look.color);
        const shade = `#${color.clone().multiplyScalar(0.8).getHexString()}`;

        const cloth = new Sculpt();
        cloth.extrude(
            [
                [-0.26, 0],
                [-0.26, -1.5],
                [0, -1.3],
                [0.26, -1.5],
                [0.26, 0],
            ],
            0.036,
            { color: shade, top: look.color, bevel: 0.008 },
        );
        for (const x of [-0.18, 0, 0.18]) bar(cloth, 0.07, 0.1, 0.05, shade, [x, -0.03, 0]);
        bar(cloth, 0.52, 0.04, 0.042, PALETTE.paper, [0, -0.2, 0]);
        bar(cloth, 0.52, 0.04, 0.042, PALETTE.paper, [0, -1.16, 0]);
        emblem(cloth, role, look.color, -0.68, 0.028);
        const banner = cloth.build(`banner-${role}`);
        banner.position.set(look.x + out * 0.35, barY - 0.035, SZ);
        group.add(banner);

        const dial = new THREE.Group();
        dial.name = `timelock-${role}`;
        const fill = new THREE.Mesh(
            dialFill(0.27),
            new THREE.MeshBasicMaterial({ color: look.color, toneMapped: true }),
        );
        fill.position.z = 0.036;
        dial.add(fill);
        // The camera never turns, so the dial can face it squarely.
        dial.rotation.order = 'YXZ';
        dial.rotation.set(-0.3, Math.PI / 4, 0);
        dial.position.set(look.x, poleTop + 0.48, SZ);
        dial.scale.setScalar(0);
        dial.visible = false;
        group.add(dial);

        stations[role] = {
            role,
            color,
            banner,
            threshold: look.threshold,
            approved: 0,
            passed: false,
            cheerAt: -100,
            lanterns: Array.from({ length: LANTERNS }, (_, i) => ({
                shown: i < look.threshold ? 1 : 0,
                level: 0,
                lit: false,
                popAt: -100,
            })),
            lock: 0,
            dial,
            dialSize: 0,
            fill,
            done: false,
            doneAt: -100,
        };
    }

    const hitbox = makeHitbox(TW, roofTop, TD + 0.9, [0, 0, 0.45]);
    group.add(hitbox);

    let now = 0;
    let gongAt = -100;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    const anchors = {
        label: anchor(group, 0, roofTop + 0.35, beamZ),
        // The hall's door is up on the terrace; on the ground, the way in is the foot of the steps.
        door: anchor(group, 0, 0, edge + 1.2),
        steps: anchor(group, 0, 0, edge + 1.3),
        porch: anchor(group, 0, T, 1.25),
        gong: anchor(group, 0, beamY - DROP, GZ + 0.1),
        emergency: anchor(group, ROLE_LOOK.emergency.x, poleTop + 0.14, SZ),
        operations: anchor(group, ROLE_LOOK.operations.x, poleTop + 0.14, SZ),
        structural: anchor(group, ROLE_LOOK.structural.x, poleTop + 0.14, SZ),
        upgrade: anchor(group, ROLE_LOOK.upgrade.x, poleTop + 0.14, SZ),
    };

    return {
        group,
        hitbox,
        anchors,
        setVotes(role, approved, threshold) {
            const station = stations[role];
            const needed = whole(threshold);
            const given = Math.min(whole(approved), needed);
            const passed = needed > 0 && given >= needed;
            station.threshold = Math.min(needed, LANTERNS);
            // A threshold above the lanterns built still lights the last one only when the vote passes.
            station.approved =
                needed <= LANTERNS || passed
                    ? Math.min(given, LANTERNS)
                    : Math.min(Math.floor((given * LANTERNS) / needed), LANTERNS - 1);
            if (passed && !station.passed) station.cheerAt = now;
            station.passed = passed;
        },
        setTimeLock(role, progress) {
            const station = stations[role];
            station.lock = Number.isFinite(progress) ? clamp(progress) : 0;
            const done = station.lock >= 1;
            if (done && !station.done) station.doneAt = now;
            station.done = done;
        },
        gong() {
            gongAt = now;
        },
        update(dt, time) {
            now = time;

            ROLES.forEach((role, r) => {
                const station = stations[role];
                const look = ROLE_LOOK[role];
                const out = Math.sign(look.x);
                const cheer = time - station.cheerAt;
                const cheering = cheer >= 0 && cheer < 1.6;

                // The banner sways; a vote that passes makes it pop and flap.
                const sway = Math.sin(time * 1.1 + r * 1.7) * 0.03;
                const swell = cheering ? Math.exp(-cheer * 3.6) * Math.sin(cheer * 18) * 0.3 : 0;
                const flap = cheering ? Math.exp(-cheer * 2.4) * Math.sin(cheer * 10) * 0.4 : 0;
                station.banner.rotation.set(sway + flap, 0, Math.sin(time * 0.8 + r) * 0.012);
                station.banner.scale.setScalar(1 + swell);

                // The lanterns: as many as the threshold, the approved ones lit.
                station.lanterns.forEach((lantern, i) => {
                    const lit = i < station.approved;
                    if (lit && !lantern.lit) lantern.popAt = time;
                    lantern.lit = lit;
                    lantern.shown = damp(lantern.shown, i < station.threshold ? 1 : 0, 12, dt);
                    lantern.level = damp(lantern.level, lit ? 1 : 0, 9, dt);
                    const pop = time - lantern.popAt;
                    let size =
                        lantern.shown * (1 + (pop >= 0 && pop < 0.45 ? Math.sin((pop / 0.45) * Math.PI) * 0.4 : 0));
                    let glow = lantern.level * (station.passed ? 1.12 + Math.sin(time * 3 + i) * 0.1 : 1);
                    if (cheering && lit) {
                        const ripple = 0.5 + 0.5 * Math.sin(cheer * 20 - i * 1.3);
                        glow += Math.exp(-cheer * 2) * ripple * 0.9;
                        size *= 1 + Math.exp(-cheer * 3) * ripple * 0.3;
                    }
                    dummy.position.set(look.x - out * 0.21, barY - 0.25 - i * 0.3, SZ);
                    dummy.rotation.set(0, 0, Math.sin(time * 1.4 + r * 2 + i * 0.6) * 0.05);
                    dummy.scale.setScalar(Math.max(size, 0.0001));
                    dummy.updateMatrix();
                    const index = r * LANTERNS + i;
                    lanterns.setMatrixAt(index, dummy.matrix);
                    // The same law as the kit's lamps: off is a dull tint, lit is bright.
                    lanterns.setColorAt(index, tint.copy(station.color).multiplyScalar(0.28 + glow * 1.1));
                });

                // The time lock: the dial appears, fills clockwise, and shows a tick when it has elapsed.
                station.dialSize = damp(station.dialSize, station.lock > 0 ? 1 : 0, 10, dt);
                station.dial.visible = station.dialSize > 0.01;
                if (station.dial.visible) {
                    const done = time - station.doneAt;
                    const bump = station.done && done < 0.5 ? Math.sin((done / 0.5) * Math.PI) * 0.3 : 0;
                    station.dial.scale.setScalar(station.dialSize * (1 + bump));
                    station.dial.rotation.z = station.done ? 0 : Math.sin(time * 5) * 0.035;
                    station.fill.geometry.setDrawRange(0, Math.round(station.lock * DIAL_STEPS) * 3);
                    station.fill.material.color
                        .copy(station.color)
                        .multiplyScalar(station.done ? 1.25 + Math.sin(time * 4) * 0.2 : 1.05);
                    station.dial.updateMatrix();
                }
                dialFaces.setMatrixAt(r, station.dial.visible ? station.dial.matrix : hidden);
                dialTicks.setMatrixAt(r, station.dial.visible && station.done ? station.dial.matrix : hidden);
            });
            lanterns.instanceMatrix.needsUpdate = true;
            if (lanterns.instanceColor) lanterns.instanceColor.needsUpdate = true;
            dialFaces.visible = ROLES.some((role) => stations[role].dial.visible);
            dialTicks.visible = ROLES.some((role) => stations[role].dial.visible && stations[role].done);
            dialFaces.instanceMatrix.needsUpdate = true;
            dialTicks.instanceMatrix.needsUpdate = true;

            // The gong: the mallet draws back and strikes; the gong swings and shivers, and the mallet bounces off it.
            const g = time - gongAt;
            let malletAngle = 0.05 + Math.sin(time * 0.9) * 0.012;
            let swing = 0;
            let shiver = 0;
            let ring = -1;
            if (g >= 0 && g < 2.4) {
                if (g < 0.32) malletAngle = 0.05 + ease.out(g / 0.32) * 0.85;
                else if (g < 0.46) malletAngle = 0.9 - ease.in((g - 0.32) / 0.14) * 0.92;
                else {
                    ring = g - 0.46;
                    malletAngle =
                        0.05 +
                        0.5 * Math.exp(-2.6 * ring) * Math.abs(Math.sin(ring * 5.2)) -
                        0.07 * Math.exp(-8 * ring);
                    swing = -0.2 * Math.exp(-1.7 * ring) * Math.sin(ring * 7.5);
                    shiver = Math.exp(-3 * ring);
                    malletAngle = Math.max(malletAngle, swing);
                }
            }
            mallet.rotation.z = malletAngle;
            gongNode.rotation.set(shiver * 0.05 * Math.sin(ring * 70), 0, swing);
            gongNode.scale.set(
                1,
                1 + shiver * 0.035 * Math.sin(ring * 55),
                1 + shiver * 0.035 * Math.sin(ring * 55 + 1.6),
            );
            waves.forEach((wave, i) => {
                const k = (ring - i * 0.2) / 0.8;
                wave.mesh.visible = ring >= 0 && k >= 0 && k < 1;
                if (!wave.mesh.visible) return;
                wave.mesh.scale.setScalar(0.5 + ease.out(k) * 1.5);
                wave.material.opacity = (1 - k) * (1 - k) * 0.8;
            });
        },
    };
}
