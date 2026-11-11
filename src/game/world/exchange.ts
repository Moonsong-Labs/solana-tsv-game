/**
 * The exchange: the stock's primary market (simulated). When it halts
 * trading, the venue must stop too. Its lantern shows the trading state and
 * its bell rings on a halt and on the resumption.
 *
 * Next to it stands the halt board: the on-chain record of the symbol's
 * state that the pool reads, kept fresh by the halt poster's paper cranes.
 */
import * as THREE from 'three';

import { PALETTE, Sculpt, clamp, damp, ease, makeLamp, makeSign } from '../scene/kit.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, hippedRoof, makeHitbox, noren, shojiWindow } from './place.ts';

export type MarketStatus = 'trading' | 'limit' | 'halted';
export type RecordState = 'trading' | 'halted' | 'unknown';

export interface Exchange extends Place {
    /** Trading (green), Limit State (amber, pulsing) or halted (red). */
    setStatus(status: MarketStatus): void;
    /** Swings the bell. */
    ringBell(): void;
    /** Redraws the ticker board: the price line and a smaller line under it (the band or the halt code). */
    setTicker(price: string, sub: string): void;
    /** Sets the tower clock to a time of the venue day, in minutes from midnight. */
    setClock(minutes: number): void;
    anchors: Place['anchors'] & {
        bell: THREE.Vector3;
        lamp: THREE.Vector3;
        /** Where the halt poster's cranes take off. */
        launch: THREE.Vector3;
        ticker: THREE.Vector3;
    };
}

export interface HaltBoard extends Place {
    /** What the on-chain record says: trading or halted; `unknown` greys it out: its evidence is stale. */
    setState(state: RecordState): void;
    /** How fresh the evidence is: 1 just renewed, 0 expired. Drives the hourglass. */
    setFreshness(freshness: number): void;
    anchors: Place['anchors'] & {
        /** Where a crane lands to post a message. */
        perch: THREE.Vector3;
    };
}

/** The halt poster's messenger: a paper crane. The director flies it by moving `group`. */
export interface Crane {
    group: THREE.Group;
    /** Flaps the wings; call every frame while it is visible. */
    update(dt: number, time: number): void;
    /** Tints the note it carries: a halt, a resumption, or a heartbeat. */
    setNote(kind: 'halt' | 'resume' | 'heartbeat'): void;
}

const BRONZE = '#b98a3e';
const BRONZE_DEEP = '#8f6626';
const JADE_DEEP = '#2f8676';
const NIGHT = '#2d3142';

const STATUS_TONE: Record<MarketStatus, string> = { trading: PALETTE.ok, limit: PALETTE.warn, halted: PALETTE.stop };

export function createExchange(): Exchange {
    const group = new THREE.Group();
    group.name = 'exchange';
    group.position.set(SITES.exchange[0], 0, SITES.exchange[1]);

    const s = new Sculpt();
    const BASE = 0.42;
    // Three tiers, each narrower than the one below.
    const T1 = { w: 3.4, h: 2.7, y: BASE };
    const R1 = T1.y + T1.h;
    const T2 = { w: 2.5, h: 2.0, y: R1 + 0.38 };
    const R2 = T2.y + T2.h;
    const T3 = { w: 1.7, h: 1.6, y: R2 + 0.34 };
    const R3 = T3.y + T3.h;
    const PEAK = R3 + 1.0;

    // The stone terrace and its steps to the door.
    s.box(4.2, BASE, 4.2, { color: PALETTE.stone, top: '#e2dcd0', r: 0.08 });
    s.box(1.5, 0.28, 0.5, { color: PALETTE.stoneDark, at: [0, 0, 2.24], r: 0.05 });
    s.box(1.3, 0.14, 0.45, { color: PALETTE.stoneDark, at: [0, 0, 2.62], r: 0.05 });

    // Tier one: plaster and dark timber, a wide door, the trading hall's windows.
    s.box(T1.w, T1.h, T1.w, { color: PALETTE.plasterShade, top: PALETTE.plaster, at: [0, T1.y, 0], r: 0.05 });
    for (const x of [-T1.w / 2, T1.w / 2]) {
        for (const z of [-T1.w / 2, T1.w / 2]) s.box(0.24, T1.h, 0.24, { color: NIGHT, at: [x, T1.y, z], r: 0.05 });
    }
    s.box(T1.w + 0.08, 0.55, T1.w + 0.08, { color: JADE_DEEP, at: [0, T1.y, 0], r: 0.05 });
    s.box(T1.w + 0.12, 0.16, T1.w + 0.12, { color: PALETTE.gold, at: [0, R1 - 0.2, 0], r: 0.04, layer: 'gloss' });
    const front = T1.w / 2;
    s.box(1.4, 1.9, 0.1, { color: NIGHT, at: [0, T1.y, front], r: 0.04 });
    for (const x of [-0.33, 0.33]) {
        s.box(0.56, 1.7, 0.12, { color: '#7a5540', at: [x, T1.y + 0.04, front + 0.01], r: 0.03 });
        s.ball(0.06, { color: PALETTE.gold, at: [x * 0.36, T1.y + 0.9, front + 0.1], detail: 1, layer: 'gloss' });
    }
    noren(s, [0, T1.y + 2.02, front + 0.06], 1.5, 0.42, PALETTE.roofJade, 3, PALETTE.gold);
    s.group({ at: [front, 0, 0], rot: [0, Math.PI / 2, 0] }, (g) => {
        shojiWindow(g, [-0.75, T1.y + 0.95, 0], 0.95, 1.05, NIGHT, 2, 2);
        shojiWindow(g, [0.75, T1.y + 0.95, 0], 0.95, 1.05, NIGHT, 2, 2);
    });
    for (const x of [-1.15, 1.15]) shojiWindow(s, [x, T1.y + 1.15, front], 0.5, 0.8, NIGHT, 1, 2);
    hippedRoof(s, { at: [0, R1, 0], w: T1.w, d: T1.w, rise: 0.74, color: PALETTE.roofJade, overhang: 0.5, tip: 0.2 });

    // Tier two: the clock floor.
    s.box(T2.w, T2.h, T2.w, { color: PALETTE.plasterShade, top: PALETTE.plaster, at: [0, T2.y, 0], r: 0.05 });
    for (const x of [-T2.w / 2, T2.w / 2]) {
        for (const z of [-T2.w / 2, T2.w / 2]) s.box(0.2, T2.h, 0.2, { color: NIGHT, at: [x, T2.y, z], r: 0.04 });
    }
    s.box(T2.w + 0.1, 0.14, T2.w + 0.1, { color: PALETTE.gold, at: [0, R2 - 0.18, 0], r: 0.04, layer: 'gloss' });
    // A clock on the face toward the town.
    s.group({ at: [T2.w / 2, T2.y + 1.05, 0], rot: [0, 0, -Math.PI / 2] }, (g) => {
        g.cyl(0.62, 0.62, 0.1, { color: PALETTE.gold, seg: 28, layer: 'gloss' });
        g.cyl(0.52, 0.52, 0.12, { color: PALETTE.paper, seg: 28 });
        // Hour marks at twelve, three, six and nine.
        for (const [x, z] of [
            [-0.42, 0],
            [0.42, 0],
            [0, -0.42],
            [0, 0.42],
        ] as const)
            g.box(0.07, 0.13, 0.07, { color: PALETTE.gold, at: [x, 0, z], r: 0.01 });
        g.cyl(0.06, 0.06, 0.18, { color: PALETTE.vermilion, seg: 10, layer: 'gloss' });
    });
    shojiWindow(s, [0, T2.y + 0.6, T2.w / 2], 1.3, 0.95, NIGHT, 3, 2);
    // The ledge the cranes leave from.
    s.box(1.0, 0.1, 0.6, { color: '#7a5540', at: [0.2, T2.y + 0.42, T2.w / 2 + 0.3], r: 0.03 });
    s.cyl(0.03, 0.03, 0.42, { color: '#7a5540', at: [0.6, T2.y + 0.5, T2.w / 2 + 0.52], seg: 6 });
    hippedRoof(s, { at: [0, R2, 0], w: T2.w, d: T2.w, rise: 0.66, color: PALETTE.roofJade, overhang: 0.46, tip: 0.2 });

    // Tier three: the open belfry.
    for (const x of [-T3.w / 2, T3.w / 2]) {
        for (const z of [-T3.w / 2, T3.w / 2])
            s.box(0.2, T3.h, 0.2, { color: PALETTE.vermilion, at: [x, T3.y, z], r: 0.04, layer: 'gloss' });
    }
    s.box(T3.w + 0.2, 0.16, T3.w + 0.2, { color: NIGHT, at: [0, T3.y - 0.06, 0], r: 0.04 });
    for (const [x, z, w, d] of [
        [0, T3.w / 2, T3.w, 0.06],
        [T3.w / 2, 0, 0.06, T3.w],
    ] as const) {
        s.box(w, 0.07, d, { color: PALETTE.vermilion, at: [x, T3.y + 0.46, z], r: 0.02, layer: 'gloss' });
    }
    s.box(T3.w + 0.24, 0.2, T3.w + 0.24, { color: PALETTE.gold, at: [0, R3 - 0.2, 0], r: 0.04, layer: 'gloss' });
    s.box(0.16, 0.16, T3.w + 0.1, { color: '#7a5540', at: [0, R3 - 0.34, 0], r: 0.03 });
    hippedRoof(s, { at: [0, R3, 0], w: T3.w, d: T3.w, rise: 0.92, color: PALETTE.roofJade, overhang: 0.52, tip: 0.3 });
    // The mast that carries the status lantern.
    s.cyl(0.07, 0.1, 0.5, { color: PALETTE.gold, at: [0, PEAK - 0.12, 0], seg: 10, layer: 'gloss' });
    s.torus(0.2, 0.035, { color: PALETTE.gold, at: [0, PEAK + 0.38, 0], seg: 18, layer: 'gloss' });

    // Dressing at the foot: two planters and a price-chart easel.
    for (const x of [-1.6, 1.6]) {
        s.cyl(0.24, 0.2, 0.34, { color: '#7fa7c9', at: [x, BASE, 1.72], seg: 12, layer: 'gloss' });
        s.ball(0.32, {
            color: PALETTE.pineDeep,
            top: PALETTE.pine,
            at: [x, BASE + 0.58, 1.72],
            scale: [1, 0.9, 1],
            detail: 2,
        });
    }
    s.group({ at: [1.9, 0, 2.5], rot: [0, -0.5, 0] }, (g) => {
        g.box(0.06, 1.1, 0.06, { color: '#7a5540', at: [-0.3, 0, 0], rot: [0.14, 0, 0], r: 0.015 });
        g.box(0.06, 1.1, 0.06, { color: '#7a5540', at: [0.3, 0, 0], rot: [0.14, 0, 0], r: 0.015 });
        g.box(0.8, 0.56, 0.04, { color: PALETTE.paper, at: [0, 0.5, 0.04], rot: [0.14, 0, 0], r: 0.015 });
        const bars: ReadonlyArray<readonly [number, number, string]> = [
            [-0.26, 0.16, PALETTE.ok],
            [-0.13, 0.24, PALETTE.ok],
            [0, 0.18, PALETTE.stop],
            [0.13, 0.3, PALETTE.ok],
            [0.26, 0.38, PALETTE.ok],
        ];
        for (const [x, h, tone] of bars) g.box(0.07, h, 0.02, { color: tone, at: [x, 0.56, 0.075], rot: [0.14, 0, 0] });
    });

    group.add(s.build('exchange'));

    // The ticker board on the first roof's eave.
    const ticker = makeSign({
        width: 2.9,
        height: 1.0,
        text: 'TSA 12.40',
        sub: 'band 11.78 – 13.02',
        color: '#ffe9a8',
        background: '#22263a',
        border: PALETTE.gold,
        weight: 700,
        density: 150,
        radius: 0.12,
        lit: true,
    });
    ticker.mesh.position.set(0, R1 + 0.72, front + 0.56);
    group.add(ticker.mesh);
    const tickerFrame = new Sculpt();
    for (const x of [-1.5, 1.5])
        tickerFrame.box(0.1, 1.25, 0.1, { color: NIGHT, at: [x, R1 + 0.1, front + 0.54], r: 0.02 });
    group.add(tickerFrame.build('ticker-frame'));
    let tickerPop = 0;

    // The status lantern at the top, and two smaller ones by the door.
    const lamp = makeLamp(new THREE.IcosahedronGeometry(0.42, 3), PALETTE.ok, 1.2);
    lamp.mesh.position.set(0, PEAK + 0.86, 0);
    group.add(lamp.mesh);
    const doorLamps = [-1, 1].map((side) => {
        const item = makeLamp(
            new THREE.LatheGeometry(
                [
                    [0.05, 0],
                    [0.15, 0.06],
                    [0.18, 0.2],
                    [0.15, 0.34],
                    [0.05, 0.4],
                ].map(([r, y]) => new THREE.Vector2(r, y)),
                14,
            ),
            PALETTE.ok,
            1,
        );
        item.mesh.position.set(side * 1.02, T1.y + 1.5, front + 0.34);
        group.add(item.mesh);
        return item;
    });
    const lampArms = new Sculpt();
    for (const side of [-1, 1])
        lampArms.box(0.05, 0.05, 0.4, { color: NIGHT, at: [side * 1.02, T1.y + 1.96, front + 0.18], r: 0.015 });
    group.add(lampArms.build('lamp-arms'));

    // The bell, hung in the belfry, with its clapper.
    const bellPivot = new THREE.Group();
    bellPivot.position.set(0, R3 - 0.34, 0);
    const bell = new Sculpt();
    bell.lathe(
        [
            [0.52, -1.02],
            [0.46, -0.94],
            [0.4, -0.7],
            [0.36, -0.42],
            [0.26, -0.2],
            [0.1, -0.1],
            [0.02, -0.08],
        ],
        { color: BRONZE, top: '#d7a653', seg: 26, layer: 'gloss' },
    );
    bell.torus(0.5, 0.045, { color: BRONZE_DEEP, at: [0, -0.96, 0], seg: 26, layer: 'gloss' });
    bell.torus(0.385, 0.03, { color: BRONZE_DEEP, at: [0, -0.56, 0], seg: 24, layer: 'gloss' });
    bell.cyl(0.035, 0.035, 0.14, { color: BRONZE_DEEP, at: [0, -0.12, 0], seg: 8 });
    bellPivot.add(bell.build('bell'));
    const clapperPivot = new THREE.Group();
    clapperPivot.position.set(0, -0.2, 0);
    const clapper = new Sculpt();
    clapper.cyl(0.02, 0.02, 0.7, { color: NIGHT, at: [0, -0.7, 0], seg: 6 });
    clapper.ball(0.09, { color: BRONZE_DEEP, at: [0, -0.74, 0], detail: 2, layer: 'gloss' });
    clapperPivot.add(clapper.build('clapper'));
    bellPivot.add(clapperPivot);
    group.add(bellPivot);

    // A pennant on the mast.
    const pennant = new Sculpt();
    pennant.extrude(
        [
            [0, 0],
            [0.7, 0.14],
            [0, 0.3],
        ],
        0.02,
        { color: PALETTE.vermilion, layer: 'gloss' },
    );
    const pennantNode = pennant.build('pennant');
    pennantNode.position.set(0.05, PEAK + 0.02, 0);
    group.add(pennantNode);

    // The clock's hands turn with the venue's time. Seen from outside, clockwise is a negative turn about X.
    const hand = (length: number, width: number): THREE.Group => {
        const part = new Sculpt();
        part.box(0.04, length, width, { color: NIGHT, at: [0, -0.06, 0], r: 0.01 });
        const node = part.build('clock-hand');
        node.position.set(T2.w / 2 + 0.15, T2.y + 1.05, 0);
        group.add(node);
        return node;
    };
    const hourHand = hand(0.32, 0.075);
    const minuteHand = hand(0.46, 0.05);
    let clockGoal = 9 * 60;
    let clockShown = 9 * 60;

    const hitbox = makeHitbox(4.2, PEAK + 1.2, 4.2);
    group.add(hitbox);

    let status: MarketStatus = 'trading';
    let ringAt = -10;
    let now = 0;

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, 0, PEAK + 1.3, 0),
            door: anchor(group, 0, 0, front + 1.2),
            bell: anchor(group, 0, R3 - 1, 0),
            lamp: anchor(group, 0, PEAK + 0.86, 0),
            launch: anchor(group, 0.3, T2.y + 0.9, T2.w / 2 + 0.4),
            ticker: anchor(group, 0, R1 + 0.72, front + 0.6),
        },
        setStatus(next) {
            status = next;
            tickerPop = 1;
        },
        ringBell() {
            ringAt = now;
        },
        setTicker(price, sub) {
            const halted = /HALT/.test(price);
            ticker.set({
                text: price,
                sub,
                color: halted ? '#ffb4a8' : sub.includes('LIMIT') ? '#ffd27a' : '#ffe9a8',
                border: halted ? PALETTE.stop : PALETTE.gold,
            });
            tickerPop = 1;
        },
        setClock(minutes) {
            clockGoal = minutes;
        },
        update(dt, time) {
            now = time;
            // The hands sweep to the venue's time rather than jump.
            clockShown = Math.abs(clockGoal - clockShown) < 0.05 ? clockGoal : damp(clockShown, clockGoal, 4, dt);
            minuteHand.rotation.x = -((clockShown % 60) / 60) * Math.PI * 2;
            hourHand.rotation.x = -((clockShown % 720) / 720) * Math.PI * 2;
            // The lantern: steady when trading, a quick pulse in a limit state, a slow throb when halted.
            const tone = STATUS_TONE[status];
            const glow =
                status === 'trading'
                    ? 1.1 + Math.sin(time * 1.4) * 0.08
                    : status === 'limit'
                      ? 0.7 + Math.abs(Math.sin(time * 5)) * 1.1
                      : 1 + Math.sin(time * 2.2) * 0.45;
            lamp.set(tone, glow);
            lamp.mesh.scale.setScalar(
                1 + (status === 'trading' ? 0 : Math.sin(time * (status === 'limit' ? 10 : 2.2)) * 0.05),
            );
            for (const item of doorLamps) item.set(tone, glow * 0.85);

            // The bell swings and dies away; the clapper lags behind it.
            const t = time - ringAt;
            const swing = t >= 0 && t < 3.2 ? Math.sin(t * 6.4) * 0.55 * Math.exp(-t * 1.1) : 0;
            bellPivot.rotation.x = swing;
            clapperPivot.rotation.x =
                t >= 0 && t < 3.2 ? Math.sin(t * 6.4 - 1.1) * 0.7 * Math.exp(-t * 1.0) - swing : 0;

            tickerPop = Math.max(0, tickerPop - dt * 2.4);
            ticker.mesh.scale.setScalar(1 + ease.out(tickerPop) * 0.1);
            pennantNode.rotation.y = Math.sin(time * 2.1) * 0.35 + 0.4;
        },
    };
}

const RECORD_LOOK: Record<RecordState, { text: string; sub: string; background: string; lamp: string; glow: number }> =
    {
        trading: { text: 'TRADING', sub: 'on-chain record', background: '#2f9a63', lamp: PALETTE.ok, glow: 1.1 },
        halted: { text: 'HALTED', sub: 'on-chain record', background: '#d6483c', lamp: PALETTE.stop, glow: 1.5 },
        // The record itself still says TRADING; it is the evidence behind it that has expired.
        unknown: { text: 'TRADING', sub: 'evidence expired', background: '#8a8478', lamp: '#b9b2a6', glow: 0.15 },
    };

export function createHaltBoard(): HaltBoard {
    const group = new THREE.Group();
    group.name = 'halt board';
    group.position.set(SITES.haltBoard[0], 0, SITES.haltBoard[1]);
    // It stands at a corner of the plaza and faces the camera squarely.
    group.rotation.y = Math.PI / 4;

    const s = new Sculpt();
    s.box(1.9, 0.14, 0.7, { color: PALETTE.stoneDark, r: 0.04 });
    for (const x of [-0.78, 0.78]) s.box(0.13, 2.1, 0.13, { color: PALETTE.woodDark, at: [x, 0.1, 0], r: 0.03 });
    s.box(1.72, 0.1, 0.16, { color: PALETTE.woodDark, at: [0, 0.62, 0], r: 0.03 });
    s.box(1.5, 0.98, 0.08, { color: PALETTE.wood, at: [0, 0.78, -0.02], r: 0.03 });
    s.gableRoof(0.8, 2.2, 0.26, {
        color: PALETTE.roofJade,
        at: [0, 2.16, 0],
        rot: [0, Math.PI / 2, 0],
        thickness: 0.08,
        layer: 'gloss',
    });
    // The perch on the ridge, where a crane lands.
    s.cyl(0.025, 0.025, 0.22, { color: PALETTE.woodDeep, at: [-0.3, 2.36, 0], seg: 6 });
    s.cyl(0.025, 0.025, 0.22, { color: PALETTE.woodDeep, at: [0.3, 2.36, 0], seg: 6 });
    s.cyl(0.03, 0.03, 0.8, { color: PALETTE.woodDeep, at: [-0.4, 2.58, 0], rot: [0, 0, -Math.PI / 2], seg: 6 });
    // The hourglass frame, on a bracket at the board's side.
    const HX = 1.18;
    s.box(0.5, 0.07, 0.12, { color: PALETTE.woodDark, at: [0.98, 1.72, 0], r: 0.02 });
    for (const y of [0.72, 1.6]) s.cyl(0.2, 0.2, 0.05, { color: PALETTE.woodDark, at: [HX, y, 0], seg: 14 });
    for (const [x, z] of [
        [-0.16, 0],
        [0.16, 0],
        [0, 0.16],
    ] as const) {
        s.cyl(0.018, 0.018, 0.85, { color: PALETTE.woodDark, at: [HX + x, 0.75, z], seg: 5 });
    }
    s.cyl(0.02, 0.02, 0.62, { color: PALETTE.woodDark, at: [HX, 0.1, 0], seg: 6 });
    s.cyl(0.12, 0.14, 0.06, { color: PALETTE.stoneDark, at: [HX, 0, 0], seg: 10 });
    group.add(s.build('halt-board'));

    const sign = makeSign({
        width: 1.42,
        height: 0.9,
        text: 'TRADING',
        sub: 'on-chain record',
        color: '#ffffff',
        background: '#2f9a63',
        weight: 700,
        density: 170,
        radius: 0.1,
    });
    sign.mesh.position.set(0, 1.27, 0.03);
    group.add(sign.mesh);
    const lamp = makeLamp(new THREE.SphereGeometry(0.11, 14, 10), PALETTE.ok, 1.1);
    lamp.mesh.position.set(0, 2.02, 0.1);
    group.add(lamp.mesh);

    // The hourglass: two glass bulbs, sand that runs from the top to the bottom.
    const glass = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        depthWrite: false,
    });
    const bulb = new THREE.ConeGeometry(0.16, 0.4, 14);
    const upper = new THREE.Mesh(bulb, glass);
    upper.position.set(HX, 1.38, 0);
    upper.rotation.x = Math.PI;
    const lower = new THREE.Mesh(bulb, glass);
    lower.position.set(HX, 0.97, 0);
    upper.renderOrder = 3;
    lower.renderOrder = 3;
    group.add(upper, lower);
    const sandGeometry = new THREE.ConeGeometry(0.13, 0.34, 12);
    const upperSand = makeLamp(sandGeometry.clone().rotateX(Math.PI).translate(0, 0.17, 0), PALETTE.gold, 0.7);
    upperSand.mesh.position.set(HX, 1.2, 0);
    const lowerSand = makeLamp(sandGeometry.clone().translate(0, 0.17, 0), PALETTE.gold, 0.7);
    lowerSand.mesh.position.set(HX, 0.79, 0);
    group.add(upperSand.mesh, lowerSand.mesh);

    const hitbox = makeHitbox(2.6, 2.8, 1.2, [0.2, 0, 0]);
    group.add(hitbox);

    let state: RecordState = 'trading';
    let freshness = 1;
    let shown = 1;
    let pop = 0;

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, 0, 3.0, 0),
            door: anchor(group, 0, 0, 0.9),
            perch: anchor(group, 0, 2.72, 0),
        },
        setState(next) {
            if (next === state) return;
            state = next;
            const look = RECORD_LOOK[next];
            sign.set({ text: look.text, sub: look.sub, background: look.background });
            pop = 1;
        },
        setFreshness(value) {
            freshness = clamp(value);
        },
        update(dt, time) {
            shown = damp(shown, freshness, 8, dt);
            // Sand leaves the top bulb and piles up in the bottom one.
            const top = Math.max(shown, 0.001);
            const bottom = Math.max(1 - shown, 0.001);
            upperSand.mesh.scale.set(Math.sqrt(top), top, Math.sqrt(top));
            lowerSand.mesh.scale.set(0.5 + bottom * 0.5, bottom, 0.5 + bottom * 0.5);
            const sandTone = shown > 0.3 ? PALETTE.gold : shown > 0.02 ? PALETTE.warn : '#b9b2a6';
            upperSand.set(sandTone, 0.7);
            lowerSand.set(sandTone, 0.7);

            const look = RECORD_LOOK[state];
            lamp.set(look.lamp, state === 'halted' ? 0.9 + Math.abs(Math.sin(time * 4)) * 0.9 : look.glow);
            pop = Math.max(0, pop - dt * 2.2);
            sign.mesh.scale.setScalar(1 + ease.out(pop) * 0.16);
        },
    };
}

const NOTE_TONE = { halt: PALETTE.stop, resume: PALETTE.ok, heartbeat: '#8ecbff' } as const;

export function createCrane(): Crane {
    const group = new THREE.Group();
    group.name = 'crane';
    const paper = '#fffaf0';
    const shade = '#efe3cb';

    // The folded body: a diamond with a neck forward and a tail back. It faces +Z.
    const body = new Sculpt();
    body.cone(0.13, 0.36, { color: paper, at: [0, 0, 0.02], rot: [Math.PI / 2, 0, 0], seg: 4, flat: true });
    body.cone(0.13, 0.3, { color: shade, at: [0, 0, -0.02], rot: [-Math.PI / 2, 0, 0], seg: 4, flat: true });
    body.cone(0.05, 0.36, { color: paper, at: [0, 0.02, 0.24], rot: [0.75, 0, 0], seg: 4, flat: true });
    body.cone(0.035, 0.14, { color: shade, at: [0, 0.27, 0.49], rot: [2.2, 0, 0], seg: 4, flat: true });
    body.cone(0.05, 0.34, { color: shade, at: [0, 0.02, -0.22], rot: [-0.8, 0, 0], seg: 4, flat: true });
    const bodyNode = body.build('crane-body');
    for (const child of bodyNode.children) child.castShadow = false;
    group.add(bodyNode);

    // The note in its beak.
    const note = makeLamp(new THREE.BoxGeometry(0.13, 0.1, 0.02), NOTE_TONE.heartbeat, 1.1);
    note.mesh.position.set(0, 0.2, 0.56);
    note.mesh.rotation.x = -0.5;
    group.add(note.mesh);

    // Two wings, hinged along the body.
    const wings = [-1, 1].map((side) => {
        const wing = new Sculpt();
        wing.extrude(
            [
                [0, -0.16],
                [0.46, 0.02],
                [0, 0.18],
            ],
            0.018,
            { color: side > 0 ? paper : shade, rot: [-Math.PI / 2, 0, 0] },
        );
        const node = wing.build('wing');
        for (const child of node.children) child.castShadow = false;
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.03, 0.03, 0);
        if (side < 0) node.scale.x = -1;
        pivot.add(node);
        group.add(pivot);
        return { pivot, side };
    });

    return {
        group,
        update(_dt, time) {
            const flap = Math.sin(time * 13) * 0.75 + 0.15;
            for (const wing of wings) wing.pivot.rotation.z = wing.side * flap;
            bodyNode.position.y = Math.sin(time * 13 + Math.PI) * 0.03;
        },
        setNote(kind) {
            note.set(NOTE_TONE[kind], 1.2);
        },
    };
}
