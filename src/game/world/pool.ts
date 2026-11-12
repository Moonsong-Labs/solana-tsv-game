/**
 * The pool: a pond where stock and dollars swirl together, fed by two
 * vaults. The stock vault starts frozen in ice until the issuer thaws it; a
 * board shows the price, which follows the two reserves.
 *
 * The day has one pool, TSA's. Manager mode adds one per stock in the market
 * quarter: the same pond in that stock's colours, on its own site.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, clamp, damp, ease, makeLamp, makeSign } from '../scene/kit.ts';
import { STOCKS, type StockId } from '../sim/park.ts';
import { POOL_SITES } from './layout.ts';
import { type Place, anchor, makeHitbox } from './place.ts';
import { stockTones } from './tones.ts';

export type PoolStage = 'none' | 'created' | 'open';

/** What the USDC gauge holds when full at TSA's 12.40 opening price; other pools scale it by their own. */
const USDC_FULL = 2000;
/** What the stock gauge holds when full, in shares. */
const STOCK_FULL = 160;

export interface PoolPlace extends Place {
    /** The stock this pool trades against USDC. */
    readonly stock: StockId;
    /** Shows the bare plot, the dry basin with its vaults, or the filled pond. */
    setStage(stage: PoolStage, snap?: boolean): void;
    /** Freezes or thaws the stock vault's ice. */
    setVaultFrozen(frozen: boolean, snap?: boolean): void;
    /** What the vaults hold, and what the books record for the stock; a vault below its record shows a shortfall. */
    setVaults(tsa: number, usdc: number, recordedTsa: number): void;
    /** The price board's two lines. */
    setBoard(main: string, sub: string, tone?: 'open' | 'idle' | 'alert'): void;
    /** A plop in the pond: something was traded. */
    splash(): void;
    anchors: Place['anchors'] & {
        /** The middle of the water. */
        water: THREE.Vector3;
        stockVault: THREE.Vector3;
        usdcVault: THREE.Vector3;
        board: THREE.Vector3;
    };
}

const WaterShader = {
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform float time;
        uniform float glow;
        uniform vec3 stock;
        uniform vec3 dollars;
        uniform vec3 foam;
        uniform vec4 ripple; // xy centre (uv), z age, w strength
        varying vec2 vUv;
        void main() {
            vec2 p = vUv - 0.5;
            float r = length(p) * 2.0;
            float angle = atan(p.y, p.x);
            // Two colours chase each other round the pond: stock and dollars, always equal in value.
            float swirl = sin(angle + r * 3.2 - time * 0.55 + sin(r * 6.0 - time) * 0.35);
            float blend = smoothstep(-0.55, 0.55, swirl);
            vec3 color = mix(stock, dollars, blend);
            // A pale seam where they meet, and soft moving highlights.
            float seam = 1.0 - smoothstep(0.0, 0.16, abs(swirl));
            color = mix(color, foam, seam * 0.5);
            float waves = sin(p.x * 26.0 + time * 1.6) * sin(p.y * 22.0 - time * 1.3);
            color += foam * smoothstep(0.82, 1.0, waves) * 0.22;
            // A ring spreading from the last splash.
            float d = length(vUv - ripple.xy) * 2.0;
            float ring = 1.0 - smoothstep(0.0, 0.07, abs(d - ripple.z * 0.9));
            color = mix(color, foam, ring * ripple.w * clamp(1.0 - ripple.z, 0.0, 1.0));
            // Darker near the rim, for depth.
            color *= mix(1.0, 0.84, smoothstep(0.7, 1.0, r));
            color *= 0.92 + glow * 0.1;
            gl_FragColor = vec4(color, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
};

function barrel(s: Sculpt, tone: string): void {
    // A straw-wrapped cask: pale body, rope bands, a coloured belt and a lid.
    s.lathe(
        [
            [0.62, 0],
            [0.74, 0.3],
            [0.76, 0.8],
            [0.7, 1.3],
            [0.6, 1.5],
        ],
        { color: '#f4e7c8', top: '#fff6e2', seg: 28 },
    );
    for (const y of [0.22, 1.28]) s.torus(0.73, 0.045, { color: '#d9bb74', at: [0, y, 0], seg: 28 });
    s.cyl(0.775, 0.775, 0.34, { color: tone, at: [0, 0.6, 0], seg: 28, layer: 'gloss' });
    s.cyl(0.6, 0.6, 0.08, { color: PALETTE.wood, at: [0, 1.48, 0], seg: 24 });
    s.cyl(0.1, 0.1, 0.1, { color: PALETTE.woodDark, at: [0, 1.56, 0], seg: 10 });
    s.box(1.7, 0.16, 1.7, { color: PALETTE.stoneDark, at: [0, -0.02, 0], r: 0.05 });
}

export function createPool(opts: { stock?: StockId; site?: readonly [number, number] } = {}): PoolPlace {
    const stock = opts.stock ?? 'TSA';
    const site = opts.site ?? POOL_SITES[stock];
    const tones = stockTones(stock);
    // TSA's is the town's own pool, the day's: it keeps the day's names, 'STOCK VAULT' and 'POOL SITE'.
    const town = stock === 'TSA';
    const usdcFull = (USDC_FULL * STOCKS[stock].opening) / STOCKS.TSA.opening;
    const group = new THREE.Group();
    group.name = town ? 'pool' : `pool:${stock}`;
    group.position.set(site[0], 0, site[1]);

    const R = 2.02;
    const STOCK: readonly [number, number] = [-1.7, -2.75];
    const USDC: readonly [number, number] = [1.25, -2.9];

    // ----- The bare plot, before the pool exists -----
    const plot = new Sculpt();
    for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        plot.cyl(0.05, 0.06, 0.62, {
            color: PALETTE.woodDark,
            at: [Math.cos(a) * 1.9, 0.05, Math.sin(a) * 1.9],
            seg: 7,
        });
    }
    plot.tube(
        [0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            return [Math.cos(a) * 1.9, 0.52, Math.sin(a) * 1.9] as const;
        }),
        0.018,
        { color: '#e9cf8f', closed: true, seg: 40 },
    );
    plot.cyl(1.5, 1.5, 0.012, { color: '#e3d2ad', at: [0, 0.052, 0], seg: 32 });
    const plotNode = plot.build('plot');
    const plotSign = makeSign({
        width: 1.5,
        height: 0.42,
        text: town ? 'POOL SITE' : `${stock} POOL SITE`,
        color: '#6a4a36',
        background: '#fff6e2',
        border: '#c08e62',
        weight: 700,
    });
    plotSign.mesh.position.set(0, 0.95, 0);
    plotSign.mesh.rotation.y = Math.PI / 4;
    plotNode.add(plotSign.mesh);
    group.add(plotNode);

    // ----- The basin and the vaults -----
    const built = new THREE.Group();
    group.add(built);
    const s = new Sculpt();
    // The rim: a ring of rounded stones.
    const stones = 26;
    for (let i = 0; i < stones; i += 1) {
        const a = (i / stones) * Math.PI * 2;
        const wobble = 0.9 + ((i * 37) % 10) / 40;
        s.ball(0.3, {
            color: i % 3 === 0 ? PALETTE.stoneDark : PALETTE.stone,
            top: '#e6e0d6',
            at: [Math.cos(a) * (R + 0.14), 0.14, Math.sin(a) * (R + 0.14)],
            scale: [1.05 * wobble, 0.62, 0.86],
            rot: [0, -a, 0],
            detail: 2,
        });
    }
    s.cyl(R + 0.05, R + 0.05, 0.08, { color: '#cbb994', at: [0, 0.04, 0], seg: 40 });
    // A little wooden jetty where traders stand, on the side the road comes from.
    s.box(0.9, 0.1, 0.7, { color: PALETTE.wood, at: [-2.25, 0.05, 1.3], rot: [0, -0.55, 0], r: 0.03 });
    for (const x of [-0.3, 0, 0.3])
        s.box(0.03, 0.105, 0.7, {
            color: PALETTE.woodDark,
            at: [-2.25 + x * 0.84, 0.05, 1.3 + x * 0.52],
            rot: [0, -0.55, 0],
        });
    // Reeds and a lily pad or two.
    for (const [x, z] of [
        [1.45, 1.75],
        [1.62, 1.55],
        [1.28, 1.9],
    ] as const) {
        s.cyl(0.02, 0.025, 0.7, { color: '#8fc47c', at: [x, 0.1, z], seg: 6, rot: [0.06, 0, 0.08] });
        s.capsule(0.045, 0.2, { color: '#8a5f43', at: [x + 0.05, 0.72, z + 0.04] });
    }
    // The vaults, each on a stone pad with a pipe to the pond.
    s.group({ at: [STOCK[0], 0, STOCK[1]] }, (g) => barrel(g, tones.deep));
    s.group({ at: [USDC[0], 0, USDC[1]] }, (g) => barrel(g, PALETTE.usdc));
    s.tube(
        [
            [STOCK[0] + 0.5, 0.42, STOCK[1] + 0.56],
            [STOCK[0] + 0.62, 0.5, STOCK[1] + 0.95],
            [-0.9, 0.42, -1.82],
        ],
        0.07,
        { color: '#b98a5e', seg: 16 },
    );
    s.tube(
        [
            [USDC[0] - 0.3, 0.42, USDC[1] + 0.68],
            [USDC[0] - 0.4, 0.5, USDC[1] + 1.05],
            [0.75, 0.42, -1.88],
        ],
        0.07,
        { color: '#b98a5e', seg: 16 },
    );
    // The price board's frame, facing the camera.
    // Behind the pond's left side, tall enough to read over it.
    const BOARD: readonly [number, number] = [-3.3, -2.9];
    s.group({ at: [BOARD[0], 0, BOARD[1]], rot: [0, Math.PI / 4, 0] }, (g) => {
        for (const x of [-1.2, 1.2]) g.box(0.13, 2.75, 0.13, { color: PALETTE.woodDark, at: [x, 0, 0], r: 0.03 });
        g.box(2.66, 0.1, 0.16, { color: PALETTE.woodDark, at: [0, 2.7, 0], r: 0.03 });
        g.box(2.44, 1.22, 0.08, { color: PALETTE.wood, at: [0, 1.44, -0.02], r: 0.03 });
        g.gableRoof(0.7, 2.95, 0.22, {
            color: PALETTE.roofJade,
            at: [0, 2.82, 0],
            rot: [0, Math.PI / 2, 0],
            thickness: 0.07,
            layer: 'gloss',
        });
    });
    built.add(s.build('pool'));

    // The vault gauges: a glass tube beside each cask, with the liquid level inside.
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.28,
        roughness: 0.1,
        depthWrite: false,
    });
    const gauges: { fill: THREE.Mesh; level: number; goal: number }[] = [];
    const GAUGE_H = 1.25;
    for (const [spot, tone] of [
        [STOCK, tones.deep],
        [USDC, PALETTE.usdc],
    ] as const) {
        const x = spot[0] + 0.62;
        const z = spot[1] + 0.62;
        const frame = new Sculpt();
        frame.cyl(0.11, 0.11, 0.06, { color: PALETTE.woodDark, at: [x, 0.12, z], seg: 12 });
        frame.cyl(0.11, 0.11, 0.06, { color: PALETTE.woodDark, at: [x, 0.18 + GAUGE_H, z], seg: 12 });
        built.add(frame.build('gauge-frame'));
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, GAUGE_H, 14), glassMaterial);
        tube.position.set(x, 0.18 + GAUGE_H / 2, z);
        tube.renderOrder = 3;
        built.add(tube);
        const liquid = makeLamp(
            new THREE.CylinderGeometry(0.065, 0.065, GAUGE_H, 12).translate(0, GAUGE_H / 2, 0),
            tone,
            0.75,
        );
        liquid.mesh.position.set(x, 0.18, z);
        liquid.mesh.scale.y = 0.001;
        built.add(liquid.mesh);
        gauges.push({ fill: liquid.mesh, level: 0, goal: 0 });
    }
    // The books' record for the stock vault: a red pointer on its gauge, and a lamp that warns of a shortfall.
    const pointer = new Sculpt();
    pointer.cone(0.07, 0.16, { color: PALETTE.stop, rot: [0, 0, Math.PI / 2], seg: 8, layer: 'gloss' });
    const pointerNode = pointer.build('record');
    pointerNode.position.set(STOCK[0] + 0.62 + 0.2, 0.18, STOCK[1] + 0.62);
    pointerNode.visible = false;
    built.add(pointerNode);
    const warning = makeLamp(new THREE.SphereGeometry(0.12, 14, 10), PALETTE.ok, 0.2);
    warning.mesh.position.set(STOCK[0], 1.76, STOCK[1]);
    built.add(warning.mesh);
    let short = false;

    // Name plates on the casks.
    const plates: THREE.Mesh[] = [];
    for (const [spot, text, tone] of [
        [STOCK, town ? 'STOCK VAULT' : `${stock} VAULT`, tones.plate],
        [USDC, 'USDC VAULT', '#3a6fc0'],
    ] as const) {
        const plate = makeSign({
            width: 1.0,
            height: 0.26,
            text,
            color: '#ffffff',
            background: tone,
            radius: 0.4,
            weight: 700,
            density: 190,
        });
        plate.mesh.position.set(spot[0] + 0.56, 1.02, spot[1] + 0.56);
        plate.mesh.rotation.y = Math.PI / 4;
        built.add(plate.mesh);
        plates.push(plate.mesh);
    }

    // ----- The ice on the stock vault -----
    const iceMaterial = new THREE.MeshStandardMaterial({
        color: '#c4eaff',
        transparent: true,
        opacity: 0.66,
        roughness: 0.05,
        metalness: 0,
        depthWrite: false,
        flatShading: true,
    });
    const ice = new THREE.Group();
    const iceSculptGeometry = new THREE.IcosahedronGeometry(1.08, 1);
    const iceBlock = new THREE.Mesh(iceSculptGeometry, iceMaterial);
    iceBlock.scale.set(1, 1.08, 1);
    iceBlock.position.y = 0.92;
    iceBlock.renderOrder = 4;
    ice.add(iceBlock);
    const frost = new Sculpt();
    for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        frost.cone(0.16, 0.5 + (i % 2) * 0.2, {
            color: '#e9f8ff',
            at: [Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86],
            seg: 6,
            flat: true,
            rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3],
        });
    }
    ice.add(frost.build('frost'));
    const flake = makeSign({
        width: 0.7,
        height: 0.7,
        text: '',
        density: 160,
        paint(context, width, height) {
            context.strokeStyle = '#ffffff';
            context.lineWidth = width * 0.07;
            context.lineCap = 'round';
            context.translate(width / 2, height / 2);
            for (let i = 0; i < 6; i += 1) {
                context.rotate(Math.PI / 3);
                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(0, -height * 0.38);
                context.moveTo(0, -height * 0.24);
                context.lineTo(width * 0.1, -height * 0.33);
                context.moveTo(0, -height * 0.24);
                context.lineTo(-width * 0.1, -height * 0.33);
                context.stroke();
            }
        },
        lit: true,
    });
    flake.mesh.position.set(0.8, 1.05, 0.8);
    flake.mesh.rotation.y = Math.PI / 4;
    ice.add(flake.mesh);
    ice.position.set(STOCK[0], 0, STOCK[1]);
    built.add(ice);
    let iceGoal = 1;
    let iceAmount = 1;

    // ----- The water -----
    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            glow: { value: 0.3 },
            stock: { value: new THREE.Color(tones.water) },
            dollars: { value: new THREE.Color('#6fb1ee') },
            foam: { value: new THREE.Color('#ffffff') },
            ripple: { value: new THREE.Vector4(0.5, 0.5, 9, 0) },
        },
        vertexShader: WaterShader.vertexShader,
        fragmentShader: WaterShader.fragmentShader,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.02, 56), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.09;
    water.visible = false;
    built.add(water);
    let waterLevel = 0;
    let waterGoal = 0;

    // Two koi, one of each colour, circling.
    const koi: { node: THREE.Group; radius: number; speed: number; phase: number }[] = [];
    for (const [tone, radius, speed, phase] of [
        [tones.koi, 1.2, 0.5, 0],
        ['#4d8fe8', 0.7, -0.62, 2.4],
    ] as const) {
        const fish = new Sculpt();
        fish.ball(0.16, { color: tone, scale: [0.55, 0.3, 1.25], detail: 2, layer: 'gloss' });
        fish.cone(0.12, 0.24, {
            color: tone,
            at: [0, 0, -0.3],
            rot: [-Math.PI / 2, 0, 0],
            scale: [1, 1, 0.3],
            seg: 8,
            layer: 'gloss',
        });
        fish.ball(0.05, { color: '#ffffff', at: [0, 0.03, 0.08], scale: [1, 0.4, 1.4], detail: 1 });
        const node = fish.build('koi');
        node.visible = false;
        for (const child of node.children) child.castShadow = false;
        built.add(node);
        koi.push({ node, radius, speed, phase });
    }

    // ----- The price board -----
    const board = makeSign({
        width: 2.3,
        height: 1.1,
        text: 'NOT FUNDED',
        sub: 'two empty vaults',
        color: '#6a4a36',
        background: '#fff6e2',
        weight: 700,
        density: 170,
        radius: 0.08,
    });
    const boardNode = new THREE.Group();
    boardNode.position.set(BOARD[0], 0, BOARD[1]);
    boardNode.rotation.y = Math.PI / 4;
    board.mesh.position.set(0, 2.05, 0.04);
    boardNode.add(board.mesh);
    const boardLamp = makeLamp(new THREE.SphereGeometry(0.1, 14, 10), '#b9b2a6', 0.1);
    boardLamp.mesh.position.set(0, 3.16, 0);
    boardNode.add(boardLamp.mesh);
    built.add(boardNode);
    let boardPop = 0;

    const hitbox = makeHitbox(6.6, 2.4, 6.2, [0.3, 0, -0.8]);
    // The price board stands past the box's left edge and above it: a box of its own, inside the first.
    const boardBox = makeHitbox(2.7, 3.4, 0.5);
    boardBox.position.set(BOARD[0], 1.7, BOARD[1]).sub(hitbox.position);
    boardBox.rotation.y = Math.PI / 4;
    hitbox.add(boardBox);
    group.add(hitbox);

    let stage: PoolStage = 'none';
    let builtScale = 0;
    let builtGoal = 0;
    let rippleAge = 9;
    let now = 0;
    built.scale.setScalar(0.001);
    built.visible = false;

    return {
        stock,
        group,
        hitbox,
        anchors: {
            // Over the price board's lamp: the board is the pool's own sign.
            label: anchor(group, BOARD[0], 3.4, BOARD[1]),
            door: anchor(group, -2.25, 0, 1.3),
            water: anchor(group, 0, 0.5, 0),
            stockVault: anchor(group, STOCK[0], 1.9, STOCK[1]),
            usdcVault: anchor(group, USDC[0], 1.9, USDC[1]),
            board: anchor(group, BOARD[0], 2.1, BOARD[1]),
        },
        setStage(next, snap = false) {
            stage = next;
            builtGoal = next === 'none' ? 0 : 1;
            waterGoal = next === 'open' ? 1 : 0;
            if (next !== 'none') built.visible = true;
            if (next === 'open') water.visible = true;
            if (snap) {
                builtScale = builtGoal;
                waterLevel = waterGoal;
            }
        },
        setVaultFrozen(frozen, snap = false) {
            iceGoal = frozen ? 1 : 0;
            if (frozen) ice.visible = true;
            if (snap) iceAmount = iceGoal;
        },
        setVaults(tsa, usdc, recordedTsa) {
            (gauges[0] as { goal: number }).goal = clamp(tsa / STOCK_FULL, 0, 1);
            (gauges[1] as { goal: number }).goal = clamp(usdc / usdcFull, 0, 1);
            short = tsa < recordedTsa - 1e-6;
            pointerNode.visible = stage === 'open';
            pointerNode.position.y = 0.18 + clamp(recordedTsa / STOCK_FULL, 0, 1) * GAUGE_H;
        },
        setBoard(main, sub, tone = 'open') {
            board.set({ text: main, sub, color: tone === 'alert' ? '#b13b33' : '#6a4a36' });
            boardLamp.set(
                tone === 'open' ? PALETTE.ok : tone === 'alert' ? PALETTE.stop : '#b9b2a6',
                tone === 'idle' ? 0.1 : 1.1,
            );
            boardPop = 1;
        },
        splash() {
            rippleAge = 0;
        },
        update(dt, time) {
            // A pool in the hidden market quarter waits where it is.
            if (!group.visible) return;
            now = time;
            // The basin pops out of the ground with a bounce.
            builtScale = damp(builtScale, builtGoal, 5, dt);
            const pop = builtGoal === 1 ? ease.outBack(clamp(builtScale)) : builtScale;
            built.scale.setScalar(Math.max(pop, 0.001));
            if (builtGoal === 0 && builtScale < 0.01) built.visible = false;
            plotNode.visible = builtScale < 0.5;
            plotNode.scale.setScalar(Math.max(1 - builtScale * 2, 0.001));
            plotSign.mesh.position.y = 0.95 + Math.sin(time * 1.8) * 0.03;

            waterLevel = damp(waterLevel, waterGoal, 1.6, dt);
            water.position.y = 0.09 + waterLevel * 0.17;
            water.scale.setScalar(0.9 + waterLevel * 0.1);
            if (waterGoal === 0 && waterLevel < 0.01) water.visible = false;
            const uniforms = waterMaterial.uniforms as Record<string, THREE.IUniform>;
            (uniforms.time as THREE.IUniform<number>).value = time;
            rippleAge += dt * 0.9;
            (uniforms.ripple as THREE.IUniform<THREE.Vector4>).value.set(0.5, 0.5, rippleAge, 1);

            for (const fish of koi) {
                fish.node.visible = waterLevel > 0.6;
                const a = time * fish.speed + fish.phase;
                fish.node.position.set(Math.cos(a) * fish.radius, water.position.y + 0.012, Math.sin(a) * fish.radius);
                fish.node.rotation.y = -a + (fish.speed > 0 ? 0 : Math.PI) + Math.sin(time * 5 + fish.phase) * 0.18;
            }

            for (const gauge of gauges) {
                gauge.level = damp(gauge.level, gauge.goal, 3, dt);
                gauge.fill.scale.y = Math.max(gauge.level, 0.001);
            }
            warning.set(short ? PALETTE.stop : PALETTE.ok, short ? 0.6 + Math.abs(Math.sin(time * 5)) * 1.2 : 0.25);

            // The ice melts away, shivering as it goes.
            iceAmount = damp(iceAmount, iceGoal, 2.2, dt);
            const melting = iceGoal === 0 && iceAmount > 0.02;
            ice.scale.set(
                iceAmount + (melting ? Math.sin(time * 30) * 0.02 : 0),
                Math.max(iceAmount, 0.001),
                iceAmount,
            );
            iceMaterial.opacity = 0.62 * clamp(iceAmount * 1.4);
            if (iceGoal === 0 && iceAmount < 0.02) ice.visible = false;
            flake.mesh.rotation.z = Math.sin(time * 0.8) * 0.15;

            boardPop = Math.max(0, boardPop - dt * 2.2);
            board.mesh.scale.setScalar(1 + ease.out(boardPop) * 0.12);
            void now;
        },
    };
}
