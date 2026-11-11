/**
 * Things that fly, pop and drift: tokens arcing between places, bursts of
 * particles, rings that say "look here", streams of dots that show data
 * moving, and the petals and fireflies that keep the town alive.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, type Hex, clamp, ease } from '../scene/kit.ts';

export type TokenKind =
    | 'stock'
    | 'frozenStock'
    | 'usdc'
    | 'lp'
    | 'credential'
    | 'revocation'
    | 'scroll'
    | 'fill'
    | 'refusal'
    | 'admin'
    | 'input'
    | 'key';
export type BurstKind = 'sparkle' | 'smoke' | 'ice' | 'splash' | 'dust' | 'confetti' | 'petals' | 'stamp';

type Point = THREE.Vector3 | (() => THREE.Vector3);

const resolve = (point: Point): THREE.Vector3 => (typeof point === 'function' ? point() : point);

function parcel(s: Sculpt, color: Hex): void {
    s.box(0.24, 0.2, 0.24, { color, r: 0.04, layer: 'gloss' });
    s.box(0.25, 0.21, 0.06, { color: PALETTE.paper, at: [0, -0.003, 0], r: 0.01 });
    s.box(0.06, 0.21, 0.25, { color: PALETTE.paper, at: [0, -0.003, 0], r: 0.01 });
}

function sculptToken(kind: TokenKind): THREE.Group {
    const s = new Sculpt();
    switch (kind) {
        case 'stock':
        case 'frozenStock':
            s.box(0.26, 0.26, 0.26, { color: PALETTE.stock, at: [0, -0.13, 0], r: 0.06, layer: 'gloss' });
            s.box(0.27, 0.07, 0.27, { color: '#ffe3ea', at: [0, -0.035, 0], r: 0.02, layer: 'gloss' });
            if (kind === 'frozenStock')
                s.box(0.36, 0.36, 0.36, { color: PALETTE.ice, at: [0, -0.18, 0], r: 0.07, layer: 'glass' });
            break;
        case 'usdc':
            s.cyl(0.17, 0.17, 0.07, {
                color: PALETTE.usdc,
                at: [0, -0.035, 0],
                rot: [Math.PI / 2, 0, 0],
                seg: 22,
                layer: 'gloss',
            });
            s.cyl(0.115, 0.115, 0.08, {
                color: '#a9ccff',
                at: [0, -0.04, 0],
                rot: [Math.PI / 2, 0, 0],
                seg: 22,
                layer: 'gloss',
            });
            break;
        case 'lp':
            s.ball(0.15, { color: PALETTE.gold, at: [0, -0.02, 0], detail: 2, layer: 'gloss' });
            s.cone(0.12, 0.22, { color: PALETTE.gold, at: [0, 0.05, 0], seg: 14, layer: 'gloss' });
            break;
        case 'credential':
        case 'revocation':
            s.box(0.4, 0.26, 0.03, { color: PALETTE.paper, at: [0, -0.13, 0], r: 0.012 });
            s.box(0.4, 0.07, 0.034, {
                color: kind === 'credential' ? '#5468b5' : PALETTE.stop,
                at: [0, 0.06, 0],
                r: 0.01,
            });
            s.cyl(0.05, 0.05, 0.04, {
                color: kind === 'credential' ? PALETTE.ok : PALETTE.stop,
                at: [0.11, -0.07, 0],
                rot: [Math.PI / 2, 0, 0],
                seg: 14,
                layer: 'gloss',
            });
            s.box(0.16, 0.025, 0.034, { color: '#c9bfae', at: [-0.07, -0.035, 0] });
            s.box(0.12, 0.025, 0.034, { color: '#c9bfae', at: [-0.09, -0.085, 0] });
            break;
        case 'scroll':
            s.cyl(0.06, 0.06, 0.36, { color: PALETTE.paper, at: [-0.18, 0, 0], rot: [0, 0, -Math.PI / 2], seg: 12 });
            for (const x of [-0.17, 0.17])
                s.cyl(0.072, 0.072, 0.03, {
                    color: PALETTE.vermilion,
                    at: [x - 0.015, 0, 0],
                    rot: [0, 0, -Math.PI / 2],
                    seg: 12,
                });
            break;
        case 'fill':
            parcel(s, PALETTE.ok);
            break;
        case 'refusal':
            parcel(s, PALETTE.warn);
            break;
        case 'admin':
            parcel(s, '#9471c4');
            break;
        case 'input':
            parcel(s, '#8ecbff');
            break;
        case 'key':
            s.torus(0.09, 0.03, {
                color: PALETTE.gold,
                at: [0, 0.1, 0],
                rot: [Math.PI / 2, 0, 0],
                seg: 16,
                layer: 'gloss',
            });
            s.box(0.05, 0.26, 0.04, { color: PALETTE.gold, at: [0, -0.24, 0], r: 0.012, layer: 'gloss' });
            s.box(0.1, 0.04, 0.04, { color: PALETTE.gold, at: [0.05, -0.2, 0], r: 0.01, layer: 'gloss' });
            break;
    }
    const group = s.build(`token:${kind}`);
    for (const child of group.children) child.castShadow = false;
    return group;
}

interface Flight {
    node: THREE.Group;
    kind: TokenKind;
    from: Point;
    to: Point;
    age: number;
    duration: number;
    height: number;
    spin: number;
    scale: number;
    trail: THREE.Color | undefined;
    trailTimer: number;
    done: () => void;
}

interface Particle {
    alive: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    gravity: number;
    drag: number;
    age: number;
    life: number;
    size: number;
    grow: number;
    r: number;
    g: number;
    b: number;
    /** Sways sideways like a falling petal. */
    flutter: number;
}

interface Stream {
    from: Point;
    to: Point;
    color: THREE.Color;
    until: number;
    height: number;
    timer: number;
}

interface Ring {
    mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    age: number;
    life: number;
    size: number;
}

const MAX_PARTICLES = 900;

const ParticleShader = {
    vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 tint;
        uniform float scale;
        varying vec4 vTint;
        void main() {
            vTint = tint;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(size * scale, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        varying vec4 vTint;
        void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p) * 2.0;
            float alpha = smoothstep(1.0, 0.55, d) * vTint.a;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vTint.rgb, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
};

export class Fx {
    private readonly root = new THREE.Group();
    private readonly templates = new Map<TokenKind, THREE.Group>();
    private readonly idle = new Map<TokenKind, THREE.Group[]>();
    private readonly flights: Flight[] = [];
    private readonly particles: Particle[] = [];
    private readonly positions = new Float32Array(MAX_PARTICLES * 3);
    private readonly sizes = new Float32Array(MAX_PARTICLES);
    private readonly tints = new Float32Array(MAX_PARTICLES * 4);
    private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    private readonly streams: Stream[] = [];
    private readonly rings: Ring[] = [];
    private cursor = 0;
    private time = 0;
    private petalSources: THREE.Vector3[] = [];
    private petalTimer = 0;
    private fireflies = 0;
    private fireflyTimer = 0;
    private readonly color = new THREE.Color();

    constructor(scene: THREE.Scene) {
        this.root.name = 'fx';
        scene.add(this.root);
        for (let i = 0; i < MAX_PARTICLES; i += 1) {
            this.particles.push({
                alive: false,
                x: 0,
                y: -100,
                z: 0,
                vx: 0,
                vy: 0,
                vz: 0,
                gravity: 0,
                drag: 0,
                age: 0,
                life: 1,
                size: 0,
                grow: 0,
                r: 1,
                g: 1,
                b: 1,
                flutter: 0,
            });
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        geometry.setAttribute('tint', new THREE.BufferAttribute(this.tints, 4));
        this.points = new THREE.Points(
            geometry,
            new THREE.ShaderMaterial({
                uniforms: { scale: { value: 30 } },
                vertexShader: ParticleShader.vertexShader,
                fragmentShader: ParticleShader.fragmentShader,
                transparent: true,
                depthWrite: false,
            }),
        );
        this.points.frustumCulled = false;
        this.points.renderOrder = 10;
        this.root.add(this.points);
    }

    /** How many device pixels one world unit covers; particles size themselves by it. */
    setPixelScale(pixelsPerUnit: number): void {
        (this.points.material.uniforms.scale as THREE.IUniform<number>).value = pixelsPerUnit;
    }

    /** Where blossom petals fall from (the tops of the cherry trees). */
    setPetalSources(sources: THREE.Vector3[]): void {
        this.petalSources = sources;
    }

    /** How many fireflies wander at night; 0 by day. */
    setFireflies(amount: number): void {
        this.fireflies = amount;
    }

    // ----- Flying tokens -----

    /**
     * Flies a token in an arc from one point to another and resolves when it
     * lands. Points may be functions, to follow moving things.
     */
    fly(
        kind: TokenKind,
        from: Point,
        to: Point,
        opts: { duration?: number; height?: number; spin?: number; scale?: number; trail?: Hex } = {},
    ): Promise<void> {
        return new Promise<void>((done) => {
            const node = this.take(kind);
            node.position.copy(resolve(from));
            node.scale.setScalar(0.001);
            node.visible = true;
            this.flights.push({
                node,
                kind,
                from,
                to,
                age: 0,
                duration: opts.duration ?? 0.9,
                height: opts.height ?? 1.6,
                spin: opts.spin ?? 6,
                scale: opts.scale ?? 1,
                trail: opts.trail === undefined ? undefined : new THREE.Color(opts.trail),
                trailTimer: 0,
                done,
            });
        });
    }

    private take(kind: TokenKind): THREE.Group {
        const spare = this.idle.get(kind)?.pop();
        if (spare) return spare;
        let template = this.templates.get(kind);
        if (!template) {
            template = sculptToken(kind);
            this.templates.set(kind, template);
        }
        const node = template.clone();
        this.root.add(node);
        return node;
    }

    private give(flight: Flight): void {
        flight.node.visible = false;
        const list = this.idle.get(flight.kind) ?? [];
        list.push(flight.node);
        this.idle.set(flight.kind, list);
    }

    // ----- Particles -----

    private spawn(): Particle {
        this.cursor = (this.cursor + 1) % MAX_PARTICLES;
        const particle = this.particles[this.cursor] as Particle;
        particle.alive = true;
        particle.age = 0;
        particle.flutter = 0;
        particle.grow = 0;
        particle.drag = 1;
        particle.gravity = 0;
        return particle;
    }

    private paint(particle: Particle, color: Hex): void {
        this.color.set(color);
        particle.r = this.color.r;
        particle.g = this.color.g;
        particle.b = this.color.b;
    }

    /** A puff of particles at a point. */
    burst(at: THREE.Vector3, kind: BurstKind, count?: number): void {
        const n =
            count ??
            { sparkle: 16, smoke: 8, ice: 16, splash: 14, dust: 12, confetti: 60, petals: 14, stamp: 18 }[kind];
        for (let i = 0; i < n; i += 1) {
            const p = this.spawn();
            const a = Math.random() * Math.PI * 2;
            const out = Math.random();
            p.x = at.x;
            p.y = at.y;
            p.z = at.z;
            switch (kind) {
                case 'sparkle':
                    p.vx = Math.cos(a) * (0.6 + out * 1.6);
                    p.vz = Math.sin(a) * (0.6 + out * 1.6);
                    p.vy = 0.8 + Math.random() * 2.2;
                    p.gravity = -3.2;
                    p.life = 0.6 + Math.random() * 0.5;
                    p.size = 0.09 + Math.random() * 0.09;
                    this.paint(p, i % 3 === 0 ? '#ffffff' : '#ffe08a');
                    break;
                case 'smoke':
                    p.vx = Math.cos(a) * 0.25;
                    p.vz = Math.sin(a) * 0.25;
                    p.vy = 0.7 + Math.random() * 0.5;
                    p.life = 1.4 + Math.random() * 0.8;
                    p.size = 0.3 + Math.random() * 0.2;
                    p.grow = 0.5;
                    this.paint(p, '#f4efe6');
                    break;
                case 'ice':
                    p.vx = Math.cos(a) * (1 + out * 2);
                    p.vz = Math.sin(a) * (1 + out * 2);
                    p.vy = 1.5 + Math.random() * 2.5;
                    p.gravity = -7;
                    p.life = 0.8 + Math.random() * 0.5;
                    p.size = 0.1 + Math.random() * 0.12;
                    this.paint(p, i % 2 === 0 ? '#e9f8ff' : '#bfe9ff');
                    break;
                case 'splash':
                    p.vx = Math.cos(a) * (0.5 + out * 1.3);
                    p.vz = Math.sin(a) * (0.5 + out * 1.3);
                    p.vy = 1.8 + Math.random() * 2;
                    p.gravity = -8;
                    p.life = 0.55 + Math.random() * 0.3;
                    p.size = 0.08 + Math.random() * 0.08;
                    this.paint(p, i % 2 === 0 ? '#ffffff' : i % 4 === 1 ? '#ffc2d0' : '#a9d2ff');
                    break;
                case 'dust':
                case 'stamp':
                    p.vx = Math.cos(a) * (1.2 + out * 1.4);
                    p.vz = Math.sin(a) * (1.2 + out * 1.4);
                    p.vy = 0.2 + Math.random() * 0.6;
                    p.drag = 3.5;
                    p.life = 0.5 + Math.random() * 0.35;
                    p.size = 0.16 + Math.random() * 0.14;
                    p.grow = 0.4;
                    this.paint(p, kind === 'stamp' ? '#fff3d6' : '#eadfc8');
                    break;
                case 'confetti':
                    p.vx = Math.cos(a) * (1 + out * 4);
                    p.vz = Math.sin(a) * (1 + out * 4);
                    p.vy = 3 + Math.random() * 5;
                    p.gravity = -5;
                    p.drag = 0.8;
                    p.life = 1.8 + Math.random() * 1.4;
                    p.size = 0.12 + Math.random() * 0.1;
                    p.flutter = 2 + Math.random() * 3;
                    this.paint(p, ['#ef7d6d', '#edb94c', '#59c98a', '#4d8fe8', '#f9bfd0', '#9471c4'][i % 6] as string);
                    break;
                case 'petals':
                    p.x += (Math.random() - 0.5) * 1.4;
                    p.z += (Math.random() - 0.5) * 1.4;
                    p.vx = 0.25 + Math.random() * 0.3;
                    p.vz = 0.1 + Math.random() * 0.25;
                    p.vy = -0.25 - Math.random() * 0.2;
                    p.life = 4 + Math.random() * 3;
                    p.size = 0.07 + Math.random() * 0.05;
                    p.flutter = 1.5 + Math.random() * 2;
                    this.paint(p, i % 2 === 0 ? '#ffd3df' : '#f9bfd0');
                    break;
            }
        }
    }

    /** A flat ring that grows and fades on the ground: "look here". */
    ring(at: THREE.Vector3, color: Hex, size = 1.4, life = 1.1): void {
        let ring = this.rings.find((item) => item.age >= item.life);
        if (!ring) {
            const mesh = new THREE.Mesh(
                new THREE.RingGeometry(0.86, 1, 40),
                new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.renderOrder = 9;
            this.root.add(mesh);
            ring = { mesh, age: 0, life, size };
            this.rings.push(ring);
        }
        ring.mesh.material.color.set(color);
        ring.mesh.position.copy(at);
        ring.mesh.position.y = Math.max(at.y, 0.08);
        ring.mesh.visible = true;
        ring.age = 0;
        ring.life = life;
        ring.size = size;
    }

    /** Dots that flow from one point to another for `seconds`: data on the move. */
    stream(from: Point, to: Point, color: Hex, seconds = 1.6, height = 1.4): void {
        this.streams.push({ from, to, color: new THREE.Color(color), until: this.time + seconds, height, timer: 0 });
    }

    /** Drops everything in flight (tokens, streams, rings), for a restart. Waiting scripts are released. */
    clear(): void {
        for (const flight of this.flights.splice(0)) {
            this.give(flight);
            flight.done();
        }
        this.streams.length = 0;
        for (const ring of this.rings) {
            ring.age = ring.life;
            ring.mesh.visible = false;
        }
    }

    // ----- The loop -----

    update(dt: number, time: number): void {
        this.time = time;

        for (let i = this.flights.length - 1; i >= 0; i -= 1) {
            const flight = this.flights[i] as Flight;
            flight.age += dt;
            const t = clamp(flight.age / flight.duration);
            const from = resolve(flight.from);
            const to = resolve(flight.to);
            const k = ease.inOut(t);
            flight.node.position.lerpVectors(from, to, k);
            flight.node.position.y += Math.sin(Math.PI * t) * flight.height;
            flight.node.rotation.y = t * flight.spin;
            flight.node.rotation.z = Math.sin(t * Math.PI) * 0.4;
            const pop = t < 0.18 ? ease.outBack(t / 0.18) : t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
            flight.node.scale.setScalar(Math.max(pop * flight.scale, 0.001));
            if (flight.trail) {
                flight.trailTimer -= dt;
                if (flight.trailTimer <= 0) {
                    flight.trailTimer = 0.045;
                    const p = this.spawn();
                    p.x = flight.node.position.x;
                    p.y = flight.node.position.y;
                    p.z = flight.node.position.z;
                    p.vx = (Math.random() - 0.5) * 0.3;
                    p.vy = (Math.random() - 0.5) * 0.3;
                    p.vz = (Math.random() - 0.5) * 0.3;
                    p.life = 0.5;
                    p.size = 0.09;
                    p.r = flight.trail.r;
                    p.g = flight.trail.g;
                    p.b = flight.trail.b;
                }
            }
            if (t >= 1) {
                this.flights.splice(i, 1);
                this.give(flight);
                flight.done();
            }
        }

        for (let i = this.streams.length - 1; i >= 0; i -= 1) {
            const stream = this.streams[i] as Stream;
            if (time > stream.until) {
                this.streams.splice(i, 1);
                continue;
            }
            stream.timer -= dt;
            if (stream.timer <= 0) {
                stream.timer = 0.07;
                const from = resolve(stream.from);
                const to = resolve(stream.to);
                const p = this.spawn();
                p.x = from.x;
                p.y = from.y;
                p.z = from.z;
                const flightTime = 0.9;
                p.life = flightTime;
                p.vx = (to.x - from.x) / flightTime;
                p.vz = (to.z - from.z) / flightTime;
                // Thrown so that gravity brings it down exactly at the target.
                p.gravity = (-8 * stream.height) / (flightTime * flightTime);
                p.vy = (to.y - from.y) / flightTime - (p.gravity * flightTime) / 2;
                p.drag = 0;
                p.size = 0.11;
                p.r = stream.color.r;
                p.g = stream.color.g;
                p.b = stream.color.b;
            }
        }

        for (const ring of this.rings) {
            if (ring.age >= ring.life) {
                ring.mesh.visible = false;
                continue;
            }
            ring.age += dt;
            const t = clamp(ring.age / ring.life);
            ring.mesh.scale.setScalar(0.2 + ease.out(t) * ring.size);
            ring.mesh.material.opacity = (1 - t) * 0.9;
        }

        // Ambient: petals by day, fireflies by night.
        if (this.petalSources.length > 0) {
            this.petalTimer -= dt;
            if (this.petalTimer <= 0) {
                this.petalTimer = 0.45;
                const source = this.petalSources[Math.floor(Math.random() * this.petalSources.length)] as THREE.Vector3;
                this.burst(source, 'petals', 1);
            }
        }
        if (this.fireflies > 0) {
            this.fireflyTimer -= dt;
            if (this.fireflyTimer <= 0) {
                this.fireflyTimer = 0.5 / this.fireflies;
                const p = this.spawn();
                p.x = (Math.random() - 0.5) * 22;
                p.z = (Math.random() - 0.5) * 22;
                p.y = 0.4 + Math.random() * 1.6;
                p.vx = (Math.random() - 0.5) * 0.4;
                p.vz = (Math.random() - 0.5) * 0.4;
                p.vy = (Math.random() - 0.5) * 0.2;
                p.life = 3 + Math.random() * 2;
                p.size = 0.1;
                p.flutter = 1;
                this.paint(p, '#f6ffa8');
            }
        }

        let dirty = false;
        for (let i = 0; i < MAX_PARTICLES; i += 1) {
            const p = this.particles[i] as Particle;
            if (!p.alive) continue;
            dirty = true;
            p.age += dt;
            if (p.age >= p.life) {
                p.alive = false;
                this.sizes[i] = 0;
                this.tints[i * 4 + 3] = 0;
                continue;
            }
            const drag = Math.exp(-p.drag * dt);
            p.vx *= drag;
            p.vz *= drag;
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            if (p.flutter > 0) {
                p.x += Math.sin(p.age * p.flutter + i) * dt * 0.5;
                p.z += Math.cos(p.age * p.flutter * 0.8 + i) * dt * 0.4;
            }
            const t = p.age / p.life;
            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;
            this.sizes[i] = p.size * (1 + p.grow * t * 3);
            this.tints[i * 4] = p.r;
            this.tints[i * 4 + 1] = p.g;
            this.tints[i * 4 + 2] = p.b;
            // Fade in fast, out slowly.
            this.tints[i * 4 + 3] = Math.min(t * 8, 1) * (1 - t * t);
        }
        if (dirty) {
            const attributes = this.points.geometry.attributes as Record<string, THREE.BufferAttribute>;
            (attributes.position as THREE.BufferAttribute).needsUpdate = true;
            (attributes.size as THREE.BufferAttribute).needsUpdate = true;
            (attributes.tint as THREE.BufferAttribute).needsUpdate = true;
        }
    }
}
