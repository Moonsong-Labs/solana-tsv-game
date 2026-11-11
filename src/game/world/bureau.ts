/**
 * The credential bureau: the KYC provider. It checks a person once and
 * writes a credential for their wallet (a Solana Attestation Service
 * attestation). The giant seal on its roof stamps when it issues or revokes.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, clamp, ease, makeSign } from '../scene/kit.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, gabledRoof, makeHitbox, noren, shojiWindow } from './place.ts';

export interface Bureau extends Place {
    /** Plays the roof seal's stamp. `tone` tints the ink: issue or revoke. */
    stamp(tone?: 'issue' | 'revoke'): void;
}

export function createBureau(): Bureau {
    const group = new THREE.Group();
    group.name = 'bureau';
    group.position.set(SITES.bureau[0], 0, SITES.bureau[1]);
    // It stands in the island's left corner and faces +X, toward the garden and the path from the road.
    group.rotation.y = Math.PI / 2;

    const W = 4;
    const D = 2.9;
    const BASE = 0.24;
    const WALL = 2.5;
    const top = BASE + WALL;

    const s = new Sculpt();
    // Foundation and walls.
    s.box(W + 0.5, BASE, D + 0.5, { color: PALETTE.stone, r: 0.06 });
    s.box(W, WALL, D, { color: PALETTE.plasterShade, top: PALETTE.plaster, at: [0, BASE, 0], r: 0.04 });
    // Dark timber: corner posts, a sill band and a head beam.
    for (const x of [-W / 2, W / 2]) {
        for (const z of [-D / 2, D / 2]) s.box(0.2, WALL, 0.2, { color: PALETTE.woodDark, at: [x, BASE, z], r: 0.04 });
    }
    s.box(W + 0.06, 0.5, D + 0.06, { color: PALETTE.wood, at: [0, BASE, 0], r: 0.04 });
    s.box(W + 0.1, 0.14, D + 0.1, { color: PALETTE.woodDark, at: [0, top - 0.14, 0], r: 0.03 });

    // Front (+Z): a sliding door under a curtain, and a wide counter window.
    const front = D / 2;
    s.box(1.16, 1.62, 0.08, { color: PALETTE.woodDark, at: [-1.05, BASE, front], r: 0.03 });
    s.box(0.5, 1.46, 0.1, {
        color: PALETTE.windowWarm,
        at: [-1.31, BASE + 0.06, front + 0.01],
        layer: 'window',
        r: 0.01,
    });
    s.box(0.5, 1.46, 0.1, {
        color: PALETTE.windowWarm,
        at: [-0.79, BASE + 0.06, front + 0.01],
        layer: 'window',
        r: 0.01,
    });
    for (const y of [0.55, 1.05])
        s.box(1.04, 0.03, 0.03, { color: PALETTE.woodDark, at: [-1.05, BASE + y, front + 0.06] });
    noren(s, [-1.05, BASE + 1.74, front + 0.04], 1.2, 0.5, PALETTE.roofIndigo, 3);
    shojiWindow(s, [0.85, BASE + 0.82, front], 1.5, 0.86, PALETTE.woodDark, 4, 2);
    // The counter under the window, with a little awning.
    s.box(1.8, 0.1, 0.42, { color: PALETTE.wood, at: [0.85, BASE + 0.62, front + 0.18], r: 0.03 });
    s.box(1.9, 0.07, 0.56, {
        color: PALETTE.roofIndigo,
        at: [0.85, BASE + 1.82, front + 0.24],
        rot: [0.32, 0, 0],
        r: 0.03,
        layer: 'gloss',
    });
    // A step at the door.
    s.box(1.4, 0.12, 0.5, { color: PALETTE.stoneDark, at: [-1.05, 0, front + 0.36], r: 0.04 });

    // Side (+X): two windows.
    s.group({ at: [W / 2, 0, 0], rot: [0, Math.PI / 2, 0] }, (g) => {
        shojiWindow(g, [-0.62, BASE + 0.82, 0], 0.8, 0.86, PALETTE.woodDark, 2, 2);
        shojiWindow(g, [0.62, BASE + 0.82, 0], 0.8, 0.86, PALETTE.woodDark, 2, 2);
    });

    // The roof: ridge along X, so a tiled slope faces the road.
    gabledRoof(s, {
        at: [0, top, 0],
        span: D,
        length: W,
        rise: 1.3,
        color: PALETTE.roofIndigo,
        wall: PALETTE.plaster,
        along: 'x',
        overhang: 0.45,
        eave: 0.4,
        ridge: '#4c5fae',
    });
    // A round window in the gable that faces the camera.
    s.cyl(0.3, 0.3, 0.06, {
        color: PALETTE.woodDark,
        at: [W / 2 + 0.0, top + 0.42, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 20,
    });
    s.cyl(0.23, 0.23, 0.08, {
        color: PALETTE.windowWarm,
        at: [W / 2 + 0.0, top + 0.42, 0],
        rot: [0, 0, -Math.PI / 2],
        seg: 20,
        layer: 'window',
    });

    // Dressing: a red post box, a potted pine, paper stacks on the counter, a lantern.
    s.group({ at: [1.5, 0, front + 0.75] }, (g) => {
        g.cyl(0.19, 0.19, 0.62, { color: PALETTE.vermilion, seg: 14, layer: 'gloss' });
        g.cyl(0.22, 0.22, 0.07, { color: '#c9463b', at: [0, 0.62, 0], seg: 14, layer: 'gloss' });
        g.ball(0.2, { color: PALETTE.vermilion, at: [0, 0.66, 0], scale: [1, 0.5, 1], detail: 2, layer: 'gloss' });
        g.box(0.2, 0.035, 0.03, { color: PALETTE.ink, at: [0, 0.42, 0.185] });
    });
    s.group({ at: [-2.05, 0, front + 0.5] }, (g) => {
        g.cyl(0.2, 0.15, 0.26, { color: '#7fa7c9', seg: 12, layer: 'gloss' });
        g.ball(0.3, { color: PALETTE.pineDeep, top: PALETTE.pine, at: [0, 0.5, 0], scale: [1, 0.85, 1], detail: 2 });
        g.ball(0.18, { color: PALETTE.pine, at: [0.12, 0.74, 0.05], detail: 2 });
    });
    for (let i = 0; i < 3; i += 1) {
        s.box(0.3, 0.035, 0.22, {
            color: i === 1 ? '#fde9c8' : PALETTE.paper,
            at: [0.38 + (i % 2) * 0.02, BASE + 0.72 + i * 0.036, front + 0.2],
            rot: [0, i * 0.2 - 0.2, 0],
            r: 0.008,
        });
    }
    s.cyl(0.05, 0.05, 0.16, { color: PALETTE.ink, at: [1.3, BASE + 0.72, front + 0.2], seg: 8 });
    // The hanging lantern by the door.
    s.box(0.06, 0.06, 0.5, { color: PALETTE.woodDark, at: [-1.88, BASE + 1.8, front + 0.25], r: 0.02 });
    s.lathe(
        [
            [0.05, 0],
            [0.15, 0.06],
            [0.17, 0.19],
            [0.15, 0.32],
            [0.05, 0.38],
        ],
        { color: PALETTE.lantern, at: [-1.88, BASE + 1.36, front + 0.44], layer: 'window', seg: 14 },
    );

    group.add(s.build('bureau'));

    // The sign over the counter.
    const sign = makeSign({
        width: 1.7,
        height: 0.52,
        text: 'KYC',
        color: '#fffaf0',
        background: '#3f4f93',
        border: '#f3c45a',
        weight: 700,
        paint(context, width, height) {
            // A seal mark at the left: a ring with a tick.
            const r = height * 0.26;
            const cx = height * 0.5;
            const cy = height * 0.5;
            context.strokeStyle = '#fffaf0';
            context.lineWidth = height * 0.07;
            context.beginPath();
            context.arc(cx, cy, r, 0, Math.PI * 2);
            context.stroke();
            context.beginPath();
            context.moveTo(cx - r * 0.5, cy);
            context.lineTo(cx - r * 0.1, cy + r * 0.4);
            context.lineTo(cx + r * 0.55, cy - r * 0.4);
            context.stroke();
            void width;
        },
    });
    // It stands on the eave, where the camera always sees it.
    sign.mesh.position.set(0.85, top + 0.34, front + 0.52);
    group.add(sign.mesh);

    // The giant seal on the roof: handle, collar and a rubber face. It hops and stamps.
    const sealBody = new Sculpt();
    sealBody.cyl(0.42, 0.46, 0.2, { color: PALETTE.vermilion, seg: 22, layer: 'gloss' });
    sealBody.cyl(0.34, 0.4, 0.14, { color: PALETTE.gold, at: [0, 0.2, 0], seg: 22, layer: 'gloss' });
    sealBody.lathe(
        [
            [0.2, 0],
            [0.15, 0.14],
            [0.17, 0.3],
            [0.27, 0.44],
            [0.28, 0.56],
            [0.2, 0.66],
            [0.02, 0.7],
        ],
        { color: PALETTE.woodDark, at: [0, 0.34, 0], seg: 20, layer: 'gloss' },
    );
    const seal = sealBody.build('seal');
    const sealRestY = top + 1.36;
    seal.position.set(-0.55, sealRestY, 0);
    seal.rotation.z = 0.12;
    group.add(seal);
    // The plinth the seal lands on, with a mark that flashes when it stamps.
    const plinth = new Sculpt();
    plinth.cyl(0.6, 0.66, 0.12, { color: PALETTE.plaster, seg: 22 });
    const plinthNode = plinth.build('plinth');
    plinthNode.position.set(-0.55, top + 1.1, 0);
    group.add(plinthNode);
    const ink = new THREE.Mesh(
        new THREE.CircleGeometry(0.4, 28),
        new THREE.MeshBasicMaterial({ color: PALETTE.ok, transparent: true, opacity: 0 }),
    );
    ink.rotation.x = -Math.PI / 2;
    ink.position.set(-0.55, top + 1.225, 0);
    group.add(ink);

    const hitbox = makeHitbox(W + 0.8, top + 2, D + 1.4, [0, 0, 0.3]);
    group.add(hitbox);

    let stampAt = -10;
    let now = 0;

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, 0, top + 2.05, 0),
            door: anchor(group, -1.05, 0, front + 0.9),
            counter: anchor(group, 0.85, BASE + 0.9, front + 0.3),
            seal: anchor(group, -0.55, top + 1.6, 0),
            roof: anchor(group, 0, top + 1.2, 0),
        },
        stamp(tone = 'issue') {
            stampAt = now;
            (ink.material as THREE.MeshBasicMaterial).color.set(tone === 'issue' ? PALETTE.ok : PALETTE.stop);
        },
        update(_dt, time) {
            now = time;
            const t = time - stampAt;
            // Idle: a slow bob. Stamping: wind up, slam, settle.
            let y = sealRestY + Math.sin(time * 1.6) * 0.04;
            let squash = 1;
            if (t >= 0 && t < 1.1) {
                if (t < 0.3) y = sealRestY + ease.out(t / 0.3) * 0.7;
                else if (t < 0.42) {
                    const k = (t - 0.3) / 0.12;
                    y = sealRestY + 0.7 - ease.in(k) * 0.84;
                    squash = 1 - k * 0.18;
                } else {
                    const k = clamp((t - 0.42) / 0.5);
                    y = sealRestY - 0.14 + ease.outBack(k) * 0.14;
                    squash = 0.82 + ease.outElastic(k) * 0.18;
                }
            }
            seal.position.y = y;
            seal.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);
            const inkMaterial = ink.material as THREE.MeshBasicMaterial;
            inkMaterial.opacity = t >= 0.42 && t < 2.4 ? clamp(1 - (t - 0.42) / 1.9) * 0.9 : 0;
        },
    };
}
