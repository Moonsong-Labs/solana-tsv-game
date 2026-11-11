/**
 * What every place in the town exposes to the director and the stage.
 */
import * as THREE from 'three';

import { PALETTE, gableHeight, type Hex, type Sculpt } from '../scene/kit.ts';

export interface Place {
    /** The model, positioned on the island. */
    group: THREE.Group;
    /** Named world positions: `label` (where the name tag floats), `door`, and whatever the place offers. */
    anchors: Record<string, THREE.Vector3>;
    /** A simple invisible volume for clicks, already inside `group`. */
    hitbox: THREE.Mesh;
    /** Per-frame animation. */
    update?(dt: number, time: number): void;
}

const HITBOX_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

/** An invisible box for picking: `w` by `h` by `d`, standing on the ground at the group's origin (or offset). */
export function makeHitbox(
    w: number,
    h: number,
    d: number,
    offset: readonly [number, number, number] = [0, 0, 0],
): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HITBOX_MATERIAL);
    mesh.position.set(offset[0], offset[1] + h / 2, offset[2]);
    mesh.name = 'hitbox';
    return mesh;
}

/** The world position of a point given in a group's local coordinates. */
export function anchor(group: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
    group.updateMatrixWorld(true);
    return group.localToWorld(new THREE.Vector3(x, y, z));
}

/**
 * A paper-screen window on the +Z face of a wall: a wooden frame around a
 * glowing pane with a lattice. `at` is the centre of the window's bottom
 * edge, on the wall's surface. Wrap it in a group rotated by π/2 about Y to
 * put it on a +X face.
 */
export function shojiWindow(
    s: Sculpt,
    at: readonly [number, number, number],
    w: number,
    h: number,
    frame: Hex = PALETTE.woodDark,
    columns = 3,
    rows = 2,
): void {
    s.group({ at }, (g) => {
        g.box(w + 0.14, h + 0.14, 0.08, { color: frame, at: [0, -0.07, 0], r: 0.03 });
        g.box(w, h, 0.1, { color: PALETTE.windowWarm, at: [0, 0, 0.01], layer: 'window', r: 0.01 });
        for (let i = 1; i < columns; i += 1)
            g.box(0.03, h, 0.03, { color: frame, at: [-w / 2 + (w / columns) * i, 0, 0.06], r: 0.008 });
        for (let j = 1; j < rows; j += 1)
            g.box(w, 0.03, 0.03, { color: frame, at: [0, (h / rows) * j - 0.015, 0.06], r: 0.008 });
        g.box(w + 0.26, 0.06, 0.16, { color: frame, at: [0, -0.12, 0.04], r: 0.02 });
    });
}

/**
 * A split curtain hanging over a doorway on a +Z face. `at` is the centre of
 * its top edge. `mark` adds a pale dot on each strip.
 */
export function noren(
    s: Sculpt,
    at: readonly [number, number, number],
    w: number,
    h: number,
    color: Hex,
    strips = 3,
    mark: Hex | undefined = PALETTE.paper,
): void {
    s.group({ at }, (g) => {
        g.cyl(0.03, 0.03, w + 0.2, {
            color: PALETTE.woodDeep,
            at: [-(w + 0.2) / 2, 0, 0.05],
            rot: [0, 0, -Math.PI / 2],
            seg: 6,
        });
        const each = w / strips;
        for (let i = 0; i < strips; i += 1) {
            const x = -w / 2 + each * (i + 0.5);
            g.box(each - 0.04, h, 0.03, { color, at: [x, -h - 0.02, 0.05], r: 0.012 });
            if (mark !== undefined)
                g.cyl(each * 0.2, each * 0.2, 0.012, {
                    color: mark,
                    at: [x, -h * 0.55, 0.068],
                    rot: [Math.PI / 2, 0, 0],
                    seg: 14,
                });
        }
    });
}

/**
 * The tiled ridge of a gable roof whose ridge runs along Z: a cap with end
 * ornaments. `at` is the centre of the ridge line.
 */
export function ridgeCap(s: Sculpt, at: readonly [number, number, number], length: number, color: Hex): void {
    s.group({ at }, (g) => {
        g.cyl(0.1, 0.1, length, { color, at: [0, 0, -length / 2], rot: [Math.PI / 2, 0, 0], seg: 10, layer: 'gloss' });
        for (const end of [-1, 1]) {
            g.box(0.26, 0.3, 0.14, { color, at: [0, -0.1, (end * length) / 2], r: 0.05, layer: 'gloss' });
        }
    });
}

/**
 * A complete gable roof on a rectangular building: the tiled slab with its
 * overhang, the two gable walls under it and the ridge cap, all aligned.
 * `at` is the centre of the wall tops. `span` is the wall width across the
 * ridge and `length` the wall length along it. The ridge runs along `along`.
 */
export function gabledRoof(
    s: Sculpt,
    opts: {
        at: readonly [number, number, number];
        span: number;
        length: number;
        rise: number;
        color: Hex;
        wall: Hex;
        along?: 'x' | 'z';
        overhang?: number;
        /** How far the roof runs past the gable walls. */
        eave?: number;
        thickness?: number;
        ridge?: Hex;
    },
): void {
    const overhang = opts.overhang ?? 0.5;
    const eave = opts.eave ?? 0.4;
    const thickness = opts.thickness ?? 0.15;
    const w = opts.span + overhang * 2;
    const meet = gableHeight(w, opts.rise, opts.span / 2);
    s.group({ at: opts.at, rot: [0, opts.along === 'x' ? Math.PI / 2 : 0, 0] }, (g) => {
        g.gableFill(w, opts.length - 0.02, opts.rise - thickness, {
            color: opts.wall,
            span: opts.span - 0.02,
            at: [0, -0.02, 0],
        });
        g.gableRoof(w, opts.length + eave * 2, opts.rise, {
            color: opts.color,
            at: [0, thickness - meet, 0],
            thickness,
            layer: 'gloss',
        });
        ridgeCap(
            g,
            [0, opts.rise + thickness - meet + 0.02, 0],
            opts.length + eave * 2 + 0.1,
            opts.ridge ?? opts.color,
        );
    });
}

/**
 * A complete hipped roof with upturned corners, hip ridges and a finial.
 * `at` is the centre of the wall tops; `w` and `d` are the wall footprint.
 */
export function hippedRoof(
    s: Sculpt,
    opts: {
        at: readonly [number, number, number];
        w: number;
        d: number;
        rise: number;
        color: Hex;
        overhang?: number;
        tip?: number;
        finial?: Hex;
        /** Length of the ridge; 0 makes a pyramid. */
        ridge?: number;
    },
): void {
    const overhang = opts.overhang ?? 0.55;
    const w = opts.w + overhang * 2;
    const d = opts.d + overhang * 2;
    s.group({ at: opts.at }, (g) => {
        g.hipRoof(w, d, opts.rise, {
            color: opts.color,
            at: [0, 0.02, 0],
            tip: opts.tip ?? 0.16,
            ridge: opts.ridge ?? 0,
            layer: 'gloss',
        });
        if (opts.finial !== undefined) {
            g.cyl(0.05, 0.08, 0.3, { color: opts.finial, at: [0, opts.rise, 0], seg: 8, layer: 'gloss' });
            g.ball(0.12, { color: opts.finial, at: [0, opts.rise + 0.36, 0], detail: 2, layer: 'gloss' });
        }
    });
}
