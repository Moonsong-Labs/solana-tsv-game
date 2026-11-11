/**
 * The stage: renderer, isometric camera, lighting through the day, post
 * effects, picking and the bridge from world positions to screen positions.
 *
 * The stage knows nothing about the venue. The world (models) and the
 * director (what happens) sit on top of it.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { MATERIALS, clamp, damp, forgetSigns, lerp, setSignGlow } from './kit.ts';

/** A look for one moment of the day. `setDaytime` blends between neighbours. */
interface DayKey {
    /** 0 is dawn, 1 is deep night. */
    at: number;
    sun: string;
    sunPower: number;
    /** Sun direction: compass angle around Y and height above the horizon, in degrees. */
    azimuth: number;
    elevation: number;
    sky: string;
    ground: string;
    fill: number;
    bgTop: string;
    bgBottom: string;
    /** How strongly windows and lanterns glow. */
    glow: number;
    bloom: number;
    exposure: number;
    /** How dark the sun's shadows are: 1 is full, lower lets the ambient light in. */
    shadow: number;
}

const DAY: readonly DayKey[] = [
    // Dawn: pink and soft, long shadows.
    {
        at: 0,
        sun: '#ffc9a8',
        sunPower: 2.2,
        azimuth: 118,
        elevation: 32,
        sky: '#ffd9e0',
        ground: '#e0bfa6',
        fill: 1.35,
        bgTop: '#ffd6c9',
        bgBottom: '#fff0d8',
        glow: 0.75,
        bloom: 0.32,
        exposure: 1.0,
        shadow: 0.62,
    },
    // Morning: clear and fresh.
    {
        at: 0.2,
        sun: '#fff1d6',
        sunPower: 2.65,
        azimuth: 132,
        elevation: 50,
        sky: '#e2f1ff',
        ground: '#e6cfa6',
        fill: 1.4,
        bgTop: '#cfeaf5',
        bgBottom: '#fdf3df',
        glow: 0.25,
        bloom: 0.2,
        exposure: 1.0,
        shadow: 0.66,
    },
    // Noon: bright.
    {
        at: 0.4,
        sun: '#fffaf0',
        sunPower: 2.8,
        azimuth: 150,
        elevation: 60,
        sky: '#e6f3ff',
        ground: '#e8d2a8',
        fill: 1.4,
        bgTop: '#c6e6f3',
        bgBottom: '#f8f3e3',
        glow: 0.2,
        bloom: 0.18,
        exposure: 1.0,
        shadow: 0.68,
    },
    // Afternoon: the light turns golden; the sky stays blue above and goes peach at the horizon.
    {
        at: 0.6,
        sun: '#ffdfa8',
        sunPower: 2.7,
        azimuth: 200,
        elevation: 44,
        sky: '#e8effb',
        ground: '#e6c79c',
        fill: 1.3,
        bgTop: '#b9dcee',
        bgBottom: '#ffe6c2',
        glow: 0.45,
        bloom: 0.26,
        exposure: 1.0,
        shadow: 0.64,
    },
    // Dusk: orange into violet, lanterns on.
    {
        at: 0.8,
        sun: '#ff9d7a',
        sunPower: 2.1,
        azimuth: 232,
        elevation: 26,
        sky: '#d3c0f0',
        ground: '#b99aa8',
        fill: 1.3,
        bgTop: '#8f7fc4',
        bgBottom: '#ffb792',
        glow: 1.25,
        bloom: 0.5,
        exposure: 1.08,
        shadow: 0.6,
    },
    // Night: blue moonlight, everything glows.
    {
        at: 1,
        sun: '#9db8ff',
        sunPower: 1.15,
        azimuth: 150,
        elevation: 46,
        sky: '#6f86d6',
        ground: '#4c4a78',
        fill: 1.2,
        bgTop: '#27305f',
        bgBottom: '#5a5a9a',
        glow: 1.9,
        bloom: 0.72,
        exposure: 1.1,
        shadow: 0.5,
    },
];

const BackgroundShader = {
    uniforms: {
        top: { value: new THREE.Color('#cfeaf5') },
        bottom: { value: new THREE.Color('#fdf3df') },
        glowColor: { value: new THREE.Color('#ffffff') },
        glow: { value: 0.35 },
        stars: { value: 0 },
        aspect: { value: 1.6 },
        time: { value: 0 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 1.0, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 bottom;
        uniform vec3 glowColor;
        uniform float glow;
        uniform float stars;
        uniform float aspect;
        uniform float time;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
            vec3 color = mix(bottom, top, smoothstep(0.0, 1.0, vUv.y));
            vec2 c = (vUv - vec2(0.5, 0.52)) * vec2(aspect, 1.0);
            float halo = exp(-dot(c, c) * 2.6);
            color = mix(color, glowColor, halo * glow);
            if (stars > 0.01) {
                vec2 grid = vUv * vec2(aspect, 1.0) * 60.0;
                vec2 cell = floor(grid);
                float seed = hash(cell);
                vec2 offset = vec2(hash(cell + 3.1), hash(cell + 7.7));
                float dist = length(fract(grid) - offset);
                float twinkle = 0.6 + 0.4 * sin(time * (1.0 + seed * 2.0) + seed * 40.0);
                float star = step(0.9, seed) * smoothstep(0.09, 0.0, dist) * twinkle;
                color += vec3(1.0, 0.96, 0.85) * star * stars * smoothstep(0.25, 0.8, vUv.y);
            }
            gl_FragColor = vec4(color, 1.0);
        }
    `,
};

/** Tilt-shift blur away from the focus line, a vignette and a light grade, in one pass. */
const FinishShader = {
    uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        resolution: { value: new THREE.Vector2(1, 1) },
        focusY: { value: 0.5 },
        range: { value: 0.2 },
        blur: { value: 5 },
        vignette: { value: 0.28 },
        saturation: { value: 1.08 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float focusY;
        uniform float range;
        uniform float blur;
        uniform float vignette;
        uniform float saturation;
        varying vec2 vUv;
        void main() {
            float away = abs(vUv.y - focusY);
            float radius = smoothstep(range, range + 0.42, away) * blur;
            vec3 color = texture2D(tDiffuse, vUv).rgb;
            if (radius > 0.35) {
                vec3 sum = color;
                float total = 1.0;
                // A golden-angle spiral of taps.
                for (int i = 1; i <= 18; i++) {
                    float f = float(i);
                    float r = sqrt(f / 18.0) * radius;
                    float a = f * 2.39996323;
                    vec2 offset = vec2(cos(a), sin(a)) * r / resolution;
                    sum += texture2D(tDiffuse, vUv + offset).rgb;
                    total += 1.0;
                }
                color = sum / total;
            }
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, saturation);
            vec2 q = vUv - 0.5;
            float shade = smoothstep(0.35, 0.95, length(q * vec2(1.1, 1.25)));
            color *= 1.0 - shade * vignette;
            gl_FragColor = vec4(color, 1.0);
        }
    `,
};

export type Quality = 'low' | 'medium' | 'high';

export interface View {
    /** The world point the camera looks at. */
    target: THREE.Vector3;
    /** World units visible from top to bottom of the screen. Smaller is closer. */
    span: number;
    /** Where the target sits on screen: 0 is the centre, +1 the top edge, −1 the bottom edge. */
    lift: number;
    /** Sideways placement: 0 is the centre, +1 the right edge. */
    shift: number;
}

export interface PickHit {
    id: string;
    point: THREE.Vector3;
}

interface Tracked {
    element: HTMLElement;
    position: () => THREE.Vector3 | undefined;
    offsetY: number;
    /** Keeps the pin this far inside the stage's edges: [top, side, bottom] in pixels. */
    keepIn: readonly [number, number, number] | undefined;
}

/** How fast the camera settles on a new view, per second. */
const CAMERA_RATE = 2.6;

export class Stage {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene = new THREE.Scene();
    readonly camera: THREE.OrthographicCamera;
    readonly sun: THREE.DirectionalLight;
    readonly fill: THREE.HemisphereLight;

    /** Seconds of game time, scaled by `timeScale`. */
    time = 0;
    /** Speeds up or pauses everything except the camera. */
    timeScale = 1;
    /** Frames drawn, for tests. */
    frames = 0;

    private readonly composer: EffectComposer;
    private readonly aoPass: GTAOPass;
    private readonly bloomPass: UnrealBloomPass;
    private readonly finishPass: ShaderPass;
    private readonly background: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

    private readonly view: View = { target: new THREE.Vector3(0, 0, 0), span: 30, lift: 0, shift: 0 };
    private readonly goal: View = { target: new THREE.Vector3(0, 0, 0), span: 30, lift: 0, shift: 0 };
    /** The player's own pan and zoom, added on top of the directed view. */
    private readonly nudge = { x: 0, y: 0, zoom: 1 };
    private sway = 0;

    private daytime = 0.2;
    private daytimeGoal = 0.2;

    private readonly updaters = new Set<(dt: number, time: number) => void>();
    private readonly tracked = new Set<Tracked>();
    private readonly pickables: { object: THREE.Object3D; id: string }[] = [];
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2(2, 2);
    private pointerInside = false;
    private hoverId: string | undefined;

    private raf = 0;
    private last = 0;
    private running = false;
    private width = 1;
    private height = 1;
    private quality: Quality;
    private slowFrames = 0;
    /** False once the player has picked a quality: the stage no longer lowers it on its own. */
    private governed = true;
    private readonly scratch = {
        direction: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(),
        focus: new THREE.Vector3(),
        projected: new THREE.Vector3(),
    };
    private readonly observer: ResizeObserver;
    private readonly cleanup: (() => void)[] = [];

    /** Called when the pointer enters or leaves a pickable. */
    onHover: ((id: string | undefined) => void) | undefined;
    /** Called when a pickable is clicked. */
    onPick: ((hit: PickHit) => void) | undefined;
    /** Called after the stage has taken a new size. */
    onResize: (() => void) | undefined;
    /** Called when the quality changes, by the player or by the stage itself. */
    onQuality: ((quality: Quality) => void) | undefined;
    /** Whether the player may pan and zoom. */
    freeCamera = true;

    constructor(
        readonly canvas: HTMLCanvasElement,
        readonly overlay: HTMLElement,
        quality: Quality = 'high',
    ) {
        this.quality = quality;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 220);

        this.sun = new THREE.DirectionalLight('#fff1d6', 2.9);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.near = 1;
        this.sun.shadow.camera.far = 120;
        const reach = 23;
        this.sun.shadow.camera.left = -reach;
        this.sun.shadow.camera.right = reach;
        this.sun.shadow.camera.top = reach;
        this.sun.shadow.camera.bottom = -reach;
        this.sun.shadow.bias = -0.0006;
        this.sun.shadow.normalBias = 0.035;
        // Soft-edged and light: things sit on the ground in a pool of shade, not on a black cut-out.
        this.sun.shadow.radius = 3.6;
        this.scene.add(this.sun, this.sun.target);

        this.fill = new THREE.HemisphereLight('#e2f1ff', '#d9c7a8', 1.2);
        this.scene.add(this.fill);

        this.background = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.ShaderMaterial({
                uniforms: THREE.UniformsUtils.clone(BackgroundShader.uniforms),
                vertexShader: BackgroundShader.vertexShader,
                fragmentShader: BackgroundShader.fragmentShader,
                depthTest: false,
                depthWrite: false,
            }),
        );
        this.background.frustumCulled = false;
        this.background.renderOrder = -1000;
        this.scene.add(this.background);

        const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.aoPass = new GTAOPass(this.scene, this.camera, 2, 2);
        this.aoPass.updateGtaoMaterial({
            radius: 0.9,
            distanceExponent: 1.4,
            thickness: 1.2,
            scale: 1.15,
            samples: 12,
            distanceFallOff: 1,
            screenSpaceRadius: false,
        });
        this.aoPass.blendIntensity = 0.9;
        // The backdrop is a full-screen quad drawn by its own shader. The occlusion pass redraws the
        // scene with a plain material, which would turn that quad into a real wall at the origin
        // and shade the ground around it, so it sits that pass out.
        const renderOcclusion = this.aoPass.render.bind(this.aoPass);
        this.aoPass.render = (...args: Parameters<GTAOPass['render']>): void => {
            this.background.visible = false;
            renderOcclusion(...args);
            this.background.visible = true;
        };
        this.composer.addPass(this.aoPass);
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.25, 0.7, 0.92);
        this.composer.addPass(this.bloomPass);
        this.finishPass = new ShaderPass(FinishShader);
        this.composer.addPass(this.finishPass);
        this.composer.addPass(new OutputPass());

        this.applyQuality();
        this.applyDaytime(this.daytime);

        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas.parentElement ?? canvas);
        this.resize();
        this.bindPointer();
    }

    // ----- The loop -----

    start(): void {
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        const frame = (now: number): void => {
            if (!this.running) return;
            // The first callback's timestamp can precede `last`; a long pause (a hidden tab) is cut short.
            const raw = Math.min(Math.max((now - this.last) / 1000, 0), 0.08);
            this.last = now;
            this.step(raw);
            this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }

    stop(): void {
        this.running = false;
        cancelAnimationFrame(this.raf);
    }

    /** Advances and draws one frame. `raw` is real seconds. */
    step(raw: number): void {
        const dt = raw * this.timeScale;
        this.time += dt;
        for (const update of this.updaters) update(dt, this.time);
        this.updateDaytime(raw);
        this.updateCamera(raw);
        this.updateHover();
        this.composer.render(raw);
        this.updateTracked();
        this.frames += 1;
        this.govern(raw);
    }

    /** Runs `update` every frame with the scaled time step. Returns a function that removes it. */
    onUpdate(update: (dt: number, time: number) => void): () => void {
        this.updaters.add(update);
        return () => this.updaters.delete(update);
    }

    dispose(): void {
        this.stop();
        this.observer.disconnect();
        for (const fn of this.cleanup) fn();
        forgetSigns();
        // Everything the scene put on the graphics card: geometry, materials and their textures.
        const materials = new Set<THREE.Material>();
        this.scene.traverse((node) => {
            const mesh = node as THREE.Mesh;
            mesh.geometry?.dispose();
            const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(material)) for (const item of material) materials.add(item);
            else if (material) materials.add(material);
        });
        for (const material of materials) {
            (material as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
            // The kit's shared materials outlive a stage: the next one uses them again.
            if (!(Object.values(MATERIALS) as THREE.Material[]).includes(material)) material.dispose();
        }
        this.sun.shadow.map?.dispose();
        for (const pass of this.composer.passes) pass.dispose();
        this.composer.dispose();
        this.renderer.dispose();
    }

    // ----- Quality -----

    /** Sets the graphics quality. `chosen` marks a choice made by the player, which the stage then leaves alone. */
    setQuality(quality: Quality, chosen = false): void {
        if (chosen) this.governed = false;
        this.quality = quality;
        this.applyQuality();
        this.resize();
        this.onQuality?.(quality);
    }

    getQuality(): Quality {
        return this.quality;
    }

    private applyQuality(): void {
        this.aoPass.enabled = this.quality === 'high';
        this.bloomPass.enabled = this.quality !== 'low';
        this.sun.shadow.mapSize.set(this.quality === 'low' ? 1024 : 2048, this.quality === 'low' ? 1024 : 2048);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
    }

    /** Steps the quality down when frames stay slow, so weak machines stay playable. */
    private govern(raw: number): void {
        if (!this.governed) return;
        if (raw > 0.034) this.slowFrames += 1;
        else this.slowFrames = Math.max(0, this.slowFrames - 2);
        if (this.slowFrames > 90 && this.quality !== 'low') {
            this.slowFrames = 0;
            this.setQuality(this.quality === 'high' ? 'medium' : 'low');
        }
    }

    private resize(): void {
        const host = this.canvas.parentElement ?? this.canvas;
        const width = Math.max(host.clientWidth, 2);
        const height = Math.max(host.clientHeight, 2);
        this.width = width;
        this.height = height;
        const cap = this.quality === 'low' ? 1 : this.quality === 'medium' ? 1.5 : 2;
        const ratio = Math.min(window.devicePixelRatio || 1, cap);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(width, height, false);
        this.composer.setPixelRatio(ratio);
        this.composer.setSize(width, height);
        this.aoPass.setSize(width * ratio, height * ratio);
        const uniforms = this.finishPass.uniforms as typeof FinishShader.uniforms;
        uniforms.resolution.value.set(width * ratio, height * ratio);
        (this.background.material.uniforms.aspect as THREE.IUniform<number>).value = width / height;
        // Refit the projection without cutting short a camera move that is under way.
        this.updateCamera(0);
        this.onResize?.();
    }

    // ----- Camera -----

    /** Directs the camera to a new view; it eases there. Clears the player's own pan and zoom. */
    look(
        view: Partial<{
            target: THREE.Vector3 | readonly [number, number, number];
            span: number;
            lift: number;
            shift: number;
        }>,
        snap = false,
    ): void {
        if (view.target) {
            if (view.target instanceof THREE.Vector3) this.goal.target.copy(view.target);
            else this.goal.target.set(view.target[0], view.target[1], view.target[2]);
        }
        if (view.span !== undefined) this.goal.span = view.span;
        if (view.lift !== undefined) this.goal.lift = view.lift;
        if (view.shift !== undefined) this.goal.shift = view.shift;
        this.nudge.x = 0;
        this.nudge.y = 0;
        this.nudge.zoom = 1;
        if (snap) {
            this.view.target.copy(this.goal.target);
            this.view.span = this.goal.span;
            this.view.lift = this.goal.lift;
            this.view.shift = this.goal.shift;
            this.updateCamera(0);
        }
    }

    /** A slow side-to-side drift, for the title screen. 0 turns it off. */
    setSway(amount: number): void {
        this.sway = amount;
    }

    /**
     * The span that fits a square island of side `size` in the viewport,
     * leaving `margin` (a fraction of the screen) around it.
     */
    spanToFit(size: number, margin = 0.08): number {
        const aspect = this.width / this.height;
        const across = size * Math.SQRT2;
        const tall = across * Math.sin(ELEVATION) + 6 * Math.cos(ELEVATION);
        return Math.max(tall, across / aspect) * (1 + margin * 2);
    }

    /** Eases the view towards its goal over `raw` seconds (0 leaves it where it is) and places the camera. */
    private updateCamera(raw: number): void {
        const k = raw <= 0 ? 0 : 1 - Math.exp(-CAMERA_RATE * raw);
        this.view.target.lerp(this.goal.target, k);
        this.view.span = lerp(this.view.span, this.goal.span, k);
        this.view.lift = lerp(this.view.lift, this.goal.lift, k);
        this.view.shift = lerp(this.view.shift, this.goal.shift, k);

        const span = this.view.span / this.nudge.zoom;
        const aspect = this.width / this.height;
        this.camera.top = span / 2;
        this.camera.bottom = -span / 2;
        this.camera.left = (-span * aspect) / 2;
        this.camera.right = (span * aspect) / 2;

        const azimuth = AZIMUTH + Math.sin(performance.now() / 9000) * this.sway;
        const direction = this.scratch.direction.set(
            Math.sin(azimuth) * Math.cos(ELEVATION),
            Math.sin(ELEVATION),
            Math.cos(azimuth) * Math.cos(ELEVATION),
        );
        const right = this.scratch.right.set(Math.cos(azimuth), 0, -Math.sin(azimuth));
        const up = this.scratch.up.crossVectors(direction, right);
        // Slide the camera so the target sits where `lift` and `shift` ask.
        const focus = this.scratch.focus
            .copy(this.view.target)
            .addScaledVector(up, (-this.view.lift * span) / 2 + this.nudge.y)
            .addScaledVector(right, (-this.view.shift * span * aspect) / 2 + this.nudge.x);
        this.camera.position.copy(focus).addScaledVector(direction, 80);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(focus);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();

        // Shadows follow the island, not the camera, so they never swim.
        const uniforms = this.finishPass.uniforms as typeof FinishShader.uniforms;
        uniforms.focusY.value = 0.5 + this.view.lift * 0.5;
        // Closer views get a tighter band of focus.
        uniforms.range.value = clamp(0.16 + (span / 60) * 0.3, 0.16, 0.5);
        uniforms.blur.value = this.quality === 'low' ? 0 : 4.5 * (this.renderer.getPixelRatio() / 1.5);
    }

    private bindPointer(): void {
        const canvas = this.canvas;
        let dragging = false;
        // The pointer that started the drag; a second finger is ignored rather than fought over.
        let dragId = -1;
        let moved = 0;
        let lastX = 0;
        let lastY = 0;
        const setPointer = (event: PointerEvent): void => {
            const rect = canvas.getBoundingClientRect();
            this.pointer.set(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1,
            );
        };
        const down = (event: PointerEvent): void => {
            if (dragging) return;
            dragging = true;
            dragId = event.pointerId;
            moved = 0;
            lastX = event.clientX;
            lastY = event.clientY;
            setPointer(event);
        };
        const move = (event: PointerEvent): void => {
            this.pointerInside = true;
            if (dragging && event.pointerId !== dragId) return;
            setPointer(event);
            if (!dragging || !this.freeCamera) return;
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;
            moved += Math.abs(dx) + Math.abs(dy);
            const unitsPerPixel = this.view.span / this.nudge.zoom / this.height;
            this.nudge.x = clamp(this.nudge.x - dx * unitsPerPixel, -16, 16);
            this.nudge.y = clamp(this.nudge.y + dy * unitsPerPixel, -12, 12);
        };
        const up = (event: PointerEvent): void => {
            if (!dragging || event.pointerId !== dragId) return;
            if (moved < 6) {
                setPointer(event);
                const hit = this.pick();
                if (hit) this.onPick?.(hit);
            }
            dragging = false;
        };
        const cancel = (event: PointerEvent): void => {
            if (event.pointerId === dragId) dragging = false;
        };
        const leave = (): void => {
            this.pointerInside = false;
            dragging = false;
        };
        const wheel = (event: WheelEvent): void => {
            if (!this.freeCamera) return;
            event.preventDefault();
            this.nudge.zoom = clamp(this.nudge.zoom * Math.exp(-event.deltaY * 0.0012), 0.6, 3.2);
        };
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        canvas.addEventListener('pointerleave', leave);
        canvas.addEventListener('wheel', wheel, { passive: false });
        this.cleanup.push(() => {
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
            canvas.removeEventListener('pointerleave', leave);
            canvas.removeEventListener('wheel', wheel);
        });
    }

    // ----- Picking and labels -----

    /** Makes `object` (and its children) clickable under `id`. */
    addPickable(object: THREE.Object3D, id: string): void {
        this.pickables.push({ object, id });
    }

    private pick(): PickHit | undefined {
        if (this.pickables.length === 0) return undefined;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        let best: PickHit | undefined;
        let bestDistance = Infinity;
        for (const { object, id } of this.pickables) {
            const hits = this.raycaster.intersectObject(object, true);
            const first = hits[0];
            if (first && first.distance < bestDistance) {
                bestDistance = first.distance;
                best = { id, point: first.point };
            }
        }
        return best;
    }

    private updateHover(): void {
        if (!this.onHover) return;
        const id = this.pointerInside ? this.pick()?.id : undefined;
        if (id !== this.hoverId) {
            this.hoverId = id;
            this.canvas.style.cursor = id ? 'pointer' : '';
            this.onHover(id);
        }
    }

    /** Projects a world position to CSS pixels inside the stage. */
    project(position: THREE.Vector3): { x: number; y: number } {
        const p = this.scratch.projected.copy(position).project(this.camera);
        return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height };
    }

    /**
     * Keeps an HTML element pinned over a world position (name tags, speech
     * bubbles). The element should be absolutely positioned at 0,0 in the
     * overlay. `keepIn` holds it inside the screen's edges. Returns a
     * function that stops tracking it.
     */
    track(
        element: HTMLElement,
        position: () => THREE.Vector3 | undefined,
        offsetY = 0,
        keepIn?: readonly [number, number, number],
    ): () => void {
        const entry: Tracked = { element, position, offsetY, keepIn };
        this.tracked.add(entry);
        return () => this.tracked.delete(entry);
    }

    private updateTracked(): void {
        for (const entry of this.tracked) {
            const position = entry.position();
            if (!position) {
                entry.element.style.visibility = 'hidden';
                continue;
            }
            let { x, y } = this.project(position);
            y += entry.offsetY;
            if (entry.keepIn) {
                const [top, side, bottom] = entry.keepIn;
                x = clamp(x, side, Math.max(this.width - side, side));
                y = clamp(y, top, Math.max(this.height - bottom, top));
            }
            entry.element.style.visibility = 'visible';
            entry.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        }
    }

    /** The stage's size in CSS pixels. */
    size(): { width: number; height: number } {
        return { width: this.width, height: this.height };
    }

    /** How many CSS pixels one world unit covers on screen, for sizing overlays. */
    pixelsPerUnit(): number {
        return this.height / (this.view.span / this.nudge.zoom);
    }

    // ----- Time of day -----

    /** Moves the day along: 0 dawn, 0.2 morning, 0.4 noon, 0.6 afternoon, 0.8 dusk, 1 night. */
    setDaytime(value: number, snap = false): void {
        this.daytimeGoal = clamp(value, 0, 1);
        if (snap) {
            this.daytime = this.daytimeGoal;
            this.applyDaytime(this.daytime);
        }
    }

    getDaytime(): number {
        return this.daytime;
    }

    private updateDaytime(raw: number): void {
        if (Math.abs(this.daytime - this.daytimeGoal) > 0.0005) {
            this.daytime = damp(this.daytime, this.daytimeGoal, 0.9, raw);
            this.applyDaytime(this.daytime);
        }
        (this.background.material.uniforms.time as THREE.IUniform<number>).value = this.time;
    }

    private applyDaytime(value: number): void {
        let index = 0;
        while (index < DAY.length - 2 && value > (DAY[index + 1] as DayKey).at) index += 1;
        const a = DAY[index] as DayKey;
        const b = DAY[index + 1] as DayKey;
        const t = clamp((value - a.at) / (b.at - a.at));
        const mix = (x: string, y: string): THREE.Color => new THREE.Color(x).lerp(new THREE.Color(y), t);

        this.sun.color.copy(mix(a.sun, b.sun));
        this.sun.intensity = lerp(a.sunPower, b.sunPower, t);
        const azimuth = THREE.MathUtils.degToRad(lerp(a.azimuth, b.azimuth, t));
        const elevation = THREE.MathUtils.degToRad(lerp(a.elevation, b.elevation, t));
        this.sun.position
            .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
            .multiplyScalar(60);
        this.sun.target.position.set(0, 0, 0);
        this.sun.target.updateMatrixWorld();

        this.fill.color.copy(mix(a.sky, b.sky));
        this.fill.groundColor.copy(mix(a.ground, b.ground));
        this.fill.intensity = lerp(a.fill, b.fill, t);

        const uniforms = this.background.material.uniforms as Record<string, THREE.IUniform>;
        (uniforms.top as THREE.IUniform<THREE.Color>).value.copy(mix(a.bgTop, b.bgTop));
        (uniforms.bottom as THREE.IUniform<THREE.Color>).value.copy(mix(a.bgBottom, b.bgBottom));
        (uniforms.glowColor as THREE.IUniform<THREE.Color>).value
            .copy(mix(a.bgBottom, b.bgBottom))
            .lerp(new THREE.Color('#ffffff'), 0.5);
        (uniforms.stars as THREE.IUniform<number>).value = clamp((value - 0.78) / 0.2);

        const glow = lerp(a.glow, b.glow, t);
        // Windows read as pale panes by day and warm light at night.
        MATERIALS.window.color.setScalar(0.62 + glow * 0.75);
        MATERIALS.lit.color.setScalar(0.95 + glow * 0.35);
        this.glow = glow;
        this.sun.shadow.intensity = lerp(a.shadow, b.shadow, t);
        // Painted signs light themselves from dusk on.
        setSignGlow(clamp((glow - 0.4) * 0.55, 0, 0.75));
        this.bloomPass.strength = lerp(a.bloom, b.bloom, t);
        this.renderer.toneMappingExposure = lerp(a.exposure, b.exposure, t);
    }

    /** How strongly lights glow right now (0.2 at noon, about 1.9 at night); lamps scale themselves by it. */
    glow = 0.25;
}

/** The camera's compass angle and height: the classic 2:1 game isometric, a touch higher. */
const AZIMUTH = Math.PI / 4;
const ELEVATION = THREE.MathUtils.degToRad(32);
