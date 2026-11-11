/**
 * The issuer's mint house: where the stock (Test Stock A) is created and
 * minted. The issuer keeps its own powers over the token: mint, freeze
 * (through Token ACL), pause and recovery.
 *
 * In the town it is an artisan mint: a plaster-and-timber workshop under a
 * coral roof, a brick furnace whose chimney puffs, and a screw press in the
 * yard that stamps out pink share tokens. The giant token turning on the
 * roof says what is made here.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { PALETTE, Sculpt, type V3, clamp, ease, gableHeight, makeSign, seeded } from '../scene/kit.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, gabledRoof, makeHitbox, noren } from './place.ts';

export interface Issuer extends Place {
    /** Plays the mint press: the press slams and the chimney puffs. Used when stock is created, minted, thawed or recovered. */
    press(): void;
    anchors: Place['anchors'] & {
        /** Where minted tokens pop out, above the hatch. */
        output: THREE.Vector3;
        chimney: THREE.Vector3;
    };
}

// A few tones beside the palette: brick, copper, brass and iron.
const BRICK = '#cf7f63';
const BRICK_DEEP = '#b9684f';
const MORTAR = '#e6b39b';
const COPPER = '#d98e5c';
const VERDIGRIS = '#8fcdb4';
const BRASS = '#e7b853';
const IRON = '#5d5866';
const CORAL_DEEP = '#d8604f';

/** How far the ram travels from rest down to the die. */
const STROKE = 0.4;
/** How long one press lasts, in seconds. */
const PRESS_TIME = 1.15;
/** When the ram hits the die, in seconds after `press()`. */
const IMPACT = 0.38;
/** When the chimney puffs, in seconds after `press()`. */
const PUFF_TIMES = [0.42, 0.63, 0.86] as const;

/** A plain box without rounded edges: a dozen triangles, for small trim. */
function bar(
    s: Sculpt,
    w: number,
    h: number,
    d: number,
    color: string,
    at: V3,
    rot?: V3,
    layer?: 'solid' | 'gloss' | 'window' | 'lit',
): void {
    s.box(w, h, d, { color, at, rot, r: 0, layer });
}

/**
 * A share token: a small rounded pink cube standing on `at`. `frozen` adds
 * the cap of frost every new stock account starts with.
 */
function shareToken(s: Sculpt, at: V3, size: number, turn = 0, frozen = false): void {
    s.group({ at, rot: [0, turn, 0] }, (g) => {
        g.geo(
            new RoundedBoxGeometry(size, size, size, 1, size * 0.2),
            { color: PALETTE.stock, top: '#f995a8', layer: 'gloss' },
            size / 2,
        );
        if (!frozen) return;
        g.geo(
            new RoundedBoxGeometry(size * 1.1, size * 0.3, size * 1.1, 1, size * 0.13),
            { color: PALETTE.ice, top: '#eefaff', layer: 'gloss', at: [0, size * 0.8, 0] },
            size * 0.15,
        );
        const drips: ReadonlyArray<readonly [number, number, number]> = [
            [0.36, 0.55, 0.3],
            [-0.22, 0.55, 0.2],
            [0.55, 0.3, 0.26],
            [0.55, -0.24, 0.18],
        ];
        for (const [x, z, length] of drips) {
            g.cone(size * 0.075, size * length, {
                color: PALETTE.ice,
                at: [x * size, size * 0.84, z * size],
                rot: [Math.PI, 0, 0],
                seg: 5,
                layer: 'gloss',
            });
        }
    });
}

/** A paper-screen window on a +Z face, lighter than the shared one. `at` is the centre of its bottom edge. */
function paperWindow(s: Sculpt, at: V3, w: number, h: number, columns: number, rows: number): void {
    s.group({ at }, (g) => {
        g.box(w + 0.14, h + 0.14, 0.08, { color: PALETTE.woodDark, at: [0, -0.07, 0], r: 0.03 });
        bar(g, w, h, 0.1, PALETTE.windowWarm, [0, 0, 0.005], undefined, 'window');
        for (let i = 1; i < columns; i += 1)
            bar(g, 0.03, h, 0.03, PALETTE.woodDark, [-w / 2 + (w / columns) * i, 0, 0.055]);
        for (let j = 1; j < rows; j += 1) bar(g, w, 0.03, 0.03, PALETTE.woodDark, [0, (h / rows) * j - 0.015, 0.055]);
    });
}

/** A barrel standing on `at`. */
function barrel(s: Sculpt, at: V3, size = 1): void {
    s.group({ at, scale: size }, (g) => {
        g.lathe(
            [
                [0.19, 0],
                [0.25, 0.14],
                [0.265, 0.3],
                [0.25, 0.46],
                [0.19, 0.6],
            ],
            { color: PALETTE.wood, top: '#cf9f72', seg: 14 },
        );
        g.cyl(0.19, 0.19, 0.03, { color: PALETTE.woodDark, at: [0, 0.565, 0], seg: 14 });
        for (const y of [0.13, 0.44]) g.cyl(0.262, 0.262, 0.05, { color: IRON, at: [0, y, 0], seg: 14 });
    });
}

/** The ram's height above its rest position `t` seconds into a press: wind up, slam, hold, rise. */
function ramOffset(t: number): number {
    if (t < 0 || t >= PRESS_TIME) return 0;
    if (t < 0.26) return ease.out(t / 0.26) * 0.12;
    if (t < IMPACT) return 0.12 - ease.in((t - 0.26) / (IMPACT - 0.26)) * (0.12 + STROKE);
    if (t < 0.56) return -STROKE;
    return -STROKE + ease.outBack(clamp((t - 0.56) / 0.5)) * STROKE;
}

export function createIssuer(): Issuer {
    const group = new THREE.Group();
    group.name = 'issuer';
    group.position.set(SITES.issuer[0], 0, SITES.issuer[1]);

    // The workshop stands at the back left; the press yard wraps its +X side.
    const HX = -0.65;
    const HZ = -0.55;
    const W = 2.6;
    const D = 2.4;
    const BASE = 0.22;
    const WALL = 2.3;
    const top = BASE + WALL;
    const front = HZ + D / 2;
    const side = HX + W / 2;

    const s = new Sculpt();

    // ----- Ground: foundation, the yard's flagstones, the door step -----
    s.box(W + 0.4, BASE, D + 0.4, { color: PALETTE.stone, at: [HX, 0, HZ], r: 0.06 });
    s.box(1.5, 0.07, 2.95, { color: '#ddd5c7', at: [1.46, 0, -0.42], r: 0.03 });
    s.box(1.3, 0.12, 0.5, { color: PALETTE.stoneDark, at: [-0.05, 0, front + 0.36], r: 0.04 });
    s.box(1.05, 0.05, 0.62, { color: PALETTE.path, at: [-0.05, 0, front + 0.86], r: 0.02 });

    // ----- Walls and timber -----
    s.box(W, WALL, D, { color: PALETTE.plasterShade, top: PALETTE.plaster, at: [HX, BASE, HZ], r: 0.04 });
    for (const [x, z] of [
        [HX - W / 2, front],
        [side, front],
        [side, HZ - D / 2],
    ] as const) {
        s.box(0.2, WALL, 0.2, { color: PALETTE.woodDark, at: [x, BASE, z], r: 0.04 });
    }
    s.box(W + 0.06, 0.46, D + 0.06, { color: PALETTE.wood, at: [HX, BASE, HZ], r: 0.04 });
    s.box(W + 0.1, 0.14, D + 0.1, { color: PALETTE.woodDark, at: [HX, top - 0.14, HZ], r: 0.03 });
    // A post between the shop window and the door, and a brace on each side wall panel.
    bar(s, 0.12, WALL - 0.14, 0.08, PALETTE.woodDark, [-0.66, BASE, front + 0.01]);
    bar(s, 0.08, WALL - 0.6, 0.1, PALETTE.woodDark, [side + 0.01, BASE + 0.46, HZ - 0.72]);

    // ----- Front (+Z): the shop window with its counter, and the door -----
    const windowX = -1.3;
    paperWindow(s, [windowX, BASE + 0.96, front], 0.92, 0.74, 3, 2);
    s.box(1.16, 0.09, 0.44, { color: PALETTE.wood, at: [windowX, BASE + 0.76, front + 0.2], r: 0.03 });
    for (const dx of [-0.42, 0.42]) {
        // A wedge under each end of the counter.
        s.extrude(
            [
                [0, 0],
                [0, -0.3],
                [0.32, 0],
            ],
            0.07,
            { color: PALETTE.woodDark, at: [windowX + dx, BASE + 0.77, front + 0.03], rot: [0, -Math.PI / 2, 0] },
        );
    }
    s.box(1.2, 0.07, 0.54, {
        color: PALETTE.roofCoral,
        at: [windowX, BASE + 1.9, front + 0.24],
        rot: [0.34, 0, 0],
        r: 0.03,
        layer: 'gloss',
    });
    // Tokens on the counter: fresh ones start frozen.
    shareToken(s, [windowX - 0.3, BASE + 0.85, front + 0.22], 0.2, 0.2);
    shareToken(s, [windowX - 0.3, BASE + 1.05, front + 0.22], 0.2, -0.25, true);
    shareToken(s, [windowX - 0.02, BASE + 0.85, front + 0.25], 0.2, -0.1);
    shareToken(s, [windowX + 0.3, BASE + 0.85, front + 0.21], 0.2, 0.45, true);

    const doorX = -0.05;
    s.box(1.0, 1.68, 0.08, { color: PALETTE.woodDark, at: [doorX, BASE, front], r: 0.03 });
    // A split door: planks below, a warm paper pane above.
    s.box(0.86, 0.74, 0.1, { color: PALETTE.wood, top: '#cc9d70', at: [doorX, BASE + 0.05, front + 0.01], r: 0.02 });
    for (const dx of [-0.215, 0, 0.215])
        bar(s, 0.02, 0.7, 0.02, PALETTE.woodDark, [doorX + dx, BASE + 0.07, front + 0.055]);
    bar(s, 0.86, 0.78, 0.1, PALETTE.windowWarm, [doorX, BASE + 0.82, front + 0.005], undefined, 'window');
    bar(s, 0.03, 0.78, 0.03, PALETTE.woodDark, [doorX, BASE + 0.82, front + 0.055]);
    bar(s, 0.86, 0.03, 0.03, PALETTE.woodDark, [doorX, BASE + 1.2, front + 0.055]);
    s.ball(0.045, { color: BRASS, at: [doorX + 0.3, BASE + 0.5, front + 0.07], detail: 1, layer: 'gloss' });
    noren(s, [doorX, BASE + 1.76, front + 0.04], 1.02, 0.42, PALETTE.roofCoral, 3, '#ffd9cf');

    // A round window in the gable.
    s.cyl(0.29, 0.29, 0.06, {
        color: PALETTE.woodDark,
        at: [HX, top + 0.36, front - 0.01],
        rot: [Math.PI / 2, 0, 0],
        seg: 20,
    });
    s.cyl(0.22, 0.22, 0.08, {
        color: PALETTE.windowWarm,
        at: [HX, top + 0.36, front - 0.01],
        rot: [Math.PI / 2, 0, 0],
        seg: 20,
        layer: 'window',
    });
    bar(s, 0.44, 0.03, 0.03, PALETTE.woodDark, [HX, top + 0.345, front + 0.06]);
    bar(s, 0.03, 0.44, 0.03, PALETTE.woodDark, [HX, top + 0.14, front + 0.06]);

    // The lantern on the post between the window and the door.
    const lampX = -0.66;
    bar(s, 0.06, 0.06, 0.5, PALETTE.woodDark, [lampX, BASE + 1.84, front + 0.27]);
    s.cyl(0.012, 0.012, 0.1, { color: PALETTE.ink, at: [lampX, BASE + 1.74, front + 0.46], seg: 5 });
    s.lathe(
        [
            [0.05, 0],
            [0.15, 0.06],
            [0.17, 0.19],
            [0.15, 0.32],
            [0.05, 0.38],
        ],
        { color: PALETTE.lantern, at: [lampX, BASE + 1.37, front + 0.46], layer: 'window', seg: 14 },
    );
    for (const y of [1.35, 1.74])
        s.cyl(0.065, 0.065, 0.035, { color: CORAL_DEEP, at: [lampX, BASE + y, front + 0.46], seg: 10 });

    // ----- Side (+X): a high window over the press -----
    s.group({ at: [side, 0, HZ], rot: [0, Math.PI / 2, 0] }, (g) => {
        paperWindow(g, [-0.42, BASE + 1.3, 0], 1.0, 0.56, 3, 1);
    });

    // ----- The roof: ridge along Z, so a gable faces the path and a tiled slope faces the yard -----
    const RISE = 1.35;
    const OVERHANG = 0.35;
    const EAVE = 0.3;
    const THICK = 0.15;
    const roofW = W + OVERHANG * 2;
    const roofBase = top + THICK - gableHeight(roofW, RISE, W / 2);
    gabledRoof(s, {
        at: [HX, top, HZ],
        span: W,
        length: D,
        rise: RISE,
        color: PALETTE.roofCoral,
        wall: PALETTE.plaster,
        overhang: OVERHANG,
        eave: EAVE,
        thickness: THICK,
        ridge: CORAL_DEEP,
    });
    const ridgeY = roofBase + RISE;
    // Rows of round tiles down the slope the camera sees, each ending in a pale cap at the eave.
    const roofLength = D + EAVE * 2;
    const ribs = 9;
    for (let i = 0; i < ribs; i += 1) {
        const z = HZ - roofLength / 2 + 0.16 + ((roofLength - 0.32) * i) / (ribs - 1);
        const line: V3[] = [0.13, 0.5, 0.9, 1.3, roofW / 2 - 0.01].map((x) => [
            HX + x,
            roofBase + gableHeight(roofW, RISE, x) + 0.012,
            z,
        ]);
        s.tube(line, 0.042, { color: '#e56f5f', seg: 6, layer: 'gloss' });
        s.cyl(0.06, 0.06, 0.05, {
            color: '#f9a898',
            at: [HX + roofW / 2 - 0.03, roofBase + 0.012, z],
            rot: [0, 0, -Math.PI / 2],
            seg: 8,
            layer: 'gloss',
        });
    }

    // The board the MINT sign is painted on, standing on the eave over the press.
    const signX = HX + roofW / 2 - 0.16;
    const signY = roofBase + gableHeight(roofW, RISE, roofW / 2 - 0.16);
    const signZ = HZ + 0.5;
    s.box(0.07, 0.64, 1.84, { color: PALETTE.woodDark, at: [signX, signY - 0.03, signZ], r: 0.025 });
    for (const dz of [-0.6, 0.6])
        bar(s, 0.3, 0.06, 0.07, PALETTE.woodDark, [signX - 0.14, signY + 0.3, signZ + dz], [0, 0, 0.75]);

    // ----- The furnace and its chimney, behind the press -----
    const FX = 1.22;
    const FZ = -1.3;
    s.box(1.0, 1.02, 0.95, { color: BRICK_DEEP, top: BRICK, at: [FX, 0.06, FZ], r: 0.06 });
    s.box(1.1, 0.1, 1.05, { color: PALETTE.stone, at: [FX, 1.06, FZ], r: 0.03 });
    // The fire mouth: an arch on the +X face, always aglow.
    s.group({ at: [FX + 0.5, 0, FZ], rot: [0, Math.PI / 2, 0] }, (g) => {
        g.cyl(0.27, 0.27, 0.05, { color: PALETTE.charcoal, at: [0, 0.56, -0.02], rot: [Math.PI / 2, 0, 0], seg: 18 });
        bar(g, 0.54, 0.4, 0.05, PALETTE.charcoal, [0, 0.16, 0.005]);
        g.cyl(0.2, 0.2, 0.05, {
            color: '#ff8f45',
            at: [0, 0.56, -0.01],
            rot: [Math.PI / 2, 0, 0],
            seg: 18,
            layer: 'lit',
        });
        bar(g, 0.4, 0.36, 0.05, '#ff8f45', [0, 0.2, 0.015], undefined, 'lit');
        g.cyl(0.13, 0.13, 0.05, {
            color: '#ffd67a',
            at: [0, 0.42, 0],
            rot: [Math.PI / 2, 0, 0],
            seg: 14,
            layer: 'lit',
        });
        bar(g, 0.62, 0.06, 0.12, PALETTE.stoneDark, [0, 0.1, 0.03]);
    });
    const stackX = FX + 0.04;
    const stackTop = 4.0;
    s.box(0.5, stackTop - 1.1, 0.5, { color: BRICK, top: BRICK_DEEP, at: [stackX, 1.1, FZ], r: 0.04 });
    for (let i = 0; i < 6; i += 1) bar(s, 0.53, 0.035, 0.53, MORTAR, [stackX, 1.5 + i * 0.44, FZ]);
    s.box(0.68, 0.13, 0.68, { color: PALETTE.stone, at: [stackX, stackTop, FZ], r: 0.04 });
    s.cyl(0.17, 0.21, 0.3, { color: COPPER, at: [stackX, stackTop + 0.13, FZ], seg: 14, layer: 'gloss' });
    s.cyl(0.2, 0.2, 0.05, { color: VERDIGRIS, at: [stackX, stackTop + 0.41, FZ], seg: 14, layer: 'gloss' });
    s.cyl(0.13, 0.13, 0.02, { color: PALETTE.ink, at: [stackX, stackTop + 0.445, FZ], seg: 12 });
    const chimneyTop = stackTop + 0.47;
    // Coal by the fire mouth.
    const coal = seeded(41);
    for (let i = 0; i < 5; i += 1) {
        s.ball(0.1 + coal() * 0.05, {
            color: '#4b4652',
            at: [1.96 + coal() * 0.16, 0.14 + (i === 4 ? 0.12 : 0), -1.82 + i * 0.09 - (i === 4 ? 0.16 : 0)],
            detail: 0,
            flat: true,
        });
    }

    // ----- The press: a stone plinth, an iron bed with its die, two posts and a beam -----
    const PX = 1.56;
    const PZ = 0.02;
    s.box(1.22, 0.2, 1.5, { color: PALETTE.stoneDark, top: PALETTE.stone, at: [PX + 0.03, 0, PZ], r: 0.05 });
    s.box(0.52, 0.48, 0.56, { color: IRON, top: '#6d6877', at: [PX, 0.2, PZ], r: 0.06, layer: 'gloss' });
    s.box(0.4, 0.07, 0.4, { color: BRASS, at: [PX, 0.68, PZ], r: 0.02, layer: 'gloss' });
    // The blank waiting in the die.
    s.geo(
        new RoundedBoxGeometry(0.26, 0.08, 0.26, 1, 0.03),
        { color: PALETTE.stock, at: [PX, 0.73, PZ], layer: 'gloss' },
        0.04,
    );
    const dieTop = 0.81;
    for (const dz of [-0.6, 0.6]) {
        s.box(0.2, 1.96, 0.2, { color: PALETTE.woodDeep, at: [PX, 0.2, PZ + dz], r: 0.04 });
        bar(
            s,
            0.11,
            0.62,
            0.11,
            PALETTE.woodDeep,
            [PX, 0.2, PZ + dz + Math.sign(dz) * 0.3],
            [-Math.sign(dz) * 0.5, 0, 0],
        );
        for (const y of [0.52, 1.5]) bar(s, 0.23, 0.07, 0.23, IRON, [PX, y, PZ + dz]);
    }
    s.box(0.3, 0.3, 1.6, { color: PALETTE.woodDeep, at: [PX, 1.84, PZ], r: 0.05 });
    s.cyl(0.15, 0.17, 0.12, { color: BRASS, at: [PX, 2.14, PZ], seg: 8, layer: 'gloss' });
    for (const dz of [-0.6, 0.6])
        s.cyl(0.05, 0.05, 0.04, {
            color: BRASS,
            at: [PX + 0.15, 1.99, PZ + dz],
            rot: [0, 0, -Math.PI / 2],
            seg: 8,
            layer: 'gloss',
        });
    // The hatch in the bed, a copper chute and the tray the finished tokens land in.
    bar(s, 0.03, 0.2, 0.3, BRASS, [PX + 0.262, 0.4, PZ], undefined, 'gloss');
    bar(s, 0.03, 0.14, 0.22, PALETTE.ink, [PX + 0.27, 0.43, PZ]);
    bar(s, 0.2, 0.025, 0.22, COPPER, [PX + 0.36, 0.38, PZ], [0, 0, -0.5], 'gloss');
    const trayX = PX + 0.47;
    s.box(0.34, 0.05, 0.6, { color: COPPER, at: [trayX, 0.2, PZ], r: 0.02, layer: 'gloss' });
    bar(s, 0.03, 0.1, 0.6, COPPER, [trayX + 0.155, 0.22, PZ], undefined, 'gloss');
    for (const dz of [-0.285, 0.285]) bar(s, 0.34, 0.1, 0.03, COPPER, [trayX, 0.22, PZ + dz], undefined, 'gloss');
    shareToken(s, [trayX + 0.01, 0.25, PZ + 0.14], 0.2, 0.3, true);
    shareToken(s, [trayX, 0.25, PZ - 0.13], 0.2, -0.2);

    // ----- Dressing: barrels, a crate of tokens, a stack waiting by the door -----
    barrel(s, [-1.68, 0, front + 0.78]);
    s.group({ at: [-1.08, 0, front + 0.92], rot: [0, 0.18, 0] }, (g) => {
        g.box(0.56, 0.3, 0.46, { color: PALETTE.wood, top: '#cf9f72', r: 0.03 });
        bar(g, 0.6, 0.05, 0.5, PALETTE.woodDark, [0, 0.27, 0]);
        bar(g, 0.48, 0.04, 0.38, PALETTE.woodDeep, [0, 0.3, 0]);
        shareToken(g, [-0.13, 0.22, 0.04], 0.2, 0.2);
        shareToken(g, [0.12, 0.22, -0.03], 0.2, -0.3, true);
        shareToken(g, [0.0, 0.4, 0.02], 0.2, 0.5);
    });
    shareToken(s, [0.82, 0, front + 0.62], 0.22, 0.15);
    shareToken(s, [0.83, 0.22, front + 0.62], 0.22, -0.2);
    shareToken(s, [0.82, 0.44, front + 0.61], 0.22, 0.4, true);
    shareToken(s, [1.1, 0, front + 0.7], 0.22, -0.5, true);

    // The cradle on the ridge that the giant token floats over.
    // It stands over the gable peak, clear of the tree behind the house.
    const tokenZ = front + 0.1;
    s.box(0.46, 0.24, 0.56, { color: PALETTE.woodDark, at: [HX, ridgeY - 0.06, tokenZ], r: 0.05 });
    s.cyl(0.05, 0.08, 0.2, { color: BRASS, at: [HX, ridgeY + 0.18, tokenZ], seg: 10, layer: 'gloss' });
    s.cyl(0.22, 0.1, 0.07, { color: BRASS, at: [HX, ridgeY + 0.36, tokenZ], seg: 16, layer: 'gloss' });

    group.add(s.build('issuer'));

    // ----- The MINT sign, facing the yard -----
    const sign = makeSign({
        width: 1.72,
        height: 0.52,
        text: 'MINT',
        color: '#fffaf0',
        background: '#b9483f',
        border: '#f3c45a',
        weight: 700,
        paint(context, width, height) {
            // A share token at each end.
            const size = height * 0.4;
            for (const x of [height * 0.34, width - height * 0.34 - size]) {
                context.fillStyle = PALETTE.stock;
                context.beginPath();
                context.roundRect(x, (height - size) / 2, size, size, size * 0.26);
                context.fill();
                context.lineWidth = height * 0.045;
                context.strokeStyle = '#fffaf0';
                context.stroke();
            }
        },
    });
    sign.mesh.rotation.y = Math.PI / 2;
    sign.mesh.position.set(signX + 0.04, signY + 0.29, signZ);
    group.add(sign.mesh);

    // ----- The ram: punch, iron block and the screw, with the fly arm on top -----
    const ramBody = new Sculpt();
    ramBody.box(0.3, 0.12, 0.3, { color: BRASS, r: 0.02, layer: 'gloss' });
    ramBody.box(0.46, 0.34, 0.6, { color: IRON, top: '#716c7b', at: [0, 0.12, 0], r: 0.07, layer: 'gloss' });
    ramBody.box(0.12, 0.09, 1.0, { color: IRON, at: [0, 0.24, 0], r: 0, layer: 'gloss' });
    ramBody.cyl(0.06, 0.06, 1.06, { color: BRASS, at: [0, 0.46, 0], seg: 10, layer: 'gloss' });
    for (let i = 0; i < 7; i += 1)
        ramBody.cyl(0.078, 0.078, 0.035, { color: '#d3a23f', at: [0, 0.54 + i * 0.135, 0], seg: 10, layer: 'gloss' });
    const ram = ramBody.build('ram');
    const ramRest = dieTop + STROKE;
    ram.position.set(PX, ramRest, PZ);
    group.add(ram);

    const armBody = new Sculpt();
    armBody.cyl(0.11, 0.12, 0.13, { color: BRASS, seg: 12, layer: 'gloss' });
    armBody.cyl(0.035, 0.035, 0.84, {
        color: IRON,
        at: [-0.42, 0.065, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 8,
        layer: 'gloss',
    });
    for (const x of [-0.42, 0.42])
        armBody.ball(0.125, { color: PALETTE.gold, at: [x, 0.065, 0], detail: 2, layer: 'gloss' });
    armBody.ball(0.07, { color: PALETTE.gold, at: [0, 0.17, 0], detail: 1, layer: 'gloss' });
    const arm = armBody.build('arm');
    arm.position.set(0, 1.52, 0);
    ram.add(arm);

    // The flash on the die when the ram lands.
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: '#fff0bf',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const flash = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 28), flashMaterial);
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(PX, dieTop + 0.03, PZ);
    flash.visible = false;
    group.add(flash);

    // ----- The giant token on the roof -----
    const TOKEN = 0.96;
    const tokenBody = new Sculpt();
    tokenBody.geo(new RoundedBoxGeometry(TOKEN, TOKEN, TOKEN, 5, 0.17), {
        color: '#ee6f87',
        top: '#f992a6',
        layer: 'gloss',
    });
    const token = tokenBody.build('token');
    const tokenRestY = ridgeY + 0.5 + TOKEN / 2;
    token.position.set(HX, tokenRestY, tokenZ);
    group.add(token);
    // The letters glow a little, so the token still reads at night.
    const letters = makeSign({
        width: 0.72,
        height: 0.72,
        text: 'TSA',
        color: '#fffaf3',
        border: '#ffd5dc',
        radius: 0.2,
        weight: 700,
        density: 300,
        lit: true,
    });
    const faces: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i += 1) {
        const face = new THREE.PlaneGeometry(0.72, 0.72);
        face.translate(0, 0, TOKEN / 2 + 0.004);
        face.rotateY((i * Math.PI) / 2);
        faces.push(face);
    }
    const lettering = mergeGeometries(faces);
    if (lettering) {
        letters.mesh.geometry.dispose();
        letters.mesh.geometry = lettering;
    }
    for (const face of faces) face.dispose();
    token.add(letters.mesh);

    // ----- Smoke: a few soft balls, reused -----
    const puffShape = new Sculpt();
    puffShape.ball(0.8, { color: '#ffffff', detail: 2 });
    puffShape.ball(0.55, { color: '#ffffff', at: [0.55, -0.12, 0.2], detail: 2 });
    puffShape.ball(0.5, { color: '#ffffff', at: [-0.5, -0.18, -0.15], detail: 2 });
    puffShape.ball(0.45, { color: '#ffffff', at: [0.1, 0.42, -0.1], detail: 2 });
    const puffGeometry = (puffShape.build().children[0] as THREE.Mesh).geometry;
    const puffs = Array.from({ length: 5 }, () => {
        const material = new THREE.MeshStandardMaterial({
            color: '#fffaf3',
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(puffGeometry, material);
        mesh.visible = false;
        group.add(mesh);
        return { mesh, material, born: -100, life: 1, size: 0.3, driftX: 0, driftZ: 0 };
    });
    const random = seeded(7);

    const hitbox = makeHitbox(4.5, 4.4, 3.9, [0, 0, 0]);
    group.add(hitbox);

    let now = 0;
    let pressAt = -100;
    let puffed: number = PUFF_TIMES.length;
    let nextCurl = 2.5;
    let tokenAngle = 0.5;

    /** Starts a smoke ball at the chimney top. */
    const puff = (time: number, size: number, life: number): void => {
        let pick = puffs[0];
        for (const item of puffs) {
            if (pick === undefined || time - item.born > time - pick.born) pick = item;
        }
        if (pick === undefined) return;
        pick.born = time;
        pick.life = life;
        pick.size = size;
        pick.driftX = 0.25 + random() * 0.3;
        pick.driftZ = -0.1 + random() * 0.3;
    };

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, HX, tokenRestY + TOKEN / 2 + 0.4, tokenZ),
            door: anchor(group, doorX, 0, front + 1.4),
            output: anchor(group, trayX + 0.02, 1.36, PZ),
            chimney: anchor(group, stackX, chimneyTop, FZ),
            press: anchor(group, PX, dieTop, PZ),
            token: anchor(group, HX, tokenRestY, tokenZ),
        },
        press() {
            pressAt = now;
            puffed = 0;
        },
        update(dt, time) {
            now = time;
            const t = time - pressAt;
            const pressing = t >= 0 && t < PRESS_TIME;

            // The ram follows its curve; the fly arm turns with the screw, so it winds back before the slam.
            const offset = ramOffset(t);
            ram.position.y = ramRest + offset;
            arm.rotation.y = 0.5 + (-offset / STROKE) * Math.PI * 3;
            let squash = 1;
            if (t >= IMPACT && t < IMPACT + 0.45) squash = 0.8 + ease.outElastic((t - IMPACT) / 0.45) * 0.2;
            ram.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5);

            // The whole house takes the thump.
            const thump =
                t >= IMPACT && t < IMPACT + 0.5
                    ? Math.sin(((t - IMPACT) / 0.5) * Math.PI * 3) * Math.exp(-(t - IMPACT) * 7)
                    : 0;
            group.scale.y = 1 - thump * 0.014;

            const ring = (t - IMPACT) / 0.34;
            flash.visible = ring >= 0 && ring < 1;
            if (flash.visible) {
                flash.scale.setScalar(1 + ease.out(ring) * 1.5);
                flashMaterial.opacity = (1 - ring) * 0.9;
            }

            // Smoke: two or three balls for a press, and a faint curl now and then.
            while (puffed < PUFF_TIMES.length && t >= (PUFF_TIMES[puffed] as number)) {
                puff(time, puffed === 1 ? 0.44 : 0.36, 1.8);
                puffed += 1;
                nextCurl = time + 5 + random() * 3;
            }
            if (!pressing && time >= nextCurl) {
                puff(time, 0.2, 2.4);
                nextCurl = time + 4.5 + random() * 4;
            }
            for (const item of puffs) {
                const k = (time - item.born) / item.life;
                item.mesh.visible = k >= 0 && k < 1;
                if (!item.mesh.visible) continue;
                const rise = ease.out(k);
                item.mesh.position.set(
                    stackX + item.driftX * k + Math.sin(k * 5 + item.driftZ * 9) * 0.05,
                    chimneyTop + 0.1 + rise * 1.5,
                    FZ + item.driftZ * k,
                );
                item.mesh.scale.setScalar(item.size * (0.35 + ease.out(clamp(k * 3)) * 0.65 + k * 0.45));
                item.mesh.rotation.y = item.driftZ * 8 + k * 1.2;
                item.material.opacity = clamp(k * 7) * (1 - clamp((k - 0.35) / 0.65)) * 0.85;
            }

            // The roof token turns and bobs; a press makes it hop and spin up.
            const since = t - IMPACT;
            const kick = since >= 0 && since < 2 ? Math.exp(-since * 2.6) : 0;
            tokenAngle += dt * (0.55 + kick * 9);
            token.rotation.set(0, tokenAngle, 0.1);
            const hop = since >= 0 && since < 0.7 ? Math.sin((since / 0.7) * Math.PI) * 0.26 : 0;
            token.position.y = tokenRestY + Math.sin(time * 1.5) * 0.05 + hop;
            const pop = since >= 0 && since < 0.6 ? Math.sin((since / 0.6) * Math.PI) * 0.1 : 0;
            token.scale.set(1 + pop, 1 - pop * 0.6, 1 + pop);
        },
    };
}
