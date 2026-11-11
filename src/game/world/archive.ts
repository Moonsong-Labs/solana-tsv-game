/**
 * The archive: every venue decision, a fill or a refusal, filed with the
 * state it read, so it can be rebuilt years later.
 *
 * In the town it is a fireproof storehouse: thick white plaster over a
 * tiled skirt, a heavy locked door, pigeonholes of scrolls behind an open
 * shutter, and a giant filing drawer in the front wall that swallows each
 * decision. The giant scroll on the roof hops when one is filed.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import {
    DISPLAY_FONT,
    MATERIALS,
    PALETTE,
    Sculpt,
    clamp,
    ease,
    gableHeight,
    makeSign,
    seeded,
    type Hex,
    type PartOpts,
} from '../scene/kit.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, gabledRoof, makeHitbox } from './place.ts';

export interface Archive extends Place {
    /** Files one decision: the drawer opens, takes the scroll and shuts; the counter goes up. */
    file(): void;
    /** Sets the counter of filed decisions. */
    setCount(count: number): void;
    anchors: Place['anchors'] & {
        /** Where a scroll flies in. */
        slot: THREE.Vector3;
    };
}

const PLASTER = '#fffdf6';
const PLASTER_SHADE = '#ece5d8';
/** The dark tiles of the wall skirt. */
const TILE = '#566079';
const ROOF_RIB = '#7682a0';
const ROOF_RIDGE = '#f0eadf';
const IRON = '#45414d';
const PAPER = '#fff4dc';

/** How far the drawer slides out. */
const DRAWER_OUT = 0.6;
/** Seconds from `file()` to the drawer snapping shut. */
const SNAP_AT = 0.56;
/** Seconds a count set by `setCount` stands for a filing still on its way. */
const CREDIT_LASTS = 1.5;

/** A rounded box with few triangles, for small parts. Anchored at the centre of its base. */
function soft(s: Sculpt, w: number, h: number, d: number, r: number, opts: PartOpts): void {
    s.geo(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) * 0.49)), opts, h / 2);
}

/**
 * A skirt of dark tiles with raised white joints in a diagonal lattice, on a
 * +Z face: from `x0` to `x1`, `h` high from `y0`. The wall surface is z = 0.
 */
function tileSkirt(s: Sculpt, x0: number, x1: number, y0: number, h: number): void {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    s.box(w, h, 0.05, { color: TILE, at: [cx, y0, 0], r: 0 });
    // A touch short, so no joint pokes past the skirt's corners.
    const strip = h * Math.SQRT2 - 0.07;
    const count = Math.max(1, Math.round((w - h) / 0.34));
    const pitch = (w - h) / count;
    for (let i = 0; i <= count; i += 1) {
        const x = x0 + h / 2 + i * pitch;
        for (const lean of [-1, 1])
            s.box(strip, 0.04, 0.03, {
                color: PLASTER,
                at: [x, y0 + h / 2 - 0.02, 0.03],
                rot: [0, 0, (lean * Math.PI) / 4],
                r: 0,
            });
    }
    s.box(w + 0.03, 0.07, 0.1, { color: PLASTER, at: [cx, y0 + h - 0.03, 0], r: 0 });
    s.box(w + 0.03, 0.05, 0.08, { color: PLASTER, at: [cx, y0, 0], r: 0 });
}

/** What sits in one pigeonhole, `w` wide, standing on z = 0 and facing +Z. `at` is the centre of its floor. */
function pigeonhole(
    s: Sculpt,
    at: readonly [number, number, number],
    w: number,
    kind: number,
    rand: () => number,
): void {
    const spines: readonly Hex[] = [
        PALETTE.roofSlate,
        PALETTE.vermilion,
        PALETTE.roofJade,
        PALETTE.roofMustard,
        PALETTE.roofPlum,
        PALETTE.roofIndigo,
        '#e9dcc0',
    ];
    const pick = (): Hex => spines[Math.floor(rand() * spines.length)] as Hex;
    s.group({ at }, (g) => {
        if (kind === 0) {
            // Three scrolls, end on.
            const ends: ReadonlyArray<readonly [number, number]> = [
                [-0.075, 0.07],
                [0.075, 0.07],
                [0, 0.195],
            ];
            for (const [x, y] of ends) {
                g.cyl(0.068, 0.068, 0.1, { color: PAPER, at: [x, y, 0], rot: [Math.PI / 2, 0, 0], seg: 10 });
                g.cyl(0.026, 0.026, 0.12, { color: pick(), at: [x, y, 0], rot: [Math.PI / 2, 0, 0], seg: 6 });
            }
        } else if (kind === 1) {
            // Ledgers standing in a row, the last one leaning.
            const each = (w - 0.06) / 4;
            for (let i = 0; i < 4; i += 1) {
                const tall = 0.2 + rand() * 0.06;
                g.box(each - 0.012, tall, 0.1, {
                    color: pick(),
                    at: [-w / 2 + 0.03 + each * (i + 0.5), 0, 0.04],
                    rot: [0, 0, i === 3 ? 0.16 : 0],
                    r: 0,
                });
            }
        } else {
            // Ledgers lying in a pile, with a scroll on top.
            for (let i = 0; i < 3; i += 1)
                g.box(w - 0.08 - i * 0.03, 0.055, 0.1, {
                    color: pick(),
                    at: [(rand() - 0.5) * 0.03, i * 0.058, 0.04],
                    r: 0,
                });
            g.cyl(0.05, 0.05, w - 0.12, {
                color: PAPER,
                at: [-(w - 0.12) / 2, 0.224, 0.05],
                rot: [0, 0, -Math.PI / 2],
                seg: 8,
            });
        }
    });
}

/** One thick plaster shutter, swung open flat against a +Z wall. `at` is the centre of its bottom edge; `hinge` is the side it hangs from (−1 left, 1 right). */
function shutter(s: Sculpt, at: readonly [number, number, number], w: number, h: number, hinge: number): void {
    s.group({ at }, (g) => {
        soft(g, w, h, 0.09, 0.03, { color: PLASTER, at: [0, 0, 0.045] });
        soft(g, w - 0.14, h - 0.16, 0.06, 0.02, { color: PALETTE.roofSlate, at: [0, 0.08, 0.1] });
        soft(g, w - 0.28, h - 0.32, 0.05, 0.02, { color: '#7a84a0', at: [0, 0.16, 0.135] });
        for (const y of [0.2, h - 0.26])
            g.box(0.2, 0.06, 0.03, { color: IRON, at: [hinge * (w / 2 - 0.08), y, 0.1], r: 0 });
    });
}

export function createArchive(): Archive {
    const group = new THREE.Group();
    group.name = 'archive';
    group.position.set(SITES.archive[0], 0, SITES.archive[1]);

    const W = 2.8;
    const D = 2.3;
    const BASE = 0.26;
    const WALL = 2.3;
    const top = BASE + WALL;
    const front = D / 2;
    const side = W / 2;
    const RISE = 1.05;
    const OVERHANG = 0.36;
    const EAVE = 0.32;
    const THICK = 0.17;
    const SKIRT = 0.54;
    /** Centre of the door and of the drawer along the front. */
    const DOOR_X = -0.73;
    const DRAWER_X = 0.66;
    const DRAWER_Y = 1.24;

    const s = new Sculpt();
    // Foundation and the thick plaster walls.
    s.box(W + 0.36, BASE, D + 0.36, { color: PALETTE.stoneDark, top: PALETTE.stone, r: 0.06 });
    s.box(W, WALL, D, { color: PLASTER_SHADE, top: PLASTER, at: [0, BASE, 0], r: 0.07 });
    // A plaster band under the eaves.
    s.box(W + 0.08, 0.16, D + 0.08, { color: PLASTER, at: [0, top - 0.2, 0], r: 0.04 });

    // ----- Front (+Z): the locked door, the filing drawer and the counter -----
    s.group({ at: [0, 0, front] }, (g) => {
        tileSkirt(g, DOOR_X + 0.66, side - 0.03, BASE, SKIRT);

        // The door: stepped plaster and slate frames round two iron-bound leaves.
        g.group({ at: [DOOR_X, BASE, 0] }, (d) => {
            soft(d, 1.3, 1.98, 0.14, 0.04, { color: PLASTER, at: [0, 0, 0] });
            soft(d, 1.16, 1.86, 0.2, 0.03, { color: PALETTE.roofSlate, at: [0, 0, 0] });
            for (const leaf of [-1, 1])
                soft(d, 0.5, 1.7, 0.26, 0.02, { color: PALETTE.woodDeep, at: [leaf * 0.255, 0, 0] });
            for (const y of [0.22, 0.82, 1.42]) {
                d.box(1.02, 0.08, 0.28, { color: IRON, at: [0, y, 0], r: 0 });
                for (const x of [-0.4, -0.13, 0.13, 0.4])
                    d.cyl(0.028, 0.028, 0.02, {
                        color: PALETTE.gold,
                        at: [x, y + 0.04, 0.14],
                        rot: [Math.PI / 2, 0, 0],
                        seg: 6,
                    });
            }
            // The padlock.
            soft(d, 0.2, 0.17, 0.08, 0.03, { color: PALETTE.gold, at: [0, 0.98, 0.15], layer: 'gloss' });
            d.torus(0.065, 0.022, {
                color: PALETTE.stone,
                at: [0, 1.15, 0.19],
                rot: [-Math.PI / 2, 0, 0],
                arc: Math.PI,
                seg: 10,
                layer: 'gloss',
            });
            d.box(0.03, 0.06, 0.02, { color: IRON, at: [0, 1.03, 0.192], r: 0 });
            // The step.
            d.box(1.5, 0.14, 0.52, { color: PALETTE.stoneDark, at: [0, -BASE, 0.4], r: 0.04 });
            d.box(1.3, 0.26, 0.26, { color: PALETTE.stone, at: [0, -BASE, 0.27], r: 0.04 });
        });

        // The drawer's housing: a timber frame round a dark mouth.
        soft(g, 1.44, 0.86, 0.14, 0.04, { color: PALETTE.woodDark, at: [DRAWER_X, DRAWER_Y - 0.43, 0] });
        g.box(1.26, 0.7, 0.16, { color: '#33272a', at: [DRAWER_X, DRAWER_Y - 0.35, 0], r: 0 });
        // The counter's backing board, on two brackets.
        soft(g, 1.4, 0.5, 0.1, 0.04, { color: PALETTE.woodDeep, at: [DRAWER_X, 1.74, 0] });
        for (const x of [-0.56, 0.56])
            g.box(0.06, 0.1, 0.08, { color: PALETTE.gold, at: [DRAWER_X + x, 1.7, 0.03], r: 0 });

        // A lantern by the door and a basket of scrolls under the drawer.
        g.box(0.05, 0.05, 0.34, { color: PALETTE.woodDeep, at: [-1.22, 1.9, 0.17], r: 0 });
        g.lathe(
            [
                [0.05, 0],
                [0.14, 0.06],
                [0.16, 0.18],
                [0.14, 0.3],
                [0.05, 0.36],
            ],
            { color: PALETTE.lantern, at: [-1.22, 1.5, 0.3], layer: 'window', seg: 12 },
        );
        g.cyl(0.22, 0.17, 0.3, { color: '#c9a070', at: [1.14, 0, 0.42], seg: 12 });
        g.torus(0.22, 0.025, { color: PALETTE.woodDark, at: [1.14, 0.3, 0.42], seg: 12 });
        const sticks: ReadonlyArray<readonly [number, number, number, number]> = [
            [-0.07, 0.03, 0.14, -0.1],
            [0.06, -0.04, -0.12, 0.08],
            [0.01, 0.07, 0.02, 0.2],
        ];
        for (const [x, z, leanX, leanZ] of sticks) {
            g.cyl(0.05, 0.05, 0.5, { color: PAPER, at: [1.14 + x, 0.12, 0.42 + z], rot: [leanX, 0, leanZ], seg: 8 });
        }
    });

    // ----- Side (+X): the open shutters over the pigeonholes -----
    const rand = seeded(1871);
    s.group({ at: [side, 0, 0], rot: [0, Math.PI / 2, 0] }, (g) => {
        tileSkirt(g, -front + 0.03, front - 0.03, BASE, 0.74);
        const HOLE = 1.02;
        const sill = 1.2;
        // The recess: a dark back, a plaster surround and timber shelves.
        g.box(HOLE, HOLE, 0.06, { color: '#4a382f', at: [0, sill, 0], r: 0 });
        g.box(HOLE + 0.24, 0.12, 0.2, { color: PLASTER, at: [0, sill - 0.12, 0], r: 0.03 });
        g.box(HOLE + 0.24, 0.12, 0.2, { color: PLASTER, at: [0, sill + HOLE, 0], r: 0.03 });
        for (const x of [-1, 1]) g.box(0.12, HOLE, 0.2, { color: PLASTER, at: [x * (HOLE / 2 + 0.06), sill, 0], r: 0 });
        const cell = HOLE / 3;
        for (let i = 1; i < 3; i += 1) {
            g.box(HOLE, 0.035, 0.14, { color: PALETTE.wood, at: [0, sill + cell * i - 0.0175, 0.02], r: 0 });
            g.box(0.035, HOLE, 0.14, { color: PALETTE.wood, at: [-HOLE / 2 + cell * i, sill, 0.02], r: 0 });
        }
        const kinds = [1, 0, 2, 0, 2, 1, 2, 1, 0];
        for (let row = 0; row < 3; row += 1) {
            for (let column = 0; column < 3; column += 1) {
                pigeonhole(
                    g,
                    [-HOLE / 2 + cell * (column + 0.5), sill + cell * row + (row === 0 ? 0 : 0.0175), 0.03],
                    cell - 0.035,
                    kinds[row * 3 + column] as number,
                    rand,
                );
            }
        }
        shutter(g, [-(HOLE / 2 + 0.12 + 0.24), sill - 0.05, 0], 0.48, HOLE + 0.1, 1);
        shutter(g, [HOLE / 2 + 0.12 + 0.24, sill - 0.05, 0], 0.48, HOLE + 0.1, -1);
        // A small barred window high in the gable.
        g.box(0.56, 0.5, 0.1, { color: PLASTER, at: [0, top - 0.02, 0], r: 0.03 });
        g.box(0.42, 0.36, 0.12, { color: PALETTE.windowWarm, at: [0, top + 0.05, 0], r: 0, layer: 'window' });
        for (const x of [-0.105, 0, 0.105]) g.box(0.035, 0.36, 0.035, { color: IRON, at: [x, top + 0.05, 0.06], r: 0 });
    });

    // ----- The roof: slate tiles with a pale ridge; ribs run down the slope the camera sees -----
    gabledRoof(s, {
        at: [0, top, 0],
        span: D,
        length: W,
        rise: RISE,
        color: PALETTE.roofSlate,
        wall: PLASTER,
        along: 'x',
        overhang: OVERHANG,
        eave: EAVE,
        thickness: THICK,
        ridge: ROOF_RIDGE,
    });
    const roofW = D + OVERHANG * 2;
    const eaveLine = top + THICK - gableHeight(roofW, RISE, D / 2);
    const slope = (u: number): number => eaveLine + gableHeight(roofW, RISE, u);
    const ribs = 11;
    for (let i = 0; i <= ribs; i += 1) {
        const x = -(side + EAVE) + 0.12 + ((W + EAVE * 2 - 0.24) * i) / ribs;
        const points: [number, number, number][] = [];
        for (let k = 0; k <= 5; k += 1) {
            const u = 0.16 + ((roofW / 2 - 0.2) * k) / 5;
            points.push([x, slope(u) + 0.005, u]);
        }
        s.tube(points, 0.036, { color: ROOF_RIB, seg: 8, layer: 'gloss' });
    }
    const ridge = eaveLine + RISE;
    // Two cradles on the ridge for the giant scroll.
    for (const x of [-0.62, 0.62]) {
        soft(s, 0.16, 0.26, 0.56, 0.04, { color: PALETTE.woodDark, at: [x, ridge + 0.02, 0] });
        for (const z of [-0.24, 0.24])
            s.box(0.16, 0.22, 0.1, { color: PALETTE.woodDark, at: [x, ridge + 0.2, z], r: 0.03 });
    }

    group.add(s.build('archive'));

    // ----- The giant scroll: rolled paper on a rod, a ribbon, and a written end let down the roof -----
    const SCROLL_R = 0.28;
    const scrollRest = ridge + 0.26 + SCROLL_R;
    const roll = new Sculpt();
    roll.cyl(SCROLL_R, SCROLL_R, 1.76, { color: PAPER, at: [-0.88, 0, 0], rot: [0, 0, -Math.PI / 2], seg: 20 });
    for (const end of [-1, 1]) {
        // The rolled end: rings of paper round the rod.
        roll.cyl(SCROLL_R - 0.05, SCROLL_R - 0.05, 0.02, {
            color: '#e6d6b4',
            at: [end * 0.88, 0, 0],
            rot: [0, 0, -end * (Math.PI / 2)],
            seg: 18,
        });
        roll.cyl(SCROLL_R - 0.11, SCROLL_R - 0.11, 0.03, {
            color: PAPER,
            at: [end * 0.88, 0, 0],
            rot: [0, 0, -end * (Math.PI / 2)],
            seg: 16,
        });
        roll.cyl(0.075, 0.075, 0.22, {
            color: PALETTE.woodDeep,
            at: [end * 0.88, 0, 0],
            rot: [0, 0, -end * (Math.PI / 2)],
            seg: 10,
        });
        roll.ball(0.105, { color: PALETTE.gold, at: [end * 1.12, 0, 0], detail: 1, layer: 'gloss' });
    }
    // The ribbon and its seal.
    roll.cyl(SCROLL_R + 0.015, SCROLL_R + 0.015, 0.2, {
        color: PALETTE.vermilion,
        at: [-0.1, 0, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 20,
        layer: 'gloss',
    });
    roll.box(0.07, 0.34, 0.02, {
        color: PALETTE.vermilion,
        at: [-0.05, -0.5, SCROLL_R + 0.02],
        rot: [0, 0, 0.14],
        r: 0,
    });
    roll.box(0.07, 0.3, 0.02, { color: '#c9463b', at: [0.06, -0.47, SCROLL_R + 0.015], rot: [0, 0, -0.16], r: 0 });
    roll.cyl(0.11, 0.11, 0.04, {
        color: PALETTE.gold,
        at: [0, -0.02, SCROLL_R],
        rot: [Math.PI / 2, 0, 0],
        seg: 14,
        layer: 'gloss',
    });
    // The written end, lying down the front slope.
    const u1 = 0.3;
    const u2 = 1.02;
    const y1 = slope(u1) + 0.07 - scrollRest;
    const y2 = slope(u2) + 0.07 - scrollRest;
    const sheetLength = Math.hypot(u2 - u1, y1 - y2);
    const sheetTilt = Math.atan2(y1 - y2, u2 - u1);
    roll.group({ at: [0.52, y1, u1], rot: [sheetTilt, 0, 0] }, (g) => {
        g.box(0.62, 0.025, sheetLength, { color: PAPER, at: [0, 0, sheetLength / 2], r: 0 });
        const lines = [0.46, 0.38, 0.48, 0.3, 0.42];
        lines.forEach((length, i) => {
            g.box(length, 0.012, 0.035, { color: '#6c6470', at: [-(0.5 - length) / 2, 0.025, 0.16 + i * 0.105], r: 0 });
        });
        g.cyl(0.035, 0.035, 0.68, {
            color: PALETTE.woodDeep,
            at: [-0.34, 0.012, sheetLength],
            rot: [0, 0, -Math.PI / 2],
            seg: 8,
        });
    });
    const scroll = roll.build('scroll');
    scroll.position.set(0, scrollRest, 0);
    group.add(scroll);

    // ----- The giant filing drawer -----
    const box = new Sculpt();
    soft(box, 1.24, 0.68, 0.11, 0.04, { color: PALETTE.wood, at: [0, -0.34, 0.075] });
    soft(box, 1.04, 0.48, 0.04, 0.02, { color: '#d3a577', at: [0, -0.24, 0.135] });
    // The label holder and the cup pull, in brass.
    soft(box, 0.52, 0.2, 0.04, 0.02, { color: PALETTE.gold, at: [0, 0.0, 0.155], layer: 'gloss' });
    box.box(0.44, 0.13, 0.045, { color: PALETTE.paper, at: [0, 0.035, 0.157], r: 0 });
    box.box(0.26, 0.022, 0.05, { color: '#6c6470', at: [-0.04, 0.09, 0.158], r: 0 });
    box.torus(0.12, 0.034, {
        color: PALETTE.gold,
        at: [0, -0.1, 0.17],
        rot: [-Math.PI / 2 + 0.25, 0, Math.PI],
        arc: Math.PI,
        seg: 12,
        layer: 'gloss',
    });
    // The box behind the front, full of folders with coloured tabs.
    for (const x of [-0.56, 0.56]) box.box(0.05, 0.52, 0.74, { color: PALETTE.woodDark, at: [x, -0.3, -0.35], r: 0 });
    box.box(1.12, 0.05, 0.74, { color: PALETTE.woodDark, at: [0, -0.3, -0.35], r: 0 });
    box.box(1.12, 0.52, 0.05, { color: PALETTE.woodDark, at: [0, -0.3, -0.7], r: 0 });
    const tabs: readonly Hex[] = [
        PALETTE.roofSlate,
        PALETTE.roofMustard,
        PALETTE.vermilion,
        PALETTE.roofJade,
        PALETTE.roofPlum,
        PALETTE.roofMustard,
        PALETTE.roofSlate,
    ];
    tabs.forEach((tone, i) => {
        const z = -0.08 - i * 0.085;
        box.box(1.04, 0.4, 0.05, { color: i % 2 === 0 ? '#f3e6c8' : '#ecdcb8', at: [0, -0.25, z], r: 0 });
        box.box(0.2, 0.06, 0.045, { color: tone, at: [-0.36 + ((i * 3) % 5) * 0.18, 0.15, z], r: 0 });
    });
    const drawer = box.build('drawer');
    drawer.position.set(DRAWER_X, DRAWER_Y, front);
    group.add(drawer);

    // The scroll the drawer swallows: it shows only while it drops in.
    const morsel = new Sculpt();
    morsel.cyl(0.07, 0.07, 0.4, { color: PALETTE.paper, at: [-0.2, 0, 0], rot: [0, 0, -Math.PI / 2], seg: 10 });
    for (const x of [-0.19, 0.19])
        morsel.cyl(0.084, 0.084, 0.034, {
            color: PALETTE.vermilion,
            at: [x - 0.017, 0, 0],
            rot: [0, 0, -Math.PI / 2],
            seg: 10,
        });
    const swallowed = morsel.build('filed');
    swallowed.visible = false;
    group.add(swallowed);
    /** Where a flying scroll arrives, above the open drawer: the `slot` anchor. */
    const SLOT: readonly [number, number, number] = [DRAWER_X, DRAWER_Y + 0.42, front + 0.4];

    // ----- The counter: three wheels of digits that roll over -----
    let count = 0;
    let previous = 0;
    let rollAt = -10;
    let now = 0;
    const ROLL = 0.38;
    const counter = makeSign({
        width: 1.26,
        height: 0.42,
        text: '',
        lit: true,
        paint(context, width, height) {
            context.beginPath();
            context.roundRect(0, 0, width, height, height * 0.2);
            context.fillStyle = '#2b2730';
            context.fill();
            context.lineWidth = Math.max(2, height * 0.06);
            context.strokeStyle = '#d9ad4e';
            context.beginPath();
            context.roundRect(
                context.lineWidth / 2,
                context.lineWidth / 2,
                width - context.lineWidth,
                height - context.lineWidth,
                height * 0.17,
            );
            context.stroke();

            const places = Math.max(3, String(count).length);
            const to = String(count).padStart(places, '0');
            const from = String(previous).padStart(places, '0').slice(-places);
            const pad = height * 0.16;
            const gap = height * 0.07;
            const cellW = (width - pad * 2 - gap * (places - 1)) / places;
            const cellH = height - pad * 2;
            const turn = ease.out(clamp((now - rollAt) / ROLL));
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = `700 ${Math.round(Math.min(cellH * 0.98, cellW * 1.25))}px ${DISPLAY_FONT}`;
            for (let i = 0; i < places; i += 1) {
                const x = pad + i * (cellW + gap);
                context.save();
                context.beginPath();
                context.roundRect(x, pad, cellW, cellH, cellH * 0.16);
                context.clip();
                // A wheel: lighter in the middle, darker where it turns away.
                const shade = context.createLinearGradient(0, pad, 0, pad + cellH);
                shade.addColorStop(0, '#39343f');
                shade.addColorStop(0.5, '#56505e');
                shade.addColorStop(1, '#39343f');
                context.fillStyle = shade;
                context.fillRect(x, pad, cellW, cellH);
                context.fillStyle = '#ffe9bd';
                const middle = pad + cellH * 0.54;
                const moving = from[i] !== to[i] && turn < 1;
                if (moving) {
                    context.fillText(from[i] as string, x + cellW / 2, middle - turn * cellH);
                    context.fillText(to[i] as string, x + cellW / 2, middle + (1 - turn) * cellH);
                } else {
                    context.fillText(to[i] as string, x + cellW / 2, middle);
                }
                context.restore();
            }
        },
    });
    counter.mesh.position.set(DRAWER_X, 1.99, front + 0.056);
    group.add(counter.mesh);
    const counterMaterial = counter.mesh.material as THREE.MeshBasicMaterial;

    const hitbox = makeHitbox(W + 0.7, scrollRest + SCROLL_R, D + 1.3, [0, 0, 0.25]);
    group.add(hitbox);

    let fileAt = -10;
    let snapped = true;
    let rolling = false;
    /** Filings whose drawer has not shut yet; each adds one to the counter when it does. */
    let pending = 0;
    /** Filings the counter already shows because `setCount` got there first. */
    let credit = 0;
    let creditAt = -10;

    /** Shows `next` on the counter, rolling the wheels that change. */
    const show = (next: number): void => {
        if (next === count) return;
        previous = count;
        count = next;
        rollAt = now;
        rolling = true;
        counter.set({});
    };

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, 0, scrollRest + SCROLL_R + 0.3, 0),
            door: anchor(group, DOOR_X, 0, front + 1),
            slot: anchor(group, SLOT[0], SLOT[1], SLOT[2]),
        },
        file() {
            fileAt = now;
            snapped = false;
            if (credit > 0 && now - creditAt < CREDIT_LASTS) credit -= 1;
            else pending += 1;
        },
        setCount(value) {
            const next = Math.max(0, Math.round(value));
            const more = next - count;
            if (more > 0) {
                // The caller counts for itself: do not count the same filing twice.
                const used = Math.min(pending, more);
                pending -= used;
                // A big jump is a count being restored, not filings on their way.
                credit = more - used > 4 ? 0 : (now - creditAt < CREDIT_LASTS ? credit : 0) + more - used;
                creditAt = now;
            } else {
                pending = 0;
                credit = 0;
            }
            show(next);
        },
        update(_dt, time) {
            now = time;
            const t = time - fileAt;

            // The drawer: out with a flourish, a gulp, then a snap and a rattle.
            let out = 0;
            let dip = 0;
            if (t >= 0 && t < 1.1) {
                if (t < 0.24) out = ease.outBack(t / 0.24);
                else if (t < 0.46) {
                    out = 1;
                    dip = Math.sin(((t - 0.24) / 0.22) * Math.PI);
                } else if (t < SNAP_AT) out = 1 - ease.in((t - 0.46) / (SNAP_AT - 0.46));
                else {
                    const k = clamp((t - SNAP_AT) / 0.4);
                    out = 0.13 * Math.sin(k * Math.PI * 2.5) * Math.pow(1 - k, 2);
                }
            }
            drawer.position.z = front + out * DRAWER_OUT;
            drawer.position.y = DRAWER_Y - dip * 0.035;
            drawer.rotation.x = dip * 0.03;

            // The scroll drops from where it arrived into the open drawer.
            const drop = clamp((t - 0.04) / 0.3);
            swallowed.visible = t >= 0 && t < 0.44;
            if (swallowed.visible) {
                const fall = ease.in(drop);
                swallowed.position.set(SLOT[0], SLOT[1] - fall * 0.52, SLOT[2] - fall * 0.06);
                swallowed.rotation.set(0, 0.3 + drop * 0.5, drop * 0.4);
                swallowed.scale.setScalar(1 - fall * 0.25);
            }

            if (!snapped && t >= SNAP_AT) {
                snapped = true;
                if (pending > 0) {
                    const add = pending;
                    pending = 0;
                    show(count + add);
                }
            }

            // The scroll: a slow bob; a hop and a wobble when the drawer snaps shut.
            let y = scrollRest + Math.sin(time * 1.4) * 0.025;
            let tilt = Math.sin(time * 0.9) * 0.012;
            let squash = 1;
            const h = t - SNAP_AT;
            if (h >= 0 && h < 0.6) {
                if (h < 0.34) {
                    const k = h / 0.34;
                    y = scrollRest + Math.sin(k * Math.PI) * 0.3;
                    tilt = Math.sin(k * Math.PI) * 0.1;
                } else {
                    const k = (h - 0.34) / 0.26;
                    squash = 1 - 0.14 * Math.sin(k * Math.PI) * (1 - k);
                }
            }
            scroll.position.y = y - (1 - squash) * SCROLL_R;
            scroll.rotation.z = tilt;
            scroll.scale.set(1, squash, 1 + (1 - squash) * 0.5);

            if (rolling) {
                counter.set({});
                if (time - rollAt > ROLL) rolling = false;
            }
            // The digits glow a little at night, as the town's other lights do.
            const glow = clamp((MATERIALS.lit.color.r - 0.95) / 0.35, 0, 2.2);
            counterMaterial.color.setScalar(0.92 + glow * 0.16);
        },
    };
}
