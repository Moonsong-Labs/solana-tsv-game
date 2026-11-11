/**
 * The chain: blocks roll along the rail one after another, and every
 * transaction the venue sees, a fill or a refusal, boards the block at the
 * dock. A refusal lands on chain with its code; it changes nothing else.
 *
 * In the town it is a little railway along the front-right edge. Each block
 * is a glass wagon: it comes out of the far gatehouse empty, opens its lid at
 * the dock to take parcels, snaps shut (sealed, gold) and rolls away into the
 * near gatehouse.
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
    makeLamp,
    makeSign,
    type Hex,
    type Layer,
    type PartOpts,
} from '../scene/kit.ts';
import { RAIL, SITES } from './layout.ts';
import { type Place, anchor, hippedRoof, makeHitbox } from './place.ts';

/** What a parcel on a block is: a filled trade, a refusal, a venue or issuer action, or a posted input (a halt message, a heartbeat). */
export type ParcelKind = 'fill' | 'refusal' | 'admin' | 'input';

export interface Chain extends Place {
    /** The slot number of the block at the dock. */
    slot(): number;
    /**
     * Where a parcel should fly to board the open block: a live world
     * position that follows the block as it moves.
     */
    openBlock(): THREE.Vector3;
    /** Puts a parcel on the open block (call when the flying parcel arrives). Returns the slot it landed in. */
    load(kind: ParcelKind): number;
    /** Called with each new slot number as a block reaches the dock. */
    onSlot: ((slot: number) => void) | undefined;
    anchors: Place['anchors'] & {
        dock: THREE.Vector3;
    };
}

/** Stage seconds between two blocks reaching the dock. */
export const SLOT_SECONDS = 3.2;

/** Distance between two blocks on the rail. */
const SPACING = 2.7;
/** Wagons in the pool; together they cover the rail from `RAIL.zStart` to `RAIL.zEnd`. */
const WAGONS = 10;
const DOCK_X = SITES.dock[0];
const DOCK_Z = SITES.dock[1];
/** Centre of each gatehouse along the rail (one at −Z, one at +Z). */
const PORTAL_Z = 11.15;
/** Where a wagon starts growing inside the far gatehouse and where it has gone inside the near one. */
const HIDE_Z = 11.7;
/** How far a wagon rolls while it grows or shrinks inside a gatehouse. */
const HIDE_RUN = 0.75;

/** Height of the top of the rails. */
const RAIL_TOP = 0.21;
/** Half the distance between the two rails. */
const GAUGE = 0.5;
const WHEEL_R = 0.16;
/** The wheels the camera can see: both on its side and the front one beyond. Each is [side, place along the wagon]. */
const WHEELS: ReadonlyArray<readonly [number, number]> = [
    [1, 0.36],
    [1, -0.36],
    [-1, 0.36],
];
/** Height of a wagon's deck, which is also the dock's. */
const BED = 0.63;
/** Height of the glass cube above the deck. */
const CUBE_H = 0.86;
/** How far the lid of the open block swings up, in radians. */
const LID_OPEN = 1.12;

/** Parcels a block shows; more only recolour the last. */
const PILE: ReadonlyArray<readonly [number, number, number]> = [
    [-0.17, 0, 0.17],
    [0.17, 0, 0.17],
    [-0.17, 0, -0.17],
    [0.17, 0, -0.17],
    [-0.15, 1, 0.16],
    [0.16, 1, 0.15],
    [-0.16, 1, -0.15],
    [0.15, 1, -0.16],
    [0, 2, 0],
];
const PER_BLOCK = PILE.length;
/** Parcel piles kept: the open block and the three sealed ones still in sight. */
const PILES = 4;
const PARCEL_H = 0.225;

const KIND_COLOR: Record<ParcelKind, Hex> = {
    fill: PALETTE.ok,
    refusal: PALETTE.warn,
    admin: '#9471c4',
    input: '#8ecbff',
};

const ROOF = '#57525f';
const ROOF_RIDGE = '#433f4b';
const WALL = '#f8eedb';
const STEEL = '#7d7884';

/** Lid colours: waiting for the dock, open at the dock, sealed. */
const LID_PENDING = new THREE.Color('#f6ead2');
const LID_OPEN_COLOR = new THREE.Color('#b9f2d2');
const LID_SEALED = new THREE.Color(PALETTE.gold);
const GLASS_PENDING = new THREE.Color('#cdeeff');
const GLASS_OPEN = new THREE.Color('#eafff3');
const GLASS_SEALED = new THREE.Color('#ffefc9');
const LAMP_PENDING = new THREE.Color('#fff1cf');
const LAMP_OPEN = new THREE.Color(PALETTE.ok);
const LAMP_SEALED = new THREE.Color('#ffe7a3');

/** A rounded box with few triangles, for small parts. Anchored at the centre of its base. */
function soft(s: Sculpt, w: number, h: number, d: number, r: number, opts: PartOpts): void {
    s.geo(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) * 0.49)), opts, h / 2);
}

/** Builds a sculpt and hands back its merged geometry, one per layer used. */
function geometries(s: Sculpt): Partial<Record<Layer, THREE.BufferGeometry>> {
    const out: Partial<Record<Layer, THREE.BufferGeometry>> = {};
    for (const child of s.build('part').children) {
        if (child instanceof THREE.Mesh)
            out[child.name.slice('part:'.length) as Layer] = child.geometry as THREE.BufferGeometry;
    }
    return out;
}

function only(s: Sculpt, layer: Layer = 'solid'): THREE.BufferGeometry {
    return geometries(s)[layer] ?? new THREE.BufferGeometry();
}

/** A paper lantern hanging at `at` (its top). */
function lantern(s: Sculpt, at: readonly [number, number, number], size = 1): void {
    s.group({ at, scale: size }, (g) => {
        g.cyl(0.06, 0.06, 0.04, { color: PALETTE.woodDeep, at: [0, -0.04, 0], seg: 8 });
        g.lathe(
            [
                [0.05, 0],
                [0.14, 0.06],
                [0.16, 0.17],
                [0.14, 0.28],
                [0.05, 0.34],
            ],
            { color: PALETTE.lantern, at: [0, -0.38, 0], layer: 'window', seg: 12 },
        );
        g.cyl(0.06, 0.06, 0.04, { color: PALETTE.woodDeep, at: [0, -0.42, 0], seg: 8 });
    });
}

/** Sleepers and the two rails, from gatehouse to gatehouse. */
function buildTrack(s: Sculpt): void {
    const from = -PORTAL_Z - 0.45;
    const count = 39;
    const step = ((PORTAL_Z + 0.45) * 2) / count;
    for (let i = 0; i <= count; i += 1) {
        s.box(1.42, 0.07, 0.2, {
            color: i % 2 === 0 ? PALETTE.woodDark : '#9c7250',
            at: [RAIL.x, 0.06, from + i * step],
            r: 0,
        });
    }
    for (const side of [-1, 1]) {
        s.box(0.075, 0.085, PORTAL_Z * 2 + 1, {
            color: STEEL,
            at: [RAIL.x + side * GAUGE, 0.125, 0],
            r: 0,
            layer: 'gloss',
        });
    }
}

/**
 * A gatehouse over the rail: a plastered box with an arched mouth, where
 * blocks appear or vanish. Its mouth faces along +Z, or along −Z when
 * `turned`; a turned gatehouse shows its back to the camera, so the back
 * carries the chain's emblem.
 */
function buildPortal(s: Sculpt, z: number, turned: boolean): void {
    s.group({ at: [RAIL.x, 0, z], rot: [0, turned ? Math.PI : 0, 0] }, (g) => {
        const H = 2.1;
        // The front wall with its arch.
        const wall = new THREE.Shape();
        wall.moveTo(-1, 0);
        wall.lineTo(-0.75, 0);
        wall.lineTo(-0.75, 1.15);
        wall.absarc(0, 1.15, 0.75, Math.PI, 0, true);
        wall.lineTo(0.75, 0);
        wall.lineTo(1, 0);
        wall.lineTo(1, H);
        wall.lineTo(-1, H);
        wall.closePath();
        g.shape(wall, 0.16, { color: '#eadfca', top: WALL, at: [0, 0, 0.52] });
        // Sides, back and a dark lining, so the inside reads as a tunnel.
        for (const side of [-1, 1]) {
            soft(g, 0.25, H, 1.06, 0.03, { color: '#eadfca', top: WALL, at: [side * 0.875, 0, -0.07] });
            g.box(0.012, H - 0.04, 1.02, { color: '#2f2a30', at: [side * 0.744, 0, -0.07], r: 0 });
            soft(g, 0.3, 0.36, 1.24, 0.04, { color: PALETTE.stoneDark, at: [side * 0.875, 0, 0] });
        }
        soft(g, 2, H, 0.14, 0.03, { color: '#eadfca', top: WALL, at: [0, 0, -0.53] });
        g.box(1.5, H - 0.04, 0.012, { color: '#2f2a30', at: [0, 0, -0.454], r: 0 });
        g.box(1.5, 0.012, 1.02, { color: '#2f2a30', at: [0, H - 0.05, -0.07], r: 0 });
        soft(g, 2.05, 0.36, 0.2, 0.04, { color: PALETTE.stoneDark, at: [0, 0, -0.52] });
        // The arch: a timber ring on two jambs, with a gold keystone.
        g.torus(0.82, 0.085, {
            color: PALETTE.woodDark,
            at: [0, 1.15, 0.6],
            rot: [-Math.PI / 2, 0, 0],
            arc: Math.PI,
            seg: 18,
            layer: 'gloss',
        });
        for (const side of [-1, 1])
            soft(g, 0.17, 1.15, 0.12, 0.03, { color: PALETTE.woodDark, at: [side * 0.82, 0, 0.6], layer: 'gloss' });
        soft(g, 0.26, 0.3, 0.14, 0.05, { color: PALETTE.gold, at: [0, 1.84, 0.62], layer: 'gloss' });
        // The head beam and the roof.
        soft(g, 2.14, 0.14, 1.36, 0.03, { color: PALETTE.woodDark, at: [0, H, 0] });
        // A low roof, and no finial on the near gatehouse: it stands in front of the indexer.
        hippedRoof(g, {
            at: [0, H + 0.14, 0],
            w: 2.1,
            d: 1.3,
            rise: 0.42,
            color: ROOF,
            overhang: 0.2,
            tip: 0.12,
            ridge: 0.95,
            finial: turned ? undefined : PALETTE.gold,
        });
        // Lanterns either side of the mouth.
        for (const side of [-1, 1]) {
            g.box(0.05, 0.05, 0.24, { color: PALETTE.woodDeep, at: [side * 0.89, 1.72, 0.7], r: 0 });
            lantern(g, [side * 0.89, 1.72, 0.78], 0.8);
        }
        // Round windows in the sides.
        for (const side of [-1, 1]) {
            g.cyl(0.25, 0.25, 0.05, {
                color: PALETTE.woodDark,
                at: [side * 1, 1.3, -0.05],
                rot: [0, 0, -side * (Math.PI / 2)],
                seg: 16,
            });
            g.cyl(0.18, 0.18, 0.07, {
                color: PALETTE.windowWarm,
                at: [side * 1, 1.3, -0.05],
                rot: [0, 0, -side * (Math.PI / 2)],
                seg: 16,
                layer: 'window',
            });
        }
        if (turned) {
            // The back, which faces the camera: two links of a chain on a dark roundel.
            g.cyl(0.58, 0.58, 0.06, {
                color: ROOF_RIDGE,
                at: [0, 1.22, -0.6],
                rot: [-Math.PI / 2, 0, 0],
                seg: 24,
                layer: 'gloss',
            });
            g.torus(0.58, 0.035, {
                color: PALETTE.woodDark,
                at: [0, 1.22, -0.64],
                rot: [-Math.PI / 2, 0, 0],
                seg: 28,
                layer: 'gloss',
            });
            for (const end of [-1, 1]) {
                g.torus(0.13, 0.05, {
                    color: PALETTE.gold,
                    at: [end * 0.125, 1.22 - end * 0.125, -0.69 - end * 0.02],
                    rot: [-Math.PI / 2, Math.PI / 4, 0],
                    scale: [1.75, 1, 1],
                    seg: 22,
                    layer: 'gloss',
                });
            }
        }
    });
}

/** The loading dock: a wooden platform beside the rail under a roofed name board. Local origin: the platform's centre on the ground. */
function buildDock(s: Sculpt): void {
    s.group({ at: [9.4, 0, DOCK_Z] }, (g) => {
        // The platform: stone footing, plank deck, a safety line along the rail side.
        soft(g, 0.9, 0.44, 2.5, 0.04, { color: PALETTE.stoneDark, top: PALETTE.stone });
        soft(g, 1, 0.19, 2.6, 0.04, { color: PALETTE.wood, at: [0, 0.44, 0] });
        for (let i = 0; i < 7; i += 1)
            g.box(0.96, 0.006, 0.022, { color: PALETTE.woodDark, at: [0, BED, -1.05 + i * 0.35], r: 0 });
        g.box(0.07, 0.008, 2.5, { color: PALETTE.gold, at: [0.4, BED, 0], r: 0 });
        // Steps at the camera end.
        soft(g, 0.72, 0.42, 0.3, 0.04, { color: PALETTE.stone, at: [-0.08, 0, 1.44] });
        soft(g, 0.72, 0.21, 0.3, 0.04, { color: PALETTE.stone, at: [-0.08, 0, 1.72] });

        // The name board: two posts and a beam carry the board, proud of the posts so the slim roof never hides it.
        const postX = -0.37;
        for (const end of [-1, 1])
            soft(g, 0.13, 2.3, 0.13, 0.03, { color: PALETTE.woodDark, at: [postX, BED, end * 1.2] });
        soft(g, 0.1, 0.9, 2.5, 0.04, { color: PALETTE.woodDeep, at: [postX + 0.03, 1.87, 0] });
        soft(g, 0.16, 0.1, 2.7, 0.03, { color: PALETTE.woodDark, at: [postX, 2.83, 0] });
        // The roof: two tiled slopes meeting on a ridge pole.
        for (const slope of [-1, 1])
            soft(g, 0.44, 0.08, 2.96, 0.03, {
                color: ROOF,
                at: [postX + slope * 0.18, 2.95, 0],
                rot: [0, 0, -slope * 0.5],
                layer: 'gloss',
            });
        g.cyl(0.07, 0.07, 3.04, {
            color: ROOF_RIDGE,
            at: [postX, 3.1, -1.52],
            rot: [Math.PI / 2, 0, 0],
            seg: 8,
            layer: 'gloss',
        });
        for (const end of [-1, 1])
            soft(g, 0.2, 0.22, 0.1, 0.04, { color: ROOF_RIDGE, at: [postX, 3.0, end * 1.5], layer: 'gloss' });
        // A lantern under the far end of the beam and a bench against the posts.
        g.box(0.4, 0.05, 0.05, { color: PALETTE.woodDeep, at: [postX + 0.2, 1.74, -1.2], r: 0 });
        lantern(g, [postX + 0.37, 1.74, -1.2], 0.9);
        g.box(0.26, 0.06, 0.9, { color: PALETTE.wood, at: [postX + 0.1, BED + 0.26, 0.5], r: 0 });
        for (const end of [-1, 1])
            g.box(0.2, 0.26, 0.06, { color: PALETTE.woodDark, at: [postX + 0.1, BED, 0.5 + end * 0.36], r: 0 });

        // Where a parcel waits: a brass pan on a short stand.
        g.cyl(0.07, 0.1, 0.1, { color: PALETTE.woodDark, at: [0.08, BED, -0.02], seg: 10 });
        g.cyl(0.2, 0.15, 0.05, { color: PALETTE.gold, at: [0.08, BED + 0.1, -0.02], seg: 16, layer: 'gloss' });
        // Waiting goods at the far end: wrapped parcels and a sack.
        soft(g, 0.36, 0.3, 0.34, 0.04, { color: '#d9b98c', at: [-0.05, BED, -0.92] });
        g.box(0.37, 0.05, 0.06, { color: PALETTE.vermilion, at: [-0.05, BED + 0.13, -0.92], r: 0 });
        soft(g, 0.26, 0.2, 0.26, 0.04, { color: PALETTE.paper, at: [-0.03, BED + 0.3, -0.9], rot: [0, 0.4, 0] });
        g.ball(0.17, { color: '#e6d3ad', at: [0.26, BED + 0.15, -1.02], scale: [1, 0.95, 1], detail: 1 });
        g.ball(0.06, { color: '#c9b085', at: [0.26, BED + 0.33, -1.02], detail: 1 });

        // The signal: a post at the camera end holding a ring for the lamp.
        g.cyl(0.04, 0.055, 1.24, { color: ROOF_RIDGE, at: [0.36, BED, 1.12], seg: 8, layer: 'gloss' });
        g.cyl(0.09, 0.09, 0.05, { color: ROOF_RIDGE, at: [0.36, BED, 1.12], seg: 10, layer: 'gloss' });
        g.torus(0.17, 0.035, {
            color: ROOF_RIDGE,
            at: [0.36, BED + 1.4, 1.12],
            rot: [0, 0, Math.PI / 2],
            seg: 18,
            layer: 'gloss',
        });
    });
}

/** The parts of one wagon, each built once and drawn for every wagon in the pool. Local origin: on the ground between the rails; +Z is forward. */
function wagonParts(): {
    body: THREE.BufferGeometry;
    glass: THREE.BufferGeometry;
    lid: THREE.BufferGeometry;
    lamp: THREE.BufferGeometry;
    wheel: THREE.BufferGeometry;
    parcel: THREE.BufferGeometry;
    rim: THREE.BufferGeometry;
} {
    const body = new Sculpt();
    body.box(0.84, 0.13, 1.0, { color: PALETTE.woodDeep, at: [0, 0.31, 0], r: 0 });
    soft(body, 1.2, 0.11, 1.26, 0.04, { color: PALETTE.wood, at: [0, BED - 0.11, 0] });
    for (const end of [-1, 1]) body.box(1.04, 0.15, 0.07, { color: PALETTE.woodDark, at: [0, 0.4, end * 0.64], r: 0 });
    for (const side of [-1, 1])
        body.cyl(0.07, 0.07, 0.07, {
            color: PALETTE.gold,
            at: [side * 0.33, 0.475, 0.675],
            rot: [Math.PI / 2, 0, 0],
            seg: 10,
        });
    // A low tray that holds the glass.
    for (const end of [-1, 1]) {
        body.box(1, 0.12, 0.06, { color: PALETTE.woodDark, at: [0, BED, end * 0.47], r: 0 });
        body.box(0.06, 0.12, 0.88, { color: PALETTE.woodDark, at: [end * 0.47, BED, 0], r: 0 });
    }
    // A small face on the front pane: two eyes, two cheeks, a smile.
    const faceZ = 0.452;
    for (const side of [-1, 1]) {
        body.cyl(0.05, 0.05, 0.02, {
            color: PALETTE.ink,
            at: [side * 0.15, 1.14, faceZ - 0.006],
            rot: [Math.PI / 2, 0, 0],
            scale: [1, 1, 1.12],
            seg: 8,
        });
        body.cyl(0.058, 0.058, 0.012, {
            color: '#f7a9ba',
            at: [side * 0.29, 1.03, faceZ - 0.004],
            rot: [Math.PI / 2, 0, 0],
            seg: 8,
        });
        body.box(0.062, 0.022, 0.02, {
            color: PALETTE.ink,
            at: [side * 0.027, 1.03, faceZ],
            rot: [0, 0, side * 0.5],
            r: 0,
        });
    }

    const glass = new RoundedBoxGeometry(0.9, CUBE_H, 0.9, 1, 0.11);
    glass.translate(0, BED + CUBE_H / 2, 0);

    // The lid, hinged along its rear edge (the local origin); it reaches forward along +Z.
    const lid = new Sculpt();
    soft(lid, 0.96, 0.08, 0.96, 0.036, { color: '#ffffff', at: [0, 0, 0.47], layer: 'gloss' });
    lid.cyl(0.075, 0.095, 0.05, { color: '#6f6f6f', at: [0, 0.08, 0.84], seg: 10, layer: 'gloss' });

    const lamp = new THREE.IcosahedronGeometry(0.1, 1);

    // A wheel, its axle along X, turning about its centre.
    const wheel = new Sculpt();
    wheel.cyl(WHEEL_R, WHEEL_R, 0.07, { color: '#4f4a55', at: [-0.035, 0, 0], rot: [0, 0, -Math.PI / 2], seg: 14 });
    wheel.cyl(0.062, 0.062, 0.1, { color: PALETTE.gold, at: [-0.04, 0, 0], rot: [0, 0, -Math.PI / 2], seg: 8 });
    for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2;
        wheel.box(0.012, 0.05, 0.05, {
            color: '#e9dcc0',
            at: [0.036, Math.cos(a) * 0.105 - 0.025, Math.sin(a) * 0.105],
            r: 0,
        });
    }

    const parcel = new Sculpt();
    soft(parcel, 0.3, 0.215, 0.3, 0.05, { color: '#ffffff' });
    parcel.box(0.306, 0.05, 0.306, { color: '#c4c4c4', at: [0, 0.083, 0], r: 0 });

    // The glowing rim of the open block: a band round the mouth and one round the tray.
    const rim = new Sculpt();
    const top = BED + CUBE_H - 0.03;
    for (const end of [-1, 1]) {
        rim.box(0.96, 0.05, 0.05, { color: '#ffffff', at: [0, top, end * 0.455], r: 0 });
        rim.box(0.05, 0.05, 0.86, { color: '#ffffff', at: [end * 0.455, top, 0], r: 0 });
        rim.box(1.12, 0.03, 0.04, { color: '#ffffff', at: [0, BED + 0.005, end * 0.555], r: 0 });
        rim.box(0.04, 0.03, 1.08, { color: '#ffffff', at: [end * 0.555, BED + 0.005, 0], r: 0 });
    }

    return {
        body: only(body),
        glass,
        lid: only(lid, 'gloss'),
        lamp,
        wheel: only(wheel),
        parcel: only(parcel),
        rim: only(rim),
    };
}

/** One instanced mesh whose instances move every frame. */
function pooled(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    shadow: boolean,
): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The instances spread along the whole rail, so there is nothing to cull.
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    return mesh;
}

/** Positive modulo. */
function mod(value: number, by: number): number {
    return ((value % by) + by) % by;
}

function smooth(t: number): number {
    const k = clamp(t);
    return k * k * (3 - 2 * k);
}

export function createChain(): Chain {
    const group = new THREE.Group();
    group.name = 'chain';

    // ----- Track, gatehouses and the dock: static -----
    const s = new Sculpt();
    buildTrack(s);
    buildPortal(s, -PORTAL_Z, false);
    buildPortal(s, PORTAL_Z, true);
    buildDock(s);
    group.add(s.build('chain'));

    // ----- The name board, with the open block's number -----
    let openSlot = 1;
    const sign = makeSign({
        width: 2.3,
        height: 0.74,
        text: '',
        background: '#fffaf0',
        border: ROOF_RIDGE,
        radius: 0.2,
        paint(context, width, height) {
            context.fillStyle = PALETTE.ink;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = `700 ${Math.round(height * 0.6)}px ${DISPLAY_FONT}`;
            context.fillText('CHAIN', width * 0.37, height * 0.54);
            // The slot plate.
            const plateW = width * 0.27;
            const plateH = height * 0.56;
            const plateX = width * 0.68;
            const plateY = (height - plateH) / 2;
            context.beginPath();
            context.roundRect(plateX, plateY, plateW, plateH, plateH * 0.3);
            context.fillStyle = '#3b3a4a';
            context.fill();
            const text = String(openSlot);
            let size = plateH * 0.74;
            context.font = `700 ${Math.round(size)}px ${DISPLAY_FONT}`;
            const measured = context.measureText(text).width;
            if (measured > plateW * 0.84) size = (size * plateW * 0.84) / measured;
            context.font = `700 ${Math.round(size)}px ${DISPLAY_FONT}`;
            context.fillStyle = '#9af0c2';
            context.fillText(text, plateX + plateW / 2, height * 0.53);
        },
    });
    sign.mesh.rotation.y = Math.PI / 2;
    sign.mesh.position.set(9.4 - 0.37 + 0.086, 2.32, DOCK_Z);
    group.add(sign.mesh);

    // ----- The signal lamp -----
    const signal = makeLamp(new THREE.IcosahedronGeometry(0.135, 2), PALETTE.ok, 0.8);
    signal.mesh.position.set(9.4 + 0.36, BED + 1.4, DOCK_Z + 1.12);
    group.add(signal.mesh);
    const signalColor = new THREE.Color(PALETTE.ok);
    const signalIdle = new THREE.Color(PALETTE.ok);
    let signalAt = -10;

    // ----- The wagons: a fixed pool, drawn as instances -----
    const parts = wagonParts();
    const bodies = pooled(parts.body, MATERIALS.solid, WAGONS, true);
    const wheels = pooled(parts.wheel, MATERIALS.solid, WAGONS * WHEELS.length, true);
    const lids = pooled(parts.lid, MATERIALS.gloss, WAGONS, true);
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.12,
        metalness: 0,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
    });
    const glass = pooled(parts.glass, glassMaterial, WAGONS, false);
    glass.renderOrder = 2;
    const lampMaterial = new THREE.MeshBasicMaterial({ toneMapped: true });
    const lamps = pooled(parts.lamp, lampMaterial, WAGONS, false);
    const parcels = pooled(parts.parcel, MATERIALS.gloss, PILES * PER_BLOCK, false);
    const rimMaterial = new THREE.MeshBasicMaterial({
        color: '#b6ffd9',
        transparent: true,
        opacity: 0.9,
        toneMapped: true,
        depthWrite: false,
    });
    const rim = new THREE.Mesh(parts.rim, rimMaterial);
    rim.matrixAutoUpdate = false;
    rim.frustumCulled = false;
    rim.renderOrder = 3;
    group.add(bodies, wheels, lids, lamps, parcels, glass, rim);
    const pools = [bodies, wheels, lids, lamps, parcels, glass];

    const hitbox = makeHitbox(2.8, 3.5, 5.4, [10.05, 0, DOCK_Z]);
    group.add(hitbox);

    // ----- State -----
    /** Seconds the chain has run; the blocks' positions follow from it alone. */
    let clock = 0;
    /** The slot each wagon carries; a wagon takes the next free slot when it re-enters. */
    const slotOf: number[] = [];
    const wagonMatrix: THREE.Matrix4[] = [];
    /** How far each lid is open (0 shut, 1 open) and how fast it is moving. */
    const lidAt = new Float32Array(WAGONS);
    const lidSpeed = new Float32Array(WAGONS);
    const sealed: boolean[] = [];
    /** When each wagon last opened or sealed, for a little squash. */
    const bumpAt = new Float32Array(WAGONS).fill(-10);
    /** Where the dock is, in spacings from `RAIL.zStart`. */
    const low = (RAIL.zStart - DOCK_Z) / SPACING;
    for (let w = 0; w < WAGONS; w += 1) {
        const raw = 0.5 - w;
        const slot = w + WAGONS * Math.floor((raw - low) / WAGONS);
        slotOf.push(slot);
        sealed.push(slot < 1);
        wagonMatrix.push(new THREE.Matrix4());
    }
    /** How many parcels each pile holds, and when each parcel landed. */
    const pileCount = new Uint8Array(PILES);
    const born = new Float32Array(PILES * PER_BLOCK).fill(-10);
    const yaw = new Float32Array(PILES * PER_BLOCK);
    for (let i = 0; i < yaw.length; i += 1) yaw[i] = Math.sin(i * 12.9898) * 0.16;
    let loadFlashAt = -10;

    const open = new THREE.Vector3(DOCK_X, BED + 0.42, DOCK_Z);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const local = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    const shift = new THREE.Matrix4();
    const color = new THREE.Color();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color('#ffffff');

    /** Where the open block is along the rail right now. */
    const openZ = (): number => {
        const travel = clock / SLOT_SECONDS;
        return DOCK_Z + (travel - Math.floor(travel) - 0.5) * SPACING;
    };

    const layout = (dt: number): void => {
        const travel = clock / SLOT_SECONDS;
        const current = 1 + Math.floor(travel);
        if (current !== openSlot) {
            openSlot = current;
            pileCount[mod(current, PILES)] = 0;
            signalAt = clock;
            sign.set({});
            chain.onSlot?.(current);
        }

        for (let w = 0; w < WAGONS; w += 1) {
            const raw = travel + 0.5 - w;
            const turns = Math.floor((raw - low) / WAGONS);
            const slot = w + WAGONS * turns;
            const z = DOCK_Z + (raw - WAGONS * turns) * SPACING;
            if (slot !== slotOf[w]) {
                // The wagon has gone round: it comes back as a new, empty block.
                slotOf[w] = slot;
                sealed[w] = false;
                lidAt[w] = 0;
                lidSpeed[w] = 0;
            }
            const isOpen = slot === openSlot;

            // The lid: a spring towards open or shut, with a clack when it lands.
            const target = isOpen ? 1 : 0;
            let at = lidAt[w] as number;
            let speed = lidSpeed[w] as number;
            const steps = Math.max(1, Math.ceil(dt / 0.008));
            const h = dt / steps;
            for (let i = 0; i < steps; i += 1) {
                speed += (170 * (target - at) - 13 * speed) * h;
                at += speed * h;
                if (at < 0) {
                    at = 0;
                    if (!isOpen && slot < openSlot && !sealed[w]) {
                        sealed[w] = true;
                        bumpAt[w] = clock;
                    }
                    speed = speed < -0.8 ? -speed * 0.3 : 0;
                }
            }
            if (isOpen && lidAt[w] === 0 && at > 0) bumpAt[w] = clock;
            lidAt[w] = at;
            lidSpeed[w] = speed;

            // Inside a gatehouse the wagon grows from nothing or shrinks to nothing.
            const size = smooth((z + HIDE_Z) / HIDE_RUN) * (1 - smooth((z - (HIDE_Z - HIDE_RUN)) / HIDE_RUN));
            // A squash and a wobble when it opens or seals.
            const k = clamp((clock - (bumpAt[w] as number)) / 0.4);
            const squash = k < 1 ? 1 - 0.1 * Math.sin(k * Math.PI * 3) * Math.pow(1 - k, 1.5) : 1;
            const wide = 1 + (1 - squash) * 0.5;
            position.set(RAIL.x, Math.abs(Math.sin((z / 0.59) * Math.PI)) * 0.006, z);
            quaternion.setFromEuler(euler.set(0, 0, Math.sin(clock * 2.6 + w * 1.7) * 0.01));
            scale.set(size * wide, size * squash, size * wide);
            const base = wagonMatrix[w] as THREE.Matrix4;
            base.compose(position, quaternion, scale);
            bodies.setMatrixAt(w, base);
            glass.setMatrixAt(w, base);

            // The wheels turn as they roll.
            const spin = z / WHEEL_R;
            for (let j = 0; j < WHEELS.length; j += 1) {
                const [x, along] = WHEELS[j] as readonly [number, number];
                local.makeRotationX(spin);
                local.setPosition(x * GAUGE, RAIL_TOP + WHEEL_R, along);
                wheels.setMatrixAt(w * WHEELS.length + j, matrix.multiplyMatrices(base, local));
            }

            // The lid and the lamp on its front edge.
            local.makeRotationX(-at * LID_OPEN);
            local.setPosition(0, BED + CUBE_H, -0.47);
            matrix.multiplyMatrices(base, local);
            lids.setMatrixAt(w, matrix);
            shift.makeTranslation(0, 0.17, 0.84);
            lamps.setMatrixAt(w, matrix.multiply(shift));

            // Colours: waiting, open or sealed.
            const pulse = 0.5 + 0.5 * Math.sin(clock * 5.2);
            if (sealed[w]) {
                const flash = 1 - clamp((clock - (bumpAt[w] as number)) / 0.5);
                lids.setColorAt(w, color.copy(LID_SEALED).lerp(white, flash * 0.6));
                glass.setColorAt(w, GLASS_SEALED);
                lamps.setColorAt(w, color.copy(LAMP_SEALED).multiplyScalar(0.95 + flash * 0.9));
            } else if (isOpen || at > 0.02) {
                const flash = 1 - clamp((clock - loadFlashAt) / 0.35);
                lids.setColorAt(w, LID_OPEN_COLOR);
                glass.setColorAt(w, GLASS_OPEN);
                lamps.setColorAt(
                    w,
                    color
                        .copy(LAMP_OPEN)
                        .multiplyScalar(0.9 + pulse * 0.6)
                        .lerp(white, flash * 0.7),
                );
            } else {
                lids.setColorAt(w, LID_PENDING);
                glass.setColorAt(w, GLASS_PENDING);
                // Unlit: the same dull glass by day and by night.
                lamps.setColorAt(w, color.copy(LAMP_PENDING).multiplyScalar(0.5 / lampMaterial.color.r));
            }

            if (isOpen) {
                rim.matrix.copy(base);
                rimMaterial.opacity = clamp(at * 1.4) * (0.62 + pulse * 0.3) * size;
            }
        }

        // Parcels ride with their block.
        for (let pile = 0; pile < PILES; pile += 1) {
            // The newest slot at or before the open one that uses this pile.
            const slot = openSlot - mod(openSlot - pile, PILES);
            const w = mod(slot, WAGONS);
            const riding = slotOf[w] === slot;
            const base = wagonMatrix[w] as THREE.Matrix4;
            const count = pileCount[pile] as number;
            for (let i = 0; i < PER_BLOCK; i += 1) {
                const index = pile * PER_BLOCK + i;
                if (!riding || i >= count) {
                    parcels.setMatrixAt(index, hidden);
                    continue;
                }
                const spot = PILE[i] as readonly [number, number, number];
                const k = clamp((clock - (born[index] as number)) / 0.42);
                const pop = ease.outBack(k);
                local.makeRotationY(yaw[index] as number);
                local.scale(scale.set(pop, pop * (0.85 + 0.15 * k), pop));
                local.setPosition(spot[0], BED + 0.012 + spot[1] * PARCEL_H + (1 - ease.outBounce(k)) * 0.3, spot[2]);
                parcels.setMatrixAt(index, matrix.multiplyMatrices(base, local));
            }
        }

        for (const mesh of pools) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }

        // Lamps brighten with the night, as the town's other lights do.
        const glow = clamp((MATERIALS.lit.color.r - 0.95) / 0.35, 0, 2.2);
        lampMaterial.color.setScalar(0.8 + glow * 0.35);
        rimMaterial.color.set('#b6ffd9').multiplyScalar(0.95 + glow * 0.25);

        // The signal: a calm green, a blink for a new block, a flash in the colour of what was loaded.
        const sinceLoad = clock - loadFlashAt;
        const sinceSlot = clock - signalAt;
        if (sinceLoad < 0.7)
            signal.set(
                color
                    .copy(signalColor)
                    .lerp(signalIdle, smooth(sinceLoad / 0.7))
                    .getHex(),
                1.7 - sinceLoad * 1.2,
            );
        else if (sinceSlot < 0.3) signal.set('#f3fff8', 1.5);
        else signal.set(PALETTE.ok, 0.7 + 0.12 * Math.sin(clock * 2.2));
        open.z = openZ();
    };

    const chain: Chain = {
        group,
        hitbox,
        anchors: {
            label: anchor(group, 9.3, 2.85, DOCK_Z),
            dock: anchor(group, 9.48, BED + 0.3, DOCK_Z - 0.02),
        },
        slot: () => openSlot,
        openBlock() {
            open.z = openZ();
            return open;
        },
        load(kind) {
            const pile = mod(openSlot, PILES);
            const count = pileCount[pile] as number;
            const i = Math.min(count, PER_BLOCK - 1);
            const index = pile * PER_BLOCK + i;
            pileCount[pile] = i + 1;
            born[index] = clock;
            parcels.setColorAt(index, color.set(KIND_COLOR[kind]));
            signalColor.set(KIND_COLOR[kind]);
            loadFlashAt = clock;
            return openSlot;
        },
        onSlot: undefined,
        update(dt) {
            // A stage's first frame can report a hair of negative time.
            const step = Math.max(dt, 0);
            clock += step;
            layout(step);
        },
    };

    // Every parcel needs a colour before the first draw.
    for (let i = 0; i < PILES * PER_BLOCK; i += 1) parcels.setColorAt(i, white);
    layout(0);
    return chain;
}
