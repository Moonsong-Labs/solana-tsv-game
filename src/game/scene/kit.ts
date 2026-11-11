/**
 * The modelling kit: every model in the town is sculpted from these parts.
 *
 * A `Sculpt` collects primitives, bakes their transform and colour into the
 * vertices, and merges them into one mesh per layer. A whole building is then
 * a handful of draw calls, which keeps the diorama smooth on laptops.
 *
 * Conventions: Y is up, one unit is roughly a doorway's width, and a model's
 * origin is the centre of its footprint on the ground. The camera sees the +X
 * and +Z faces, so fronts, doors and signs go on those.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];
export type Hex = string | number;

/**
 * Which shared material a part uses.
 * - `solid`: matte clay, the default.
 * - `gloss`: glazed (roof tiles, ceramics, lacquer).
 * - `glass`: translucent.
 * - `window`: a pane that looks pale by day and glows warm at night.
 * - `lit`: always glowing (screens, signal lamps that never change).
 */
export type Layer = 'solid' | 'gloss' | 'glass' | 'window' | 'lit';

const LAYERS: readonly Layer[] = ['solid', 'gloss', 'glass', 'window', 'lit'];

export interface PartOpts {
    /** Where the part's anchor goes. Boxes, cylinders, cones and roofs anchor at the centre of their base; spheres and tori at their centre. */
    at?: V3;
    /** Euler XYZ rotation in radians, about the anchor. */
    rot?: V3;
    scale?: V3 | number;
    color: Hex;
    /** An optional second colour: the part fades from `color` at its bottom to `top` at its top. */
    top?: Hex;
    layer?: Layer;
    /** Faceted instead of smooth shading. */
    flat?: boolean;
}

/** The shared materials. The stage tunes them (window glow follows the time of day). */
export const MATERIALS = {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.02 }),
    glass: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.15,
        metalness: 0,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
    }),
    window: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
    lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
} satisfies Record<Layer, THREE.Material>;

const scratchColor = new THREE.Color();
const scratchTop = new THREE.Color();

function composeMatrix(at: V3 | undefined, rot: V3 | undefined, scale: V3 | number | undefined): THREE.Matrix4 {
    const position = new THREE.Vector3(...(at ?? [0, 0, 0]));
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]), 'XYZ'));
    const size =
        typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...(scale ?? [1, 1, 1]));
    return new THREE.Matrix4().compose(position, quaternion, size);
}

/** Collects parts and merges them into a model. */
export class Sculpt {
    private readonly parts: Record<Layer, THREE.BufferGeometry[]> = {
        solid: [],
        gloss: [],
        glass: [],
        window: [],
        lit: [],
    };
    private readonly stack: THREE.Matrix4[] = [new THREE.Matrix4()];

    /** Runs `build` with every part placed relative to the given transform. */
    group(transform: { at?: V3; rot?: V3; scale?: V3 | number }, build: (sculpt: this) => void): this {
        const top = this.stack[this.stack.length - 1] as THREE.Matrix4;
        this.stack.push(top.clone().multiply(composeMatrix(transform.at, transform.rot, transform.scale)));
        build(this);
        this.stack.pop();
        return this;
    }

    /** Adds any geometry. `lift` moves it up first, to anchor a centred shape at its base. */
    geo(geometry: THREE.BufferGeometry, opts: PartOpts, lift = 0): this {
        let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        if (opts.flat) g.computeVertexNormals();
        for (const name of Object.keys(g.attributes)) {
            if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        if (lift !== 0) g.translate(0, lift, 0);

        const position = g.attributes.position as THREE.BufferAttribute;
        const colors = new Float32Array(position.count * 3);
        scratchColor.set(opts.color);
        if (opts.top === undefined) {
            for (let i = 0; i < position.count; i += 1) {
                colors[i * 3] = scratchColor.r;
                colors[i * 3 + 1] = scratchColor.g;
                colors[i * 3 + 2] = scratchColor.b;
            }
        } else {
            scratchTop.set(opts.top);
            g.computeBoundingBox();
            const box = g.boundingBox as THREE.Box3;
            const span = Math.max(box.max.y - box.min.y, 1e-6);
            for (let i = 0; i < position.count; i += 1) {
                const t = (position.getY(i) - box.min.y) / span;
                colors[i * 3] = scratchColor.r + (scratchTop.r - scratchColor.r) * t;
                colors[i * 3 + 1] = scratchColor.g + (scratchTop.g - scratchColor.g) * t;
                colors[i * 3 + 2] = scratchColor.b + (scratchTop.b - scratchColor.b) * t;
            }
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const top = this.stack[this.stack.length - 1] as THREE.Matrix4;
        g.applyMatrix4(top.clone().multiply(composeMatrix(opts.at, opts.rot, opts.scale)));
        this.parts[opts.layer ?? 'solid'].push(g);
        return this;
    }

    /** A box with softly rounded edges, anchored at the centre of its base. `r` is the corner radius. */
    box(w: number, h: number, d: number, opts: PartOpts & { r?: number }): this {
        const limit = Math.min(w, h, d) / 2;
        const r = Math.min(opts.r ?? 0.05, limit * 0.98);
        const geometry = r > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
        return this.geo(geometry, opts, h / 2);
    }

    /** A cylinder or tapered cylinder, anchored at the centre of its base. */
    cyl(rTop: number, rBottom: number, h: number, opts: PartOpts & { seg?: number }): this {
        return this.geo(new THREE.CylinderGeometry(rTop, rBottom, h, opts.seg ?? 20), opts, h / 2);
    }

    /** A cone, anchored at the centre of its base. */
    cone(r: number, h: number, opts: PartOpts & { seg?: number }): this {
        return this.geo(new THREE.ConeGeometry(r, h, opts.seg ?? 20), opts, h / 2);
    }

    /** A sphere, anchored at its centre. Squash it with `scale`. */
    ball(r: number, opts: PartOpts & { detail?: number }): this {
        return this.geo(new THREE.IcosahedronGeometry(r, opts.detail ?? 3), opts);
    }

    /** A capsule standing on Y, anchored at the centre of its base. `h` is the full height. */
    capsule(r: number, h: number, opts: PartOpts): this {
        return this.geo(new THREE.CapsuleGeometry(r, Math.max(h - 2 * r, 0.001), 6, 14), opts, h / 2);
    }

    /** A torus lying flat (its hole points up), anchored at its centre. */
    torus(r: number, tube: number, opts: PartOpts & { arc?: number; seg?: number }): this {
        const geometry = new THREE.TorusGeometry(r, tube, 10, opts.seg ?? 28, opts.arc ?? Math.PI * 2);
        geometry.rotateX(Math.PI / 2);
        return this.geo(geometry, opts);
    }

    /** A shape turned on a lathe: `profile` is a list of [radius, height] from bottom to top. */
    lathe(profile: ReadonlyArray<readonly [number, number]>, opts: PartOpts & { seg?: number }): this {
        const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
        return this.geo(new THREE.LatheGeometry(points, opts.seg ?? 24), opts);
    }

    /** A round tube along a smooth path through `points`. */
    tube(points: readonly V3[], radius: number, opts: PartOpts & { seg?: number; closed?: boolean }): this {
        const curve = new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(...p)),
            opts.closed ?? false,
            'catmullrom',
            0.5,
        );
        return this.geo(
            new THREE.TubeGeometry(curve, opts.seg ?? points.length * 8, radius, 8, opts.closed ?? false),
            opts,
        );
    }

    /**
     * A flat outline in the XY plane, pushed `depth` deep along Z and centred
     * on Z. `outline` lists [x, y] corners counter-clockwise; `bevel` rounds
     * the edges.
     */
    extrude(
        outline: ReadonlyArray<readonly [number, number]>,
        depth: number,
        opts: PartOpts & { bevel?: number },
    ): this {
        const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
        return this.shape(shape, depth, opts);
    }

    /** Like `extrude`, for a THREE.Shape with curves. */
    shape(shape: THREE.Shape, depth: number, opts: PartOpts & { bevel?: number }): this {
        const bevel = opts.bevel ?? 0;
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: Math.max(depth - 2 * bevel, 0.001),
            bevelEnabled: bevel > 0,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 2,
            curveSegments: 14,
        });
        geometry.translate(0, 0, -Math.max(depth - 2 * bevel, 0.001) / 2);
        return this.geo(geometry, opts);
    }

    /**
     * A gable roof: two slopes meeting at a ridge that runs along Z. The
     * slopes sag gently, as tiled Japanese roofs do. `w` spans the eaves
     * (overhang included), `d` is the ridge length, `h` the rise. Anchored at
     * the centre of the eave line.
     */
    gableRoof(w: number, d: number, h: number, opts: PartOpts & { thickness?: number; sag?: number }): this {
        const t = opts.thickness ?? 0.14;
        const sag = opts.sag ?? 0.22;
        const cy = h * (0.5 - sag);
        const shape = new THREE.Shape();
        shape.moveTo(-w / 2, 0);
        shape.quadraticCurveTo(-w / 4, cy, 0, h);
        shape.quadraticCurveTo(w / 4, cy, w / 2, 0);
        shape.lineTo(w / 2, -t);
        shape.quadraticCurveTo(w / 4, cy - t, 0, h - t * 1.25);
        shape.quadraticCurveTo(-w / 4, cy - t, -w / 2, -t);
        shape.closePath();
        return this.shape(shape, d, { ...opts, bevel: 0.02 });
    }

    /**
     * The wall that fills a gable under a `gableRoof` with the same `w`, `h`
     * and `sag`: a solid wedge `d` deep whose top follows the roof. `span` is
     * the width of the wall below it (the roof's `w` minus the overhangs).
     * Anchored at the centre of its base, which sits where the roof's outer
     * surface crosses the wall line: `gableHeight(w, h, span / 2, sag)` above
     * the eave line.
     */
    gableFill(w: number, d: number, h: number, opts: PartOpts & { sag?: number; span?: number }): this {
        const sag = opts.sag ?? 0.22;
        const half = Math.min((opts.span ?? w) / 2, w / 2);
        const base = gableHeight(w, h, half, sag);
        const outline: [number, number][] = [];
        const steps = 16;
        for (let i = 0; i <= steps; i += 1) {
            const x = half - (2 * half * i) / steps;
            outline.push([x, gableHeight(w, h, x, sag) - base]);
        }
        return this.extrude(outline, d, opts);
    }

    /**
     * A hipped roof: four sagging slopes over a `w` by `d` footprint (eaves
     * included), rising `h` to a point or, when `ridge` is set, to a ridge of
     * that length along the longer side. `tip` lifts the corners of the eaves,
     * the upturned look of pagodas and shrines. Anchored at the centre of the
     * eave line.
     */
    hipRoof(
        w: number,
        d: number,
        h: number,
        opts: PartOpts & { ridge?: number; tip?: number; sag?: number; thickness?: number },
    ): this {
        return this.geo(
            hipRoofGeometry(w, d, h, opts.ridge ?? 0, opts.tip ?? 0.12, opts.sag ?? 1.7, opts.thickness ?? 0.1),
            opts,
        );
    }

    /** True when nothing has been added. */
    get empty(): boolean {
        return LAYERS.every((layer) => this.parts[layer].length === 0);
    }

    /** Merges the parts into a group with one mesh per layer used. */
    build(name?: string): THREE.Group {
        const group = new THREE.Group();
        if (name) group.name = name;
        for (const layer of LAYERS) {
            const list = this.parts[layer];
            if (list.length === 0) continue;
            const merged = mergeGeometries(list, false);
            for (const g of list) g.dispose();
            if (!merged) continue;
            const mesh = new THREE.Mesh(merged, MATERIALS[layer]);
            mesh.name = name ? `${name}:${layer}` : layer;
            const opaque = layer === 'solid' || layer === 'gloss';
            mesh.castShadow = opaque;
            mesh.receiveShadow = opaque;
            if (layer === 'glass') mesh.renderOrder = 2;
            group.add(mesh);
            this.parts[layer] = [];
        }
        return group;
    }
}

/**
 * How high a gable roof's outer surface is above its eave line, `x` away from
 * the ridge. `w`, `h` and `sag` are the roof's.
 */
export function gableHeight(w: number, h: number, x: number, sag = 0.22): number {
    const s = 1 - Math.min(Math.abs(x) / (w / 2), 1);
    const cy = h * (0.5 - sag);
    return 2 * (1 - s) * s * cy + s * s * h;
}

/** Rings of eight points (corners and edge midpoints) from the eaves up; see `Sculpt.hipRoof`. */
function hipRoofGeometry(
    w: number,
    d: number,
    h: number,
    ridge: number,
    tip: number,
    sag: number,
    thickness: number,
): THREE.BufferGeometry {
    const steps = 7;
    const alongZ = d >= w;
    const topX = alongZ ? 0 : ridge / 2;
    const topZ = alongZ ? ridge / 2 : 0;
    const rings: THREE.Vector3[][] = [];
    const ringAt = (t: number, drop: number): THREE.Vector3[] => {
        // The inset grows quickly near the eaves and slowly near the top, so
        // the slope is shallow at the eaves and steep at the peak.
        const s = 1 - Math.pow(1 - t, sag);
        const x = w / 2 + (topX - w / 2) * s;
        const z = d / 2 + (topZ - d / 2) * s;
        const y = h * t - drop;
        const lift = tip * Math.pow(1 - t, 3);
        return [
            new THREE.Vector3(x, y + lift, z),
            new THREE.Vector3(0, y, z),
            new THREE.Vector3(-x, y + lift, z),
            new THREE.Vector3(-x, y, 0),
            new THREE.Vector3(-x, y + lift, -z),
            new THREE.Vector3(0, y, -z),
            new THREE.Vector3(x, y + lift, -z),
            new THREE.Vector3(x, y, 0),
        ];
    };
    // A lip under the eaves gives the roof its thickness.
    rings.push(ringAt(0, thickness).map((p) => p.multiply(new THREE.Vector3(0.97, 1, 0.97))));
    for (let i = 0; i <= steps; i += 1) rings.push(ringAt(i / steps, 0));

    const vertices: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, e: THREE.Vector3): void => {
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, e.x, e.y, e.z);
    };
    for (let r = 0; r < rings.length - 1; r += 1) {
        const lower = rings[r] as THREE.Vector3[];
        const upper = rings[r + 1] as THREE.Vector3[];
        for (let i = 0; i < 8; i += 1) {
            const j = (i + 1) % 8;
            quad(
                lower[i] as THREE.Vector3,
                upper[i] as THREE.Vector3,
                upper[j] as THREE.Vector3,
                lower[j] as THREE.Vector3,
            );
        }
    }
    // Close the underside and the top.
    const bottom = rings[0] as THREE.Vector3[];
    const top = rings[rings.length - 1] as THREE.Vector3[];
    const fan = (ring: THREE.Vector3[], flip: boolean): void => {
        const centre = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
        for (let i = 0; i < 8; i += 1) {
            const a = ring[i] as THREE.Vector3;
            const b = ring[(i + 1) % 8] as THREE.Vector3;
            if (flip) vertices.push(centre.x, centre.y, centre.z, b.x, b.y, b.z, a.x, a.y, a.z);
            else vertices.push(centre.x, centre.y, centre.z, a.x, a.y, a.z, b.x, b.y, b.z);
        }
    };
    fan(bottom, false);
    fan(top, true);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/** Options for a text sign drawn on a canvas. */
export interface SignOpts {
    /** World width of the sign; the height follows from the canvas aspect. */
    width: number;
    height: number;
    text: string;
    /** A smaller second line. */
    sub?: string;
    color?: string;
    background?: string;
    /** Border colour; no border when omitted. */
    border?: string;
    /** Corner radius as a fraction of the height. */
    radius?: number;
    font?: string;
    weight?: number;
    /** Pixels per world unit. */
    density?: number;
    /** Draws on top of the default text, for icons and seals. */
    paint?: (context: CanvasRenderingContext2D, width: number, height: number) => void;
    /** Glows (ignores the lighting) when true. */
    lit?: boolean;
}

export const DISPLAY_FONT =
    '"Fredoka Variable", "Fredoka", ui-rounded, "Hiragino Maru Gothic ProN", system-ui, sans-serif';

/**
 * The painted signs' materials. From dusk on they glow a little, like lit paper, so the town's
 * own texts (prices, states, names) stay readable in the dark; the stage sets how much.
 */
const SIGN_MATERIALS = new Set<THREE.MeshStandardMaterial>();

/** Sets how strongly painted signs light themselves: 0 by day. */
export function setSignGlow(level: number): void {
    for (const material of SIGN_MATERIALS) material.emissiveIntensity = level;
}

/** Forgets the signs of a stage that was torn down. */
export function forgetSigns(): void {
    SIGN_MATERIALS.clear();
}

/** A sign whose text can be redrawn. */
export interface Sign {
    mesh: THREE.Mesh;
    set(patch: Partial<SignOpts>): void;
}

/**
 * A flat sign with text, facing +Z. Rotate it by π/2 about Y to face +X.
 * Redraw it with `set` (prices, slot numbers, states).
 */
export function makeSign(initial: SignOpts): Sign {
    let opts = { ...initial };
    const density = opts.density ?? 160;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(opts.width * density));
    canvas.height = Math.max(8, Math.round(opts.height * density));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = opts.lit
        ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: true })
        : new THREE.MeshStandardMaterial({
              map: texture,
              transparent: true,
              roughness: 0.8,
              metalness: 0,
              emissive: '#ffffff',
              emissiveMap: texture,
              emissiveIntensity: 0,
          });
    if (material instanceof THREE.MeshStandardMaterial) SIGN_MATERIALS.add(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, opts.height), material);
    mesh.receiveShadow = !opts.lit;

    const draw = (): void => {
        const context = canvas.getContext('2d');
        if (!context) return;
        const { width, height } = canvas;
        context.clearRect(0, 0, width, height);
        const radius = (opts.radius ?? 0.18) * height;
        if (opts.background) {
            context.beginPath();
            context.roundRect(0, 0, width, height, radius);
            context.fillStyle = opts.background;
            context.fill();
        }
        if (opts.border) {
            const line = Math.max(2, height * 0.07);
            context.beginPath();
            context.roundRect(line / 2, line / 2, width - line, height - line, Math.max(radius - line / 2, 0));
            context.lineWidth = line;
            context.strokeStyle = opts.border;
            context.stroke();
        }
        context.fillStyle = opts.color ?? '#3b2f2a';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const weight = opts.weight ?? 600;
        const family = opts.font ?? DISPLAY_FONT;
        const fit = (text: string, size: number, maxWidth: number): number => {
            let px = size;
            context.font = `${weight} ${px}px ${family}`;
            const measured = context.measureText(text).width;
            if (measured > maxWidth) px = Math.floor((px * maxWidth) / measured);
            context.font = `${weight} ${px}px ${family}`;
            return px;
        };
        if (opts.sub) {
            fit(opts.text, height * 0.46, width * 0.88);
            context.fillText(opts.text, width / 2, height * 0.38);
            fit(opts.sub, height * 0.24, width * 0.88);
            context.globalAlpha = 0.8;
            context.fillText(opts.sub, width / 2, height * 0.74);
            context.globalAlpha = 1;
        } else if (opts.text) {
            fit(opts.text, height * 0.6, width * 0.86);
            context.fillText(opts.text, width / 2, height * 0.53);
        }
        opts.paint?.(context, width, height);
        texture.needsUpdate = true;
    };
    draw();

    return {
        mesh,
        set(patch) {
            opts = { ...opts, ...patch };
            draw();
        },
    };
}

/** A coloured lamp that can change colour and brightness (signal lamps, lanterns). */
export interface Lamp {
    mesh: THREE.Mesh;
    /** Sets the colour and how strongly it glows: 0 is off (a dull tint), 1 is lit, above 1 blooms. */
    set(color: Hex, glow?: number): void;
}

/** A glowing ball or custom shape whose colour changes at run time. */
export function makeLamp(geometry: THREE.BufferGeometry, color: Hex, glow = 1): Lamp {
    const material = new THREE.MeshBasicMaterial({ toneMapped: true });
    const mesh = new THREE.Mesh(geometry, material);
    const base = new THREE.Color();
    const set = (next: Hex, strength = 1): void => {
        base.set(next);
        // Off still shows the lamp's tint, as dull glass.
        const k = 0.28 + strength * 1.1;
        material.color.setRGB(base.r * k, base.g * k, base.b * k);
    };
    set(color, glow);
    return { mesh, set };
}

/** The town's palette. Models take their colours from here so the diorama stays in one key. */
export const PALETTE = {
    // Ground
    grass: '#b9d99a',
    grassDeep: '#9fca84',
    grassLight: '#cfe6ad',
    path: '#efe2c6',
    pathEdge: '#dcc9a3',
    stone: '#cfc8bd',
    stoneDark: '#aaa397',
    earth: '#c99b74',
    earthDeep: '#a87854',
    earthDark: '#8a5f43',
    water: '#86d6d0',
    waterDeep: '#58b9bd',
    // Buildings
    plaster: '#fff6e6',
    plasterShade: '#f1e2c8',
    wood: '#c08e62',
    woodDark: '#8f6445',
    woodDeep: '#6a4a36',
    charcoal: '#4a4550',
    paper: '#fffaf0',
    // Signature roofs: a step quieter than the gate's vermilion, so the gate is the town's one loud red.
    roofCoral: '#e39a80',
    roofIndigo: '#7b8bcb',
    roofJade: '#54a99a',
    roofPlum: '#9a80bf',
    roofSlate: '#66708a',
    roofMustard: '#e0b862',
    vermilion: '#e8574a',
    // Accents
    gold: '#f3c45a',
    lantern: '#ffd88a',
    windowWarm: '#ffe2a6',
    blossom: '#f9bfd0',
    blossomDeep: '#f29bb6',
    maple: '#f08a4b',
    pine: '#6fae7c',
    pineDeep: '#4e8e68',
    bamboo: '#93c572',
    // Tokens and signals
    stock: '#f2798f',
    usdc: '#4d8fe8',
    ice: '#bfe9ff',
    ok: '#59c98a',
    warn: '#f5b547',
    stop: '#ee5d50',
    ink: '#3b2f2a',
    white: '#ffffff',
} as const;

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Clamps `v` to [min, max]. */
export function clamp(v: number, min = 0, max = 1): number {
    return Math.min(max, Math.max(min, v));
}

/** Moves `current` towards `target` with frame-rate independent smoothing; `rate` is how fast per second. */
export function damp(current: number, target: number, rate: number, dt: number): number {
    return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** A small deterministic random generator, so the town looks the same on every load. */
export function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Easing curves for tweens. */
export const ease = {
    linear: (t: number): number => t,
    inOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t: number): number => 1 - Math.pow(1 - t, 3),
    in: (t: number): number => t * t * t,
    outBack: (t: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outBounce: (t: number): number => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t - 1.5 / d1) * (t - 1.5 / d1) + 0.75;
        if (t < 2.5 / d1) return n1 * (t - 2.25 / d1) * (t - 2.25 / d1) + 0.9375;
        return n1 * (t - 2.625 / d1) * (t - 2.625 / d1) + 0.984375;
    },
    outElastic: (t: number): number => {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
} as const;
