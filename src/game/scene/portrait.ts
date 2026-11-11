/**
 * The desk's portrait: a live close-up of the visitor at the window, drawn
 * by a small renderer of its own. It mirrors the mood and speech of the
 * character standing in the town.
 */
import * as THREE from 'three';

import { Character, type CharacterSpec } from '../world/character.ts';

export class PortraitStudio {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera: THREE.OrthographicCamera;
    private subject: Character | undefined;
    private source: Character | undefined;
    private raf = 0;
    private last = 0;
    private running = false;

    /** The canvas the portrait draws on; the desk places it where the portrait goes. */
    readonly canvas: HTMLCanvasElement;

    constructor() {
        const canvas = document.createElement('canvas');
        canvas.className = 'gk-portrait__canvas';
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.setClearColor(0x000000, 0);
        this.camera = new THREE.OrthographicCamera(-0.74, 0.74, 0.74, -0.74, 0.1, 20);
        this.camera.position.set(1.5, 1.7, 4);
        this.camera.lookAt(0, 0.98, 0);
        const sun = new THREE.DirectionalLight('#fff4de', 2.6);
        sun.position.set(-2, 4, 5);
        this.scene.add(sun, new THREE.HemisphereLight('#f4f8ff', '#e6cdb4', 1.5));
    }

    /** Shows a person; `source` is their character in the town, whose mood and speech the portrait copies. */
    setSubject(spec: CharacterSpec | undefined, source?: Character): void {
        if (this.subject) {
            this.scene.remove(this.subject.root);
            this.subject.dispose();
        }
        this.subject = undefined;
        this.source = source;
        if (!spec) return;
        this.subject = new Character(spec);
        // Everyone fills the frame the same way, whatever their size in town.
        this.subject.root.scale.setScalar(1);
        this.subject.place([0, 0, 0], 0.22);
        this.subject.lookAt(new THREE.Vector3(2.2, 1.2, 6));
        this.scene.add(this.subject.root);
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        const frame = (now: number): void => {
            if (!this.running) return;
            const dt = Math.min((now - this.last) / 1000, 0.08);
            this.last = now;
            this.draw(dt);
            this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }

    stop(): void {
        this.running = false;
        cancelAnimationFrame(this.raf);
    }

    private draw(dt: number): void {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (width === 0 || height === 0) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
            this.renderer.setPixelRatio(ratio);
            this.renderer.setSize(width, height, false);
        }
        const subject = this.subject;
        if (subject) {
            const source = this.source;
            if (source) {
                if (subject.getMood() !== source.getMood()) subject.setMood(source.getMood());
                if (subject.isTalking !== source.isTalking) subject.setTalking(source.isTalking);
                const pose = source.currentPose;
                // Only the poses that read in a close-up.
                const mirrored =
                    pose === 'nod' || pose === 'shake' || pose === 'slump' || pose === 'cheer' ? pose : 'idle';
                if (subject.currentPose !== mirrored) subject.act(mirrored, mirrored === 'slump' ? undefined : 1.2);
            }
            subject.update(dt);
        }
        this.renderer.render(this.scene, this.camera);
    }

    dispose(): void {
        this.stop();
        this.canvas.remove();
        // Give the graphics context back at once: browsers allow only a few.
        this.renderer.forceContextLoss();
        this.renderer.dispose();
    }
}

let shared: PortraitStudio | undefined;

/**
 * The one portrait studio the game uses. A browser allows only a handful of
 * WebGL contexts, so the desk reuses this one for every visitor.
 */
export function portraitStudio(): PortraitStudio {
    shared ??= new PortraitStudio();
    return shared;
}

/** Releases the shared studio, when the game shuts down. */
export function disposePortraitStudio(): void {
    shared?.dispose();
    shared = undefined;
}
