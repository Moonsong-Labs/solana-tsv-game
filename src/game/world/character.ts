/**
 * The townsfolk: small round people (and service robots) sculpted from a
 * description, with procedural animation: walking, idling, blinking, cheering,
 * slumping, nodding. A character faces +Z in its own space.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, type Hex, type V3, clamp, damp, lerp } from '../scene/kit.ts';

export type HairStyle = 'bob' | 'short' | 'bun' | 'spiky' | 'long' | 'pigtails' | 'bald' | 'none';
export type Hat = 'none' | 'cap' | 'officer' | 'straw' | 'beret' | 'tall';
export type Carry = 'none' | 'briefcase' | 'buckets' | 'clipboard' | 'satchel' | 'cane' | 'scroll' | 'mallet';
export type Mood = 'neutral' | 'happy' | 'sad' | 'surprised' | 'worried';
export type Pose = 'idle' | 'cheer' | 'slump' | 'nod' | 'shake' | 'talk' | 'wave' | 'stamp';

export interface CharacterSpec {
    /** A person, or a boxy service robot. */
    kind?: 'person' | 'robot';
    skin?: Hex;
    hair?: Hex;
    hairStyle?: HairStyle;
    outfit: Hex;
    /** Collar, belt or trim. */
    accent?: Hex;
    legs?: Hex;
    hat?: Hat;
    hatColor?: Hex;
    glasses?: boolean;
    carry?: Carry;
    /** Overall size; 1 is an adult. */
    size?: number;
    /** A long robe instead of legs (council signers). */
    robe?: boolean;
    blush?: Hex;
}

const SKIN = '#ffd9bf';
const EYE = '#3b2f2a';

const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE });
const mouthMaterial = new THREE.MeshBasicMaterial({ color: '#8a4a45' });
const visorMaterial = new THREE.MeshBasicMaterial({ color: '#9ff3ff' });
const shineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });

/** Head radius, shared by the face layout. */
const HEAD = 0.36;

function sculptHead(spec: CharacterSpec): THREE.Group {
    const s = new Sculpt();
    const skin = spec.skin ?? SKIN;
    const hair = spec.hair ?? '#5a3f36';
    if (spec.kind === 'robot') {
        s.box(0.62, 0.5, 0.52, { color: spec.outfit, at: [0, -0.25, 0], r: 0.14 });
        s.box(0.46, 0.2, 0.06, { color: '#2d3142', at: [0, -0.08, 0.25], r: 0.05 });
        s.cyl(0.015, 0.015, 0.22, { color: '#8a8f9c', at: [0, 0.25, 0], seg: 6 });
        s.ball(0.055, { color: spec.accent ?? PALETTE.stop, at: [0, 0.5, 0], detail: 1, layer: 'lit' });
        for (const side of [-1, 1])
            s.cyl(0.07, 0.07, 0.06, {
                color: '#8a8f9c',
                at: [side * 0.34, -0.03, 0],
                rot: [0, 0, Math.PI / 2],
                seg: 10,
            });
        return s.build('head');
    }
    s.ball(HEAD, { color: skin, scale: [1, 0.95, 0.98], detail: 3 });
    // Ears.
    for (const side of [-1, 1]) s.ball(0.07, { color: skin, at: [side * 0.345, -0.02, 0], detail: 1 });
    // Cheeks.
    for (const side of [-1, 1]) {
        s.ball(0.062, {
            color: spec.blush ?? '#ffb3a8',
            at: [side * 0.19, -0.085, 0.29],
            scale: [1, 0.72, 0.4],
            detail: 1,
        });
    }
    const style = spec.hairStyle ?? 'bob';
    if (style !== 'none' && style !== 'bald') {
        const back: Record<Exclude<HairStyle, 'none' | 'bald'>, V3> = {
            bob: [0, 0.055, -0.06],
            short: [0, 0.095, -0.07],
            bun: [0, 0.06, -0.06],
            spiky: [0, 0.09, -0.06],
            long: [0, 0.055, -0.06],
            pigtails: [0, 0.06, -0.06],
        };
        s.ball(HEAD * 1.045, { color: hair, at: back[style], scale: [1.02, 0.97, 1], detail: 3 });
        // A fringe across the forehead.
        for (const [x, r] of [
            [-0.17, 0.13],
            [0, 0.15],
            [0.17, 0.13],
        ] as const) {
            s.ball(r, { color: hair, at: [x, 0.215, 0.215], scale: [1.1, 0.62, 0.75], detail: 2 });
        }
        if (style === 'bun') s.ball(0.15, { color: hair, at: [0, 0.42, -0.08], detail: 2 });
        if (style === 'pigtails')
            for (const side of [-1, 1])
                s.ball(0.15, { color: hair, at: [side * 0.38, -0.02, -0.08], scale: [0.9, 1.2, 0.9], detail: 2 });
        if (style === 'long') s.capsule(0.27, 0.62, { color: hair, at: [0, -0.5, -0.17], scale: [1.15, 1, 0.6] });
        if (style === 'spiky') {
            for (let i = 0; i < 5; i += 1) {
                const a = (i / 5) * Math.PI * 2;
                s.cone(0.1, 0.22, {
                    color: hair,
                    at: [Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17 - 0.05],
                    rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5],
                    seg: 7,
                });
            }
            s.cone(0.1, 0.24, { color: hair, at: [0, 0.34, -0.05], seg: 7 });
        }
    }
    if (style === 'bald') {
        for (const side of [-1, 1])
            s.ball(0.13, { color: hair, at: [side * 0.3, 0.02, -0.08], scale: [0.6, 1, 1.2], detail: 2 });
        s.ball(0.07, { color: hair, at: [-0.06, -0.15, 0.33], scale: [1.4, 0.6, 0.6], detail: 1 });
        s.ball(0.07, { color: hair, at: [0.06, -0.15, 0.33], scale: [1.4, 0.6, 0.6], detail: 1 });
    }
    const hatColor = spec.hatColor ?? spec.outfit;
    switch (spec.hat ?? 'none') {
        case 'cap':
            s.ball(HEAD * 1.07, { color: hatColor, at: [0, 0.1, -0.03], scale: [1, 0.72, 1], detail: 3 });
            s.box(0.42, 0.045, 0.3, { color: hatColor, at: [0, 0.17, 0.3], r: 0.02, rot: [0.12, 0, 0] });
            break;
        case 'officer':
            s.cyl(0.36, 0.33, 0.13, { color: hatColor, at: [0, 0.26, -0.02], seg: 20 });
            s.cyl(0.4, 0.37, 0.08, { color: hatColor, at: [0, 0.38, -0.02], seg: 20 });
            s.cyl(0.335, 0.335, 0.05, { color: spec.accent ?? PALETTE.gold, at: [0, 0.25, -0.02], seg: 20 });
            s.box(0.4, 0.04, 0.24, { color: '#2d3142', at: [0, 0.24, 0.3], r: 0.02, rot: [0.2, 0, 0] });
            s.ball(0.05, { color: PALETTE.gold, at: [0, 0.35, 0.32], detail: 1, layer: 'gloss' });
            break;
        case 'straw':
            s.cone(0.64, 0.4, { color: '#e9cf8f', at: [0, 0.14, 0], seg: 22 });
            s.cyl(0.64, 0.64, 0.03, { color: '#d9bb74', at: [0, 0.13, 0], seg: 22 });
            break;
        case 'beret':
            s.ball(0.34, { color: hatColor, at: [0.04, 0.27, -0.02], scale: [1.1, 0.42, 1.1], detail: 2 });
            s.ball(0.04, { color: hatColor, at: [0.04, 0.42, -0.02], detail: 1 });
            break;
        case 'tall':
            s.cyl(0.2, 0.26, 0.42, { color: hatColor, at: [0, 0.27, -0.03], seg: 16 });
            s.cyl(0.3, 0.3, 0.05, { color: hatColor, at: [0, 0.26, -0.03], seg: 16 });
            s.cyl(0.265, 0.265, 0.07, { color: spec.accent ?? PALETTE.gold, at: [0, 0.3, -0.03], seg: 16 });
            break;
        default:
            break;
    }
    if (spec.glasses) {
        for (const side of [-1, 1]) {
            s.torus(0.085, 0.014, {
                color: '#3b2f2a',
                at: [side * 0.125, -0.005, 0.335],
                rot: [Math.PI / 2, 0, 0],
                seg: 16,
            });
        }
        s.box(0.08, 0.02, 0.02, { color: '#3b2f2a', at: [0, -0.01, 0.345] });
    }
    return s.build('head');
}

function sculptBody(spec: CharacterSpec): THREE.Group {
    const s = new Sculpt();
    const accent = spec.accent ?? PALETTE.paper;
    if (spec.kind === 'robot') {
        s.box(0.56, 0.46, 0.44, { color: spec.outfit, at: [0, 0.2, 0], r: 0.12 });
        s.box(0.3, 0.16, 0.04, { color: accent, at: [0, 0.34, 0.215], r: 0.03 });
        s.cyl(0.2, 0.26, 0.14, { color: '#8a8f9c', at: [0, 0.08, 0], seg: 14 });
        return s.build('body');
    }
    if (spec.robe) {
        s.lathe(
            [
                [0.36, 0],
                [0.33, 0.25],
                [0.25, 0.55],
                [0.2, 0.74],
                [0.12, 0.8],
            ],
            { color: spec.outfit, seg: 18 },
        );
        s.cyl(0.345, 0.365, 0.07, { color: accent, at: [0, 0.02, 0], seg: 18 });
        s.box(0.1, 0.5, 0.04, { color: accent, at: [0, 0.26, 0.26], rot: [-0.16, 0, 0], r: 0.015 });
    } else {
        s.lathe(
            [
                [0.24, 0.2],
                [0.27, 0.36],
                [0.24, 0.6],
                [0.19, 0.74],
                [0.12, 0.8],
            ],
            { color: spec.outfit, seg: 18 },
        );
        s.cyl(0.245, 0.245, 0.06, { color: accent, at: [0, 0.22, 0], seg: 18 });
    }
    // Collar.
    s.torus(0.14, 0.035, { color: accent, at: [0, 0.78, 0], seg: 16 });
    if (spec.carry === 'satchel') {
        s.box(0.26, 0.2, 0.1, { color: '#b9814f', at: [0.2, 0.3, 0.2], r: 0.04, rot: [0, 0.3, 0] });
        s.box(0.04, 0.5, 0.03, { color: '#8f6445', at: [0.0, 0.34, 0.215], rot: [0, 0, 0.75], r: 0.01 });
    }
    return s.build('body');
}

function sculptLimb(color: Hex, hand: Hex, length: number, radius: number): THREE.Group {
    const s = new Sculpt();
    // The pivot is at the top; the limb hangs down.
    s.capsule(radius, length, { color, at: [0, -length, 0] });
    s.ball(radius * 1.15, { color: hand, at: [0, -length + radius * 0.3, 0], detail: 1 });
    return s.build('limb');
}

function sculptCarry(carry: Carry): THREE.Group | undefined {
    const s = new Sculpt();
    switch (carry) {
        case 'briefcase':
            s.box(0.34, 0.24, 0.1, { color: '#7a5540', at: [0, -0.3, 0], r: 0.03 });
            s.box(0.12, 0.05, 0.03, { color: '#3b2f2a', at: [0, -0.06, 0], r: 0.012 });
            s.box(0.06, 0.05, 0.11, { color: PALETTE.gold, at: [0, -0.18, 0], r: 0.01, layer: 'gloss' });
            break;
        case 'clipboard':
            s.box(0.24, 0.32, 0.03, { color: '#b9814f', at: [0, -0.28, 0.04], r: 0.012, rot: [0.25, 0, 0] });
            s.box(0.19, 0.25, 0.02, { color: PALETTE.paper, at: [0, -0.26, 0.06], r: 0.006, rot: [0.25, 0, 0] });
            break;
        case 'cane':
            s.cyl(0.022, 0.022, 0.62, { color: '#7a5540', at: [0, -0.62, 0.05], seg: 7 });
            s.ball(0.04, { color: '#7a5540', at: [0, 0, 0.05], detail: 1 });
            break;
        case 'scroll':
            s.cyl(0.05, 0.05, 0.36, {
                color: PALETTE.paper,
                at: [-0.18, -0.06, 0.06],
                rot: [0, 0, -Math.PI / 2],
                seg: 10,
            });
            for (const side of [-1, 1])
                s.cyl(0.062, 0.062, 0.03, {
                    color: PALETTE.vermilion,
                    at: [side * 0.18 - 0.015, -0.06, 0.06],
                    rot: [0, 0, -Math.PI / 2],
                    seg: 10,
                });
            break;
        case 'mallet':
            s.cyl(0.025, 0.025, 0.4, { color: '#8f6445', at: [0, -0.1, 0.04], rot: [0.9, 0, 0], seg: 7 });
            s.cyl(0.09, 0.09, 0.22, { color: '#c08e62', at: [0, 0.2, 0.26], rot: [0.9, 0, Math.PI / 2], seg: 12 });
            break;
        default:
            return undefined;
    }
    return s.build('carry');
}

/** The shoulder pole with two buckets a liquidity provider carries: one of stock, one of dollars. */
function sculptBuckets(): THREE.Group {
    const s = new Sculpt();
    s.cyl(0.025, 0.025, 1.3, { color: '#8f6445', at: [-0.65, 0, 0], rot: [0, 0, -Math.PI / 2], seg: 7 });
    for (const [side, tone] of [
        [-1, PALETTE.stock],
        [1, PALETTE.usdc],
    ] as const) {
        const x = side * 0.58;
        s.cyl(0.008, 0.008, 0.32, { color: '#6a4a36', at: [x, -0.32, 0], seg: 5 });
        s.cyl(0.15, 0.12, 0.2, { color: '#c08e62', at: [x, -0.52, 0], seg: 14 });
        s.cyl(0.155, 0.155, 0.03, { color: '#8f6445', at: [x, -0.4, 0], seg: 14 });
        s.cyl(0.13, 0.13, 0.02, { color: tone, at: [x, -0.335, 0], seg: 14, layer: 'gloss' });
    }
    return s.build('buckets');
}

interface Face {
    eyes: THREE.Group;
    open: THREE.Group;
    happy: THREE.Group;
    brows: THREE.Group;
    mouthFlat: THREE.Mesh;
    mouthSmile: THREE.Mesh;
    mouthSad: THREE.Mesh;
    mouthOpen: THREE.Mesh;
}

function buildFace(spec: CharacterSpec): Face {
    const eyes = new THREE.Group();
    const open = new THREE.Group();
    const happy = new THREE.Group();
    const brows = new THREE.Group();
    const z = 0.335;
    if (spec.kind === 'robot') {
        for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), visorMaterial);
            eye.position.set(side * 0.11, 0.02, 0.285);
            open.add(eye);
            const arc = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), visorMaterial);
            arc.position.set(side * 0.11, 0.0, 0.285);
            happy.add(arc);
        }
    } else {
        for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMaterial);
            eye.scale.set(0.92, 1.25, 0.5);
            eye.position.set(side * 0.125, -0.005, z - 0.012);
            open.add(eye);
            const shine = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), shineMaterial);
            shine.position.set(side * 0.125 + 0.016, 0.022, z + 0.012);
            open.add(shine);
            const arc = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12, Math.PI), eyeMaterial);
            arc.position.set(side * 0.125, -0.02, z);
            arc.rotation.x = -0.15;
            happy.add(arc);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), eyeMaterial);
            brow.position.set(side * 0.125, 0.09, z + 0.005);
            brow.userData.side = side;
            brows.add(brow);
        }
    }
    happy.visible = false;
    brows.visible = false;
    eyes.add(open, happy, brows);

    const mouthZ = spec.kind === 'robot' ? 0.285 : z + 0.012;
    const mouthY = spec.kind === 'robot' ? -0.12 : -0.115;
    const material = spec.kind === 'robot' ? visorMaterial : mouthMaterial;
    const mouthFlat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.01), material);
    mouthFlat.position.set(0, mouthY, mouthZ);
    const mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.013, 6, 12, Math.PI), material);
    mouthSmile.rotation.z = Math.PI;
    mouthSmile.position.set(0, mouthY + 0.025, mouthZ);
    const mouthSad = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.012, 6, 12, Math.PI), material);
    mouthSad.position.set(0, mouthY - 0.02, mouthZ);
    const mouthOpen = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), material);
    mouthOpen.position.set(0, mouthY, mouthZ);
    mouthSmile.visible = false;
    mouthSad.visible = false;
    mouthOpen.visible = false;
    return { eyes, open, happy, brows, mouthFlat, mouthSmile, mouthSad, mouthOpen };
}

interface Walk {
    points: THREE.Vector3[];
    index: number;
    speed: number;
    resolve: () => void;
}

/** One animated townsperson or robot. */
export class Character {
    /** Add this to the scene. Move the character with `place` and `walkTo`. */
    readonly root = new THREE.Group();
    readonly spec: CharacterSpec;

    private readonly body = new THREE.Group();
    private readonly torso: THREE.Group;
    private readonly head = new THREE.Group();
    private readonly face: Face;
    private readonly armL: THREE.Group;
    private readonly armR: THREE.Group;
    private readonly legL: THREE.Group | undefined;
    private readonly legR: THREE.Group | undefined;
    private readonly buckets: THREE.Group | undefined;

    private heading = 0;
    private headingGoal = 0;
    private walk: Walk | undefined;
    private stride = 0;
    private moving = 0;
    private mood: Mood = 'neutral';
    private pose: Pose = 'idle';
    private poseStart = 0;
    private poseEnd = Infinity;
    private clock = Math.random() * 10;
    private nextBlink = 1 + Math.random() * 3;
    private blink = 0;
    private readonly seed = Math.random() * 100;
    private talking = false;
    /** Where the head turns to look, in world space; undefined looks ahead. */
    private gaze: THREE.Vector3 | undefined;
    private headYaw = 0;
    private readonly size: number;

    constructor(spec: CharacterSpec) {
        this.spec = spec;
        this.size = spec.size ?? 1;
        const robot = spec.kind === 'robot';
        this.root.scale.setScalar(this.size);
        this.root.add(this.body);

        this.torso = sculptBody(spec);
        this.body.add(this.torso);

        const headMesh = sculptHead(spec);
        this.head.add(headMesh);
        this.face = buildFace(spec);
        this.head.add(
            this.face.eyes,
            this.face.mouthFlat,
            this.face.mouthSmile,
            this.face.mouthSad,
            this.face.mouthOpen,
        );
        this.head.position.set(0, robot ? 1.0 : 1.06, 0);
        this.body.add(this.head);

        const sleeve = spec.outfit;
        const hand = robot ? '#8a8f9c' : (spec.skin ?? SKIN);
        this.armL = sculptLimb(sleeve, hand, 0.34, robot ? 0.055 : 0.075);
        this.armR = sculptLimb(sleeve, hand, 0.34, robot ? 0.055 : 0.075);
        this.armL.position.set(-0.255, 0.7, 0);
        this.armR.position.set(0.255, 0.7, 0);
        this.armL.rotation.z = -0.18;
        this.armR.rotation.z = 0.18;
        this.body.add(this.armL, this.armR);

        if (!robot && !spec.robe) {
            const legs = spec.legs ?? '#5b6475';
            this.legL = sculptLimb(legs, '#4a4550', 0.26, 0.085);
            this.legR = sculptLimb(legs, '#4a4550', 0.26, 0.085);
            this.legL.position.set(-0.11, 0.27, 0);
            this.legR.position.set(0.11, 0.27, 0);
            this.root.add(this.legL, this.legR);
        }

        if (spec.carry === 'buckets') {
            this.buckets = sculptBuckets();
            this.buckets.position.set(0, 0.84, -0.02);
            this.body.add(this.buckets);
        } else if (spec.carry && spec.carry !== 'none' && spec.carry !== 'satchel') {
            const item = sculptCarry(spec.carry);
            if (item) {
                item.position.set(0, -0.3, 0.02);
                this.armR.add(item);
            }
        }
        this.root.traverse((node) => {
            if (
                node instanceof THREE.Mesh &&
                node.material !== eyeMaterial &&
                node.material !== mouthMaterial &&
                node.material !== visorMaterial &&
                node.material !== shineMaterial
            )
                node.castShadow = true;
        });
        this.setMood('neutral');
    }

    /** Frees the character's geometry when it leaves for good. Its materials are shared and stay. */
    dispose(): void {
        this.walk?.resolve();
        this.walk = undefined;
        this.root.traverse((node) => {
            if (node instanceof THREE.Mesh) node.geometry.dispose();
        });
    }

    // ----- Placement and movement -----

    /** Puts the character at a ground position, facing `heading` (radians; 0 faces +Z, π/2 faces +X). */
    place(position: V3 | THREE.Vector3, heading?: number): this {
        if (position instanceof THREE.Vector3) this.root.position.copy(position);
        else this.root.position.set(position[0], position[1], position[2]);
        if (heading !== undefined) {
            this.heading = heading;
            this.headingGoal = heading;
            this.root.rotation.y = heading;
        }
        this.walk?.resolve();
        this.walk = undefined;
        return this;
    }

    /** Walks through the points in order and resolves on arrival. `speed` is units per second. */
    walkTo(points: ReadonlyArray<V3 | THREE.Vector3>, speed = 2.4): Promise<void> {
        this.walk?.resolve();
        return new Promise<void>((resolve) => {
            this.walk = {
                points: points.map((p) =>
                    p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]),
                ),
                index: 0,
                speed,
                resolve,
            };
        });
    }

    /** Turns to face a world position. */
    face_(target: V3 | THREE.Vector3): this {
        const x = target instanceof THREE.Vector3 ? target.x : target[0];
        const z = target instanceof THREE.Vector3 ? target.z : target[2];
        this.headingGoal = Math.atan2(x - this.root.position.x, z - this.root.position.z);
        return this;
    }

    /** Turns to a heading in radians (0 faces +Z, π/2 faces +X). */
    turn(heading: number): this {
        this.headingGoal = heading;
        return this;
    }

    /** Makes the head look at a world position; undefined looks ahead again. */
    lookAt(target: V3 | THREE.Vector3 | undefined): this {
        if (!target) this.gaze = undefined;
        else
            this.gaze =
                target instanceof THREE.Vector3 ? target.clone() : new THREE.Vector3(target[0], target[1], target[2]);
        return this;
    }

    get position(): THREE.Vector3 {
        return this.root.position;
    }

    get isWalking(): boolean {
        return this.walk !== undefined;
    }

    /** The world position just above the head, for speech bubbles and emotes. */
    headTop(): THREE.Vector3 {
        return new THREE.Vector3(this.root.position.x, this.root.position.y + 1.62 * this.size, this.root.position.z);
    }

    /** The world position of the hands, for handing things over. */
    hands(): THREE.Vector3 {
        return new THREE.Vector3(
            this.root.position.x + Math.sin(this.heading) * 0.35 * this.size,
            this.root.position.y + 0.6 * this.size,
            this.root.position.z + Math.cos(this.heading) * 0.35 * this.size,
        );
    }

    // ----- Acting -----

    setMood(mood: Mood): this {
        this.mood = mood;
        const face = this.face;
        const happy = mood === 'happy';
        face.open.visible = !happy;
        face.happy.visible = happy;
        face.brows.visible = mood === 'sad' || mood === 'worried';
        for (const brow of face.brows.children) {
            const side = (brow.userData.side as number | undefined) ?? 1;
            brow.rotation.z = -side * (mood === 'sad' ? 0.45 : 0.3);
        }
        this.refreshMouth();
        return this;
    }

    getMood(): Mood {
        return this.mood;
    }

    get isTalking(): boolean {
        return this.talking;
    }

    /** The pose being played, for mirrors of this character (the desk portrait). */
    get currentPose(): Pose {
        return this.pose;
    }

    /**
     * Strikes a pose for `seconds` (cheer, slump, nod, shake, wave, stamp),
     * then returns to idle. `slump` and `talk` hold until another pose is set.
     */
    act(pose: Pose, seconds?: number): this {
        this.pose = pose;
        this.poseStart = this.clock;
        const defaults: Record<Pose, number> = {
            idle: Infinity,
            cheer: 1.5,
            slump: Infinity,
            nod: 0.9,
            shake: 1.0,
            talk: Infinity,
            wave: 1.6,
            stamp: 0.9,
        };
        this.poseEnd = this.clock + (seconds ?? defaults[pose]);
        return this;
    }

    /** Opens and closes the mouth while speaking. */
    setTalking(talking: boolean): this {
        this.talking = talking;
        this.refreshMouth();
        return this;
    }

    private refreshMouth(open = false): void {
        const face = this.face;
        const mood = this.mood;
        const showOpen = open || mood === 'surprised';
        face.mouthOpen.visible = showOpen;
        face.mouthSmile.visible = !showOpen && mood === 'happy';
        face.mouthSad.visible = !showOpen && (mood === 'sad' || mood === 'worried');
        face.mouthFlat.visible = !showOpen && mood === 'neutral';
    }

    // ----- Animation -----

    update(dt: number): void {
        this.clock += dt;
        const t = this.clock;

        // Walking along the route.
        let speed = 0;
        const walk = this.walk;
        if (walk) {
            const target = walk.points[walk.index] as THREE.Vector3;
            const dx = target.x - this.root.position.x;
            const dz = target.z - this.root.position.z;
            const distance = Math.hypot(dx, dz);
            const step = walk.speed * dt;
            if (distance <= step) {
                this.root.position.x = target.x;
                this.root.position.z = target.z;
                walk.index += 1;
                if (walk.index >= walk.points.length) {
                    this.walk = undefined;
                    walk.resolve();
                }
            } else {
                this.root.position.x += (dx / distance) * step;
                this.root.position.z += (dz / distance) * step;
                this.headingGoal = Math.atan2(dx, dz);
                speed = walk.speed;
            }
        }
        this.moving = damp(this.moving, speed > 0 ? 1 : 0, 10, dt);
        this.stride += dt * (speed > 0 ? speed * 3.6 : 0);

        // Turn the shortest way.
        let turn = this.headingGoal - this.heading;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        this.heading += turn * (1 - Math.exp(-11 * dt));
        this.root.rotation.y = this.heading;

        if (this.pose !== 'idle' && t > this.poseEnd) this.pose = 'idle';
        const p = t - this.poseStart;
        const m = this.moving;
        const robot = this.spec.kind === 'robot';

        // Base: breathing and a walking bob.
        const swing = Math.sin(this.stride);
        let bodyY = Math.abs(Math.sin(this.stride)) * 0.055 * m + Math.sin(t * 2.1 + this.seed) * 0.008;
        let bodyTilt = 0.07 * m;
        let squash = 1 + Math.sin(t * 2.1 + this.seed) * 0.012;
        let armL = swing * 0.6 * m;
        let armR = -swing * 0.6 * m;
        let armSpread = 0.18;
        let headPitch = Math.sin(t * 0.8 + this.seed) * 0.02;
        let headRoll = Math.sin(t * 0.6 + this.seed * 2) * 0.025 * (1 - m);
        let headYawGoal = 0;
        if (robot) bodyY += 0.06 + Math.sin(t * 2.4 + this.seed) * 0.035;

        switch (this.pose) {
            case 'cheer': {
                const hop = Math.abs(Math.sin(p * Math.PI * 2.2)) * Math.exp(-p * 0.9);
                bodyY += hop * 0.38;
                squash = 1 + hop * 0.1;
                armL = -2.7;
                armR = -2.7;
                armSpread = 0.5;
                headPitch = -0.18;
                break;
            }
            case 'slump':
                bodyY -= 0.03;
                bodyTilt = 0.16;
                headPitch = 0.32;
                armSpread = 0.08;
                break;
            case 'nod':
                headPitch = Math.sin(p * Math.PI * 4) * 0.28 * Math.exp(-p * 1.2) + 0.05;
                break;
            case 'shake':
                headYawGoal = Math.sin(p * Math.PI * 5) * 0.5 * Math.exp(-p * 1.1);
                break;
            case 'wave':
                armR = -2.6 + Math.sin(p * 11) * 0.35;
                armSpread = 0.4;
                headRoll = 0.08;
                break;
            case 'talk':
                headPitch += Math.sin(t * 7) * 0.04;
                armR = -0.5 + Math.sin(t * 3.1) * 0.2;
                break;
            case 'stamp': {
                // Raise the arm, bring it down hard, recover.
                const k = clamp(p / 0.9);
                const raise = k < 0.35 ? k / 0.35 : k < 0.5 ? 1 - (k - 0.35) / 0.15 : 0;
                armR = -2.4 * raise - (k >= 0.5 ? 0.9 * (1 - (k - 0.5) / 0.5) : 0);
                bodyTilt = k >= 0.35 && k < 0.6 ? 0.2 : 0.05;
                break;
            }
            default:
                break;
        }

        this.body.position.y = bodyY;
        this.body.rotation.x = bodyTilt;
        this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        this.armL.rotation.set(armL, 0, -armSpread);
        this.armR.rotation.set(armR, 0, armSpread);
        if (this.legL && this.legR) {
            this.legL.rotation.x = -swing * 0.75 * m;
            this.legR.rotation.x = swing * 0.75 * m;
            this.legL.position.y = 0.27 + Math.max(0, swing) * 0.03 * m;
            this.legR.position.y = 0.27 + Math.max(0, -swing) * 0.03 * m;
        }
        if (this.buckets) {
            this.buckets.rotation.z = Math.sin(this.stride) * 0.07 * m + Math.sin(t * 1.3) * 0.012;
        }

        // The head follows the gaze, within what a neck allows.
        if (this.gaze && this.pose !== 'shake') {
            const dx = this.gaze.x - this.root.position.x;
            const dz = this.gaze.z - this.root.position.z;
            let yaw = Math.atan2(dx, dz) - this.heading;
            while (yaw > Math.PI) yaw -= Math.PI * 2;
            while (yaw < -Math.PI) yaw += Math.PI * 2;
            headYawGoal = clamp(yaw, -1.1, 1.1);
        }
        this.headYaw = damp(this.headYaw, headYawGoal, 9, dt);
        this.head.rotation.set(headPitch, this.headYaw, headRoll);

        // Blinking.
        if (t > this.nextBlink) {
            this.blink = 0.13;
            this.nextBlink = t + 1.6 + Math.random() * 3.6;
        }
        if (this.blink > 0) this.blink -= dt;
        this.face.open.scale.y = this.blink > 0 ? 0.12 : lerp(this.face.open.scale.y, 1, 0.5);

        if (this.talking) this.refreshMouth(Math.sin(t * 16) > 0);
    }
}

/** The cast's looks. The director picks from these by role. */
export const LOOKS = {
    gatekeeper: {
        outfit: '#3f4f93',
        accent: PALETTE.gold,
        hat: 'officer',
        hatColor: '#3f4f93',
        hair: '#4a342c',
        hairStyle: 'short',
        legs: '#2f3a6b',
    },
    issuer: {
        outfit: '#f29c8a',
        accent: PALETTE.paper,
        hair: '#3a2b2b',
        hairStyle: 'bun',
        carry: 'mallet',
        legs: '#7a5a52',
    },
    officer: {
        outfit: '#5468b5',
        accent: PALETTE.paper,
        hat: 'officer',
        hatColor: '#5468b5',
        hair: '#6b4a3a',
        hairStyle: 'bob',
        glasses: true,
        carry: 'clipboard',
        legs: '#3f4a78',
    },
    provider: {
        outfit: '#7fb88a',
        accent: '#f6e7b0',
        hat: 'straw',
        hair: '#3a2b2b',
        hairStyle: 'short',
        carry: 'buckets',
        legs: '#5d7d66',
    },
    trader1: {
        outfit: '#f6b756',
        accent: PALETTE.paper,
        hair: '#7a4a2f',
        hairStyle: 'pigtails',
        carry: 'satchel',
        legs: '#5b6475',
    },
    trader2: {
        outfit: '#7cc6d6',
        accent: PALETTE.paper,
        hair: '#2d2a33',
        hairStyle: 'spiky',
        carry: 'satchel',
        legs: '#4f5a70',
    },
    newcomer: {
        outfit: '#f7a8b8',
        accent: PALETTE.paper,
        hair: '#b7733f',
        hairStyle: 'long',
        hat: 'beret',
        hatColor: '#e8574a',
        legs: '#6b5f7a',
    },
    foreigner: {
        outfit: '#a8c96b',
        accent: PALETTE.paper,
        hair: '#e3c172',
        hairStyle: 'short',
        hat: 'cap',
        hatColor: '#4f8a5b',
        carry: 'satchel',
        legs: '#6a6a55',
    },
    elder: {
        outfit: '#b8a6d9',
        accent: PALETTE.paper,
        hair: '#f1f1f1',
        hairStyle: 'bald',
        carry: 'cane',
        legs: '#6f6485',
        glasses: true,
    },
    stale: {
        outfit: '#f08a4b',
        accent: PALETTE.paper,
        hair: '#4a342c',
        hairStyle: 'bob',
        legs: '#5b6475',
        carry: 'satchel',
    },
    broker: {
        outfit: '#4a4550',
        accent: PALETTE.stop,
        hair: '#2d2a33',
        hairStyle: 'short',
        glasses: true,
        carry: 'briefcase',
        legs: '#35323b',
    },
    whale: {
        outfit: '#6a7fd2',
        accent: PALETTE.gold,
        hair: '#3a2b2b',
        hairStyle: 'bob',
        hat: 'tall',
        hatColor: '#2d3142',
        carry: 'briefcase',
        legs: '#2d3142',
        size: 1.12,
    },
    bellRinger: {
        outfit: '#46ad9b',
        accent: PALETTE.gold,
        hair: '#4a342c',
        hairStyle: 'bob',
        hat: 'cap',
        hatColor: '#2f8676',
        legs: '#2f6f63',
    },
    emergency: {
        outfit: '#e8574a',
        accent: PALETTE.gold,
        robe: true,
        hat: 'tall',
        hatColor: '#b13b33',
        hair: '#3a2b2b',
        hairStyle: 'short',
    },
    operations: {
        outfit: '#4d8fe8',
        accent: PALETTE.gold,
        robe: true,
        hat: 'tall',
        hatColor: '#356bb8',
        hair: '#3a2b2b',
        hairStyle: 'bob',
    },
    structural: {
        outfit: '#9471c4',
        accent: PALETTE.gold,
        robe: true,
        hat: 'tall',
        hatColor: '#6f52a0',
        hair: '#f1f1f1',
        hairStyle: 'short',
    },
    upgrade: {
        outfit: '#edb94c',
        accent: PALETTE.paper,
        robe: true,
        hat: 'tall',
        hatColor: '#c28f2a',
        hair: '#3a2b2b',
        hairStyle: 'bun',
    },
    indexerBot: { kind: 'robot', outfit: '#edb94c', accent: '#59c98a' },
    archiveBot: { kind: 'robot', outfit: '#8a93ad', accent: '#f3c45a', carry: 'scroll' },
    posterBot: { kind: 'robot', outfit: '#f6f1e6', accent: '#ee5d50' },
} as const satisfies Record<string, CharacterSpec>;

export type LookId = keyof typeof LOOKS;
