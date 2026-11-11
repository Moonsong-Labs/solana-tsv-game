/**
 * The gate: the pool program's checks, as a place. A vermilion gate spans the
 * entry road; five lanterns under its beam are the five steps of the check
 * order and light one by one as a trade is judged. Beside it stands the
 * gatekeeper's booth and the rulebook (the venue's trade policy).
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, clamp, damp, ease, makeLamp, makeSign, type Lamp } from '../scene/kit.ts';
import type { LampState } from '../sim/types.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, hippedRoof, makeHitbox } from './place.ts';

export type { LampState };

export interface Gate extends Place {
    /** Lifts or lowers the barrier arm. */
    setBarrier(open: boolean): void;
    /** Sets the lantern of a step of the check order (1 to 5). */
    setLamp(step: number, state: LampState): void;
    /** Shows the verdict on the gate's plaque for a moment: a fill, or a refusal with its code. */
    showVerdict(outcome: 'fill' | 'refuse', label?: string): void;
    /** Hangs or removes the venue's PAUSED board across the gate. */
    setPaused(paused: boolean): void;
    /** Opens the rulebook at a policy version; 0 shows an empty stand. */
    setPolicy(version: number): void;
    /** Puts the gate back as the day starts: barrier down, lanterns waiting, the plaque showing its name. */
    reset(): void;
    anchors: Place['anchors'] & {
        /** Where the gatekeeper stands: inside the booth, at the window that faces the road. */
        keeper: THREE.Vector3;
        /** The booth's counter, where papers are handed over. */
        counter: THREE.Vector3;
        lamps: THREE.Vector3;
        book: THREE.Vector3;
        plaque: THREE.Vector3;
    };
}

const LAMP_TONES: Record<LampState, { color: string; glow: number }> = {
    idle: { color: '#f3e3bd', glow: 0.25 },
    run: { color: '#fff7d6', glow: 1.5 },
    pass: { color: PALETTE.ok, glow: 1.25 },
    fail: { color: PALETTE.stop, glow: 1.5 },
    open: { color: '#6fb8ff', glow: 1.15 },
    skip: { color: '#b9b2a6', glow: 0.05 },
    off: { color: '#8f8a84', glow: 0 },
    na: { color: '#8f8a84', glow: 0 },
};

export function createGate(): Gate {
    const group = new THREE.Group();
    group.name = 'gate';
    group.position.set(SITES.gate[0], 0, SITES.gate[1]);

    const HALF = 1.5;
    const POST = 3.5;
    const s = new Sculpt();

    // ----- The gate: two posts, a curved top beam and a tie beam -----
    for (const z of [-HALF, HALF]) {
        s.cyl(0.38, 0.43, 0.28, { color: PALETTE.stoneDark, at: [0, 0, z], seg: 14 });
        s.cyl(0.26, 0.26, 0.22, { color: PALETTE.charcoal, at: [0, 0.26, z], seg: 14 });
        s.cyl(0.2, 0.23, POST, { color: PALETTE.vermilion, at: [0, 0.3, z], seg: 16, layer: 'gloss' });
    }
    // The top beam sweeps up at its ends.
    const beam = new THREE.Shape();
    const reach = HALF + 0.85;
    beam.moveTo(-reach, 0.24);
    beam.quadraticCurveTo(0, -0.08, reach, 0.24);
    beam.lineTo(reach + 0.06, 0.6);
    beam.quadraticCurveTo(0, 0.24, -reach - 0.06, 0.6);
    beam.closePath();
    s.group({ at: [0, POST + 0.25, 0], rot: [0, Math.PI / 2, 0] }, (g) => {
        g.shape(beam, 0.52, { color: PALETTE.charcoal, bevel: 0.04, layer: 'gloss' });
        g.shape(beam, 0.4, { color: PALETTE.vermilion, at: [0, -0.22, 0], bevel: 0.04, layer: 'gloss' });
    });
    s.box(0.32, 0.28, HALF * 2 + 1.1, { color: PALETTE.vermilion, at: [0, POST - 0.66, 0], r: 0.05, layer: 'gloss' });
    // Wedges where the tie beam passes the posts.
    for (const z of [-HALF, HALF])
        s.box(0.44, 0.36, 0.12, { color: PALETTE.charcoal, at: [0, POST - 0.7, z + (z > 0 ? 0.3 : -0.3)], r: 0.02 });
    // The cords the lanterns hang from.
    const lampZ = [-0.96, -0.48, 0, 0.48, 0.96];
    for (const z of lampZ) s.cyl(0.014, 0.014, 0.14, { color: PALETTE.ink, at: [0, POST - 0.8, z], seg: 5 });

    // ----- The booth -----
    const bx = SITES.booth[0] - SITES.gate[0];
    const bz = SITES.booth[1] - SITES.gate[1];
    const B = 1.8;
    const FLOOR = 0.22;
    const SILL = 1.02;
    // The window is tall: from the camera's height the band above it would otherwise hide the gatekeeper's head.
    const HEAD = 2.46;
    const TOP = 2.8;
    s.group({ at: [bx, 0, bz] }, (g) => {
        g.box(B + 0.3, FLOOR, B + 0.3, { color: PALETTE.stone, r: 0.05 });
        // Back walls, full height, a shade darker so the keeper stands out.
        g.box(0.1, TOP - FLOOR, B, { color: '#e9d7b8', at: [-B / 2 + 0.05, FLOOR, 0], r: 0.02 });
        g.box(B, TOP - FLOOR, 0.1, { color: '#e9d7b8', at: [0, FLOOR, -B / 2 + 0.05], r: 0.02 });
        // Low walls on the two faces the camera sees, panelled in wood.
        g.box(B, SILL - FLOOR, 0.12, { color: PALETTE.wood, at: [0, FLOOR, B / 2 - 0.06], r: 0.03 });
        g.box(0.12, SILL - FLOOR, B, { color: PALETTE.wood, at: [B / 2 - 0.06, FLOOR, 0], r: 0.03 });
        for (const x of [-0.45, 0, 0.45])
            g.box(0.04, SILL - FLOOR - 0.12, 0.04, { color: PALETTE.woodDark, at: [x, FLOOR + 0.06, B / 2 + 0.01] });
        for (const z of [-0.45, 0, 0.45])
            g.box(0.04, SILL - FLOOR - 0.12, 0.04, { color: PALETTE.woodDark, at: [B / 2 + 0.01, FLOOR + 0.06, z] });
        // Corner posts and the band above the windows.
        for (const x of [-B / 2, B / 2]) {
            for (const z of [-B / 2, B / 2])
                g.box(0.16, TOP - FLOOR, 0.16, { color: PALETTE.woodDark, at: [x, FLOOR, z], r: 0.03 });
        }
        g.box(B + 0.1, TOP - HEAD, 0.14, { color: PALETTE.plaster, at: [0, HEAD, B / 2 - 0.06], r: 0.03 });
        g.box(0.14, TOP - HEAD, B + 0.1, { color: PALETTE.plaster, at: [B / 2 - 0.06, HEAD, 0], r: 0.03 });
        g.box(B + 0.16, 0.08, B + 0.16, { color: PALETTE.woodDark, at: [0, TOP - 0.04, 0], r: 0.02 });
        // The counter and what sits on it: an ink pad, a stamp, a bell.
        g.box(B + 0.24, 0.09, 0.46, { color: PALETTE.woodDark, at: [0, SILL - 0.02, B / 2 + 0.1], r: 0.03 });
        g.box(0.3, 0.05, 0.22, {
            color: PALETTE.vermilion,
            at: [0.52, SILL + 0.07, B / 2 + 0.12],
            r: 0.02,
            layer: 'gloss',
        });
        g.cyl(0.07, 0.085, 0.13, { color: PALETTE.woodDeep, at: [0.52, SILL + 0.12, B / 2 + 0.12], seg: 12 });
        g.ball(0.06, { color: PALETTE.woodDeep, at: [0.52, SILL + 0.3, B / 2 + 0.12], detail: 1 });
        g.ball(0.085, {
            color: PALETTE.gold,
            at: [-0.6, SILL + 0.13, B / 2 + 0.14],
            scale: [1, 0.7, 1],
            detail: 2,
            layer: 'gloss',
        });
        g.box(0.3, 0.02, 0.22, { color: PALETTE.paper, at: [-0.05, SILL + 0.07, B / 2 + 0.13], rot: [0, 0.18, 0] });
        // Inside: a desk lamp glow on the back wall.
        g.box(0.5, 0.36, 0.03, { color: PALETTE.windowWarm, at: [-0.2, 1.5, -B / 2 + 0.12], layer: 'window', r: 0.02 });
        g.box(0.03, 0.36, 0.5, { color: PALETTE.windowWarm, at: [-B / 2 + 0.12, 1.5, 0.1], layer: 'window', r: 0.02 });
    });
    hippedRoof(s, {
        at: [bx, TOP, bz],
        w: B,
        d: B,
        rise: 0.82,
        color: PALETTE.vermilion,
        overhang: 0.42,
        tip: 0.14,
        finial: PALETTE.gold,
    });

    // ----- The rulebook stand -----
    // Right of the booth as the camera sees it, so its sign never stands in front of the gatekeeper.
    const rx = -3.45;
    const rz = -1.75;
    s.group({ at: [rx, 0, rz] }, (g) => {
        g.box(0.5, 0.12, 0.5, { color: PALETTE.stoneDark, r: 0.04 });
        g.cyl(0.08, 0.1, 0.9, { color: PALETTE.woodDark, at: [0, 0.12, 0], seg: 10 });
        g.box(0.86, 0.06, 0.62, { color: PALETTE.wood, at: [0, 1.0, 0.02], rot: [0.5, Math.PI / 4, 0], r: 0.02 });
    });

    group.add(s.build('gate'));

    // ----- The lanterns: one per step of the check order -----
    const lamps: { lamp: Lamp; node: THREE.Group; state: LampState; pulse: number; shake: number }[] = [];
    const lanternGeometry = new THREE.LatheGeometry(
        [
            [0.065, 0],
            [0.19, 0.07],
            [0.225, 0.24],
            [0.19, 0.41],
            [0.065, 0.48],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        18,
    );
    const capSculpt = (): THREE.Group => {
        const cap = new Sculpt();
        cap.cyl(0.085, 0.085, 0.045, { color: PALETTE.charcoal, at: [0, 0.47, 0], seg: 10 });
        cap.cyl(0.085, 0.085, 0.045, { color: PALETTE.charcoal, at: [0, -0.04, 0], seg: 10 });
        return cap.build('cap');
    };
    lampZ.forEach((z) => {
        const node = new THREE.Group();
        // Hung by its top, so it sways from the cord.
        node.position.set(0, POST - 1.3, z);
        const lamp = makeLamp(lanternGeometry, LAMP_TONES.idle.color, LAMP_TONES.idle.glow);
        node.add(lamp.mesh, capSculpt());
        group.add(node);
        lamps.push({ lamp, node, state: 'idle', pulse: 0, shake: 0 });
    });
    // Step numbers on the tie beam, facing the camera.
    lampZ.forEach((z, i) => {
        const number = makeSign({
            width: 0.27,
            height: 0.27,
            text: String(i + 1),
            color: '#fffaf0',
            background: '#4a4550',
            radius: 0.5,
            weight: 700,
            density: 220,
        });
        number.mesh.position.set(0.165, POST - 0.52, z);
        number.mesh.rotation.y = Math.PI / 2;
        group.add(number.mesh);
    });

    // ----- The plaque on the top beam: the venue's name, or the last verdict -----
    const plaque = makeSign({
        width: 1.8,
        height: 0.66,
        text: 'VENUE',
        color: '#fffaf0',
        background: '#4a4550',
        border: PALETTE.gold,
        weight: 700,
        density: 200,
    });
    plaque.mesh.position.set(0.285, POST + 0.46, 0);
    plaque.mesh.rotation.y = Math.PI / 2;
    group.add(plaque.mesh);
    let plaqueUntil = -1;
    let plaquePop = 0;

    // ----- The barrier arm -----
    const armSculpt = new Sculpt();
    const ARM = HALF * 2 - 0.2;
    armSculpt.box(0.16, 0.34, 0.34, { color: PALETTE.charcoal, at: [0, -0.17, -0.3], r: 0.04 });
    const stripes = 6;
    for (let i = 0; i < stripes; i += 1) {
        armSculpt.box(0.1, 0.12, ARM / stripes + 0.005, {
            color: i % 2 === 0 ? PALETTE.vermilion : PALETTE.paper,
            at: [0, -0.06, (ARM / stripes) * (i + 0.5) - 0.05],
            r: 0.02,
            layer: 'gloss',
        });
    }
    armSculpt.ball(0.09, { color: PALETTE.gold, at: [0, 0, ARM - 0.02], detail: 2, layer: 'gloss' });
    const arm = armSculpt.build('barrier');
    const armPivot = new THREE.Group();
    armPivot.position.set(0.36, 1.02, -HALF);
    armPivot.add(arm);
    group.add(armPivot);
    const armStand = new Sculpt();
    armStand.box(0.2, 0.9, 0.2, { color: PALETTE.woodDark, at: [0.36, 0.1, -HALF - 0.02], r: 0.04 });
    armStand.box(0.14, 0.5, 0.14, { color: PALETTE.woodDark, at: [0.36, 0.1, HALF - 0.2], r: 0.03 });
    armStand.box(0.2, 0.06, 0.22, { color: PALETTE.charcoal, at: [0.36, 0.6, HALF - 0.2], r: 0.02 });
    group.add(armStand.build('barrier-stand'));
    let barrierOpen = false;
    let barrierAngle = 0;
    let barrierSpeed = 0;

    // ----- The PAUSED board -----
    const paused = makeSign({
        width: 2.1,
        height: 0.62,
        text: 'PAUSED',
        sub: 'by the emergency role',
        color: '#fffaf0',
        background: PALETTE.stop,
        border: '#fffaf0',
        weight: 700,
        density: 180,
    });
    const pausedNode = new THREE.Group();
    pausedNode.position.set(0.5, 1.72, 0);
    pausedNode.rotation.y = Math.PI / 2;
    pausedNode.add(paused.mesh);
    const chains = new Sculpt();
    for (const x of [-0.9, 0.9]) chains.cyl(0.012, 0.012, 0.9, { color: PALETTE.ink, at: [x, 0.3, 0], seg: 5 });
    pausedNode.add(chains.build('chains'));
    pausedNode.scale.setScalar(0.001);
    pausedNode.visible = false;
    group.add(pausedNode);
    let pausedGoal = 0;
    let pausedScale = 0;

    // ----- The rulebook: an open book whose pages flip to a new version -----
    const bookNode = new THREE.Group();
    bookNode.position.set(rx, 1.12, rz + 0.02);
    bookNode.rotation.set(0.5, Math.PI / 4, 0, 'YXZ');
    const bookSculpt = new Sculpt();
    bookSculpt.box(0.74, 0.05, 0.5, { color: '#7a5540', at: [0, 0, 0], r: 0.015 });
    bookSculpt.box(0.34, 0.05, 0.45, { color: PALETTE.paper, at: [-0.18, 0.035, 0], r: 0.012 });
    bookSculpt.box(0.34, 0.05, 0.45, { color: PALETTE.paper, at: [0.18, 0.035, 0], r: 0.012 });
    bookSculpt.box(0.03, 0.06, 0.47, { color: PALETTE.vermilion, at: [0, 0.035, 0], r: 0.01 });
    const book = bookSculpt.build('book');
    bookNode.add(book);
    const page = new THREE.Mesh(
        new THREE.PlaneGeometry(0.33, 0.44),
        new THREE.MeshStandardMaterial({ color: PALETTE.paper, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    page.geometry.translate(0.165, 0, 0);
    page.rotation.x = -Math.PI / 2;
    const pagePivot = new THREE.Group();
    pagePivot.position.set(0, 0.095, 0);
    pagePivot.add(page);
    pagePivot.visible = false;
    bookNode.add(pagePivot);
    bookNode.visible = false;
    group.add(bookNode);
    const policySign = makeSign({
        width: 0.9,
        height: 0.3,
        text: 'NO POLICY',
        color: '#fffaf0',
        background: '#8f8a84',
        radius: 0.3,
        weight: 700,
        density: 200,
    });
    policySign.mesh.position.set(rx, 1.86, rz);
    policySign.mesh.rotation.y = Math.PI / 4;
    group.add(policySign.mesh);
    let flipAt = -10;
    let policyVersion = -1;
    let bookPop = 0;

    const hitbox = makeHitbox(1.2, 4.4, 3.6, [0, 0, 0]);
    // The booth and the rulebook are part of the gate too.
    const boothHit = makeHitbox(3.4, 3.2, 2.4, [bx + 0.5, 0, bz]);
    hitbox.add(boothHit);
    boothHit.position.sub(hitbox.position);
    group.add(hitbox);

    let now = 0;

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, 0, POST + 1.15, 0),
            door: anchor(group, bx, 0, bz + B / 2 + 0.85),
            // At the window on the road side, clear of the corner post as the camera sees it.
            keeper: anchor(group, bx - 0.12, FLOOR, bz + 0.36),
            counter: anchor(group, bx, SILL + 0.2, bz + B / 2 + 0.15),
            lamps: anchor(group, 0.2, POST - 0.95, 0),
            book: anchor(group, rx, 1.5, rz),
            plaque: anchor(group, 0.3, POST + 0.45, 0),
        },
        setBarrier(open) {
            barrierOpen = open;
        },
        setLamp(step, state) {
            const entry = lamps[step - 1];
            if (!entry) return;
            entry.state = state;
            entry.pulse = state === 'pass' || state === 'fail' || state === 'open' ? 1 : 0;
            entry.shake = state === 'fail' ? 1 : 0;
            const tone = LAMP_TONES[state];
            entry.lamp.set(tone.color, tone.glow);
        },
        showVerdict(outcome, label) {
            plaque.set(
                outcome === 'fill'
                    ? { text: label ?? 'FILLED', background: '#2f9a63', border: '#d9ffe9', color: '#ffffff' }
                    : { text: label ?? 'REFUSED', background: '#d6483c', border: '#ffe1dc', color: '#ffffff' },
            );
            plaqueUntil = now + 4.2;
            plaquePop = 1;
        },
        setPaused(value) {
            pausedGoal = value ? 1 : 0;
            if (value) pausedNode.visible = true;
        },
        setPolicy(version) {
            // Called on every sync: only a new version turns the page.
            if (version === policyVersion) return;
            policyVersion = version;
            if (version <= 0) {
                bookNode.visible = false;
                policySign.set({ text: 'NO POLICY', background: '#8f8a84' });
                return;
            }
            bookNode.visible = true;
            policySign.set({ text: `POLICY v${version}`, background: '#3f4f93' });
            flipAt = now;
            bookPop = 1;
        },
        reset() {
            barrierOpen = false;
            pausedGoal = 0;
            plaqueUntil = -1;
            plaquePop = 0;
            plaque.set({ text: 'VENUE', background: '#4a4550', border: PALETTE.gold, color: '#fffaf0' });
            lamps.forEach((entry) => {
                entry.state = 'idle';
                entry.pulse = 0;
                entry.shake = 0;
                entry.lamp.set(LAMP_TONES.idle.color, LAMP_TONES.idle.glow);
            });
        },
        update(dt, time) {
            now = time;
            // The barrier swings on a spring, so it bounces a little at each end.
            const goal = barrierOpen ? -1.32 : 0;
            barrierSpeed += (goal - barrierAngle) * 46 * dt;
            barrierSpeed *= Math.exp(-7.5 * dt);
            barrierAngle += barrierSpeed * dt;
            armPivot.rotation.x = barrierAngle;

            lamps.forEach((entry, i) => {
                entry.pulse = Math.max(0, entry.pulse - dt * 2.2);
                entry.shake = Math.max(0, entry.shake - dt * 1.6);
                const sway = Math.sin(time * 1.3 + i * 0.9) * 0.05;
                entry.node.rotation.x = sway + Math.sin(time * 34) * 0.16 * entry.shake;
                const scale = 1 + ease.out(entry.pulse) * 0.32;
                entry.node.scale.setScalar(scale);
                if (entry.state === 'run') {
                    const tone = LAMP_TONES.run;
                    entry.lamp.set(tone.color, tone.glow * (0.7 + 0.3 * Math.sin(time * 14)));
                }
            });

            if (plaqueUntil > 0 && time > plaqueUntil) {
                plaqueUntil = -1;
                plaque.set({ text: 'VENUE', background: '#4a4550', border: PALETTE.gold, color: '#fffaf0' });
            }
            plaquePop = Math.max(0, plaquePop - dt * 2.4);
            plaque.mesh.scale.setScalar(1 + ease.out(plaquePop) * 0.3);

            pausedScale = damp(pausedScale, pausedGoal, 9, dt);
            pausedNode.scale.setScalar(Math.max(pausedScale, 0.001));
            pausedNode.rotation.z = Math.sin(time * 1.1) * 0.02;
            if (pausedGoal === 0 && pausedScale < 0.02) pausedNode.visible = false;

            // A page turns over when the policy changes.
            const flip = clamp((time - flipAt) / 0.7);
            pagePivot.visible = flip > 0 && flip < 1;
            pagePivot.rotation.z = Math.PI * ease.inOut(flip);
            bookPop = Math.max(0, bookPop - dt * 1.8);
            bookNode.scale.setScalar(1 + ease.out(bookPop) * 0.22);
            policySign.mesh.position.y = 1.86 + Math.sin(time * 1.7) * 0.025;
        },
    };
}
