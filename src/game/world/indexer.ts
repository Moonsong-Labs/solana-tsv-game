/**
 * The indexer and the public feed: the indexer reads finalized blocks and
 * records pools, fills, credentials and refusals; the billboard is the free
 * public feed of trades, in U.S. dollars.
 *
 * In the town the indexer is a tiny signal cabin on a plank base, under a
 * big dish that scans the sky and turns to the rail to read a block. The
 * feed is the roofed board beside it.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { DISPLAY_FONT, MATERIALS, PALETTE, Sculpt, clamp, ease, lerp, makeLamp, type PartOpts } from '../scene/kit.ts';
import { SITES } from './layout.ts';
import { type Place, anchor, hippedRoof, makeHitbox, shojiWindow } from './place.ts';

/** One line on the public feed. */
export interface FeedLine {
    /** For example "10:42 BUY 0.80 TSA". */
    text: string;
    tone: 'fill' | 'refusal' | 'info';
}

export interface Indexer extends Place {
    /** The dish swings round and pings: a block was read. */
    ping(): void;
    /** Redraws the billboard with the latest lines, newest first (up to four). */
    setFeed(lines: readonly FeedLine[]): void;
    anchors: Place['anchors'] & {
        dish: THREE.Vector3;
        board: THREE.Vector3;
    };
}

/**
 * The cabin's centre, in the place's own coordinates. It stands at the back,
 * by the rail: the near gatehouse hides only its plank base.
 */
const HUT_X = 0.85;
const HUT_Z = -1.0;
/**
 * The billboard's centre and the angle it is turned from facing +Z: almost
 * square to the camera, along the front where nothing stands before it, and
 * high enough to clear the near gatehouse's roof.
 */
const BOARD_X = -0.455;
const BOARD_Z = 0.694;
const BOARD_TURN = 0.65;
const BOARD_W = 2.3;
const BOARD_H = 1.6;
/** Height of the billboard's centre. */
const BOARD_Y = 2.6;
/** Canvas pixels per world unit on the billboard. */
const BOARD_DENSITY = 230;
/** Where the dish turns, on top of the mast. */
const DISH_Y = 3.74;
const DISH_R = 0.74;
/** How the dish points when it idles: its sweep either side of the camera, and its lift. */
const SCAN_YAW = -Math.PI / 4;
const SCAN_SWEEP = 0.95;
const SCAN_LIFT = 0.5;
/** How far up the rail from the dock the dish looks to read a block, and how high. */
const READ_PAST_DOCK = 1.5;
const READ_HEIGHT = 1.2;
const RINGS = 3;
const BEACON_FLASH = new THREE.Color('#fff6d8');

const FEED_FONT =
    'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
const TONE: Record<FeedLine['tone'], string> = {
    fill: '#7df0ae',
    refusal: '#ffc65e',
    info: '#d5e6f7',
};

/** A rounded box with few triangles, for small parts. Anchored at the centre of its base. */
function soft(s: Sculpt, w: number, h: number, d: number, r: number, opts: PartOpts): void {
    s.geo(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) * 0.49)), opts, h / 2);
}

export function createIndexer(): Indexer {
    const group = new THREE.Group();
    group.name = 'indexer';
    group.position.set(SITES.indexer[0], 0, SITES.indexer[1]);

    const FLOOR = 1.26;
    const CABIN = 0.92;
    const eaves = FLOOR + 0.1 + CABIN;
    const RISE = 0.62;

    const s = new Sculpt();
    // ----- The cabin: a plank base, an overhanging room with windows, a mustard roof -----
    s.group({ at: [HUT_X, 0, HUT_Z] }, (g) => {
        g.box(1.3, 0.16, 1.3, { color: PALETTE.stoneDark, top: PALETTE.stone, r: 0.05 });
        g.box(1.08, FLOOR - 0.16, 1.08, { color: PALETTE.woodDark, top: '#a4744f', at: [0, 0.16, 0], r: 0.03 });
        for (const x of [-1, 1]) {
            for (const z of [-1, 1])
                g.box(0.13, FLOOR - 0.16, 0.13, { color: PALETTE.woodDeep, at: [x * 0.52, 0.16, z * 0.52], r: 0 });
        }
        // Board joints on the two faces the camera sees.
        for (let i = 1; i < 5; i += 1) {
            g.box(0.02, FLOOR - 0.2, 0.02, { color: PALETTE.woodDeep, at: [-0.54 + i * 0.216, 0.16, 0.541], r: 0 });
            g.box(0.02, FLOOR - 0.2, 0.02, { color: PALETTE.woodDeep, at: [0.541, 0.16, -0.54 + i * 0.216], r: 0 });
        }
        // The floor beams and the room.
        g.box(1.42, 0.1, 1.42, { color: PALETTE.woodDeep, at: [0, FLOOR, 0], r: 0.03 });
        for (const x of [-1, 1]) {
            for (const z of [-1, 1])
                g.box(0.1, 0.24, 0.1, {
                    color: PALETTE.woodDeep,
                    at: [x * 0.6, FLOOR - 0.22, z * 0.6],
                    rot: [z * 0.5, 0, -x * 0.5],
                    r: 0,
                });
        }
        g.box(1.3, CABIN, 1.3, { color: PALETTE.plasterShade, top: PALETTE.plaster, at: [0, FLOOR + 0.1, 0], r: 0.04 });
        for (const x of [-1, 1]) {
            for (const z of [-1, 1])
                g.box(0.12, CABIN, 0.12, { color: PALETTE.woodDark, at: [x * 0.61, FLOOR + 0.1, z * 0.61], r: 0 });
        }
        g.box(1.36, 0.1, 1.36, { color: PALETTE.woodDark, at: [0, eaves - 0.1, 0], r: 0.03 });
        // Front (+Z): a paper window, with the door and a ladder below.
        shojiWindow(g, [0, FLOOR + 0.32, 0.65], 0.92, 0.44, PALETTE.woodDark, 4, 1);
        soft(g, 0.46, 0.84, 0.07, 0.03, { color: PALETTE.wood, at: [0.2, 0.16, 0.54] });
        g.cyl(0.085, 0.085, 0.08, {
            color: PALETTE.windowWarm,
            at: [0.2, 0.72, 0.54],
            rot: [Math.PI / 2, 0, 0],
            seg: 12,
            layer: 'window',
        });
        g.ball(0.035, { color: PALETTE.gold, at: [0.04, 0.56, 0.59], detail: 1 });
        g.box(0.6, 0.1, 0.3, { color: PALETTE.stone, at: [0.2, 0, 0.74], r: 0.03 });
        for (const rail of [-1, 1])
            g.box(0.04, FLOOR + 0.12, 0.04, {
                color: PALETTE.wood,
                at: [-0.3 + rail * 0.12, 0, 0.75],
                rot: [-0.07, 0, 0],
                r: 0,
            });
        for (let i = 0; i < 6; i += 1)
            g.box(0.26, 0.035, 0.035, { color: PALETTE.wood, at: [-0.3, 0.16 + i * 0.2, 0.74 - i * 0.014], r: 0 });
        // Side (+X): the server room behind glass. Along this face, x runs towards −Z.
        g.group({ at: [0.65, 0, 0], rot: [0, Math.PI / 2, 0] }, (f) => {
            f.box(1.06, 0.58, 0.08, { color: PALETTE.woodDark, at: [0, FLOOR + 0.25, 0], r: 0.03 });
            f.box(0.94, 0.46, 0.1, { color: '#2a2833', at: [0, FLOOR + 0.31, 0], r: 0 });
            for (const rack of [-1, 1])
                f.box(0.4, 0.4, 0.11, { color: '#403c4c', at: [rack * 0.235, FLOOR + 0.34, 0], r: 0 });
            f.box(1.18, 0.06, 0.18, { color: PALETTE.woodDark, at: [0, FLOOR + 0.2, 0.05], r: 0 });
        });
        // The roof, its collar and the mast.
        hippedRoof(g, {
            at: [0, eaves, 0],
            w: 1.3,
            d: 1.3,
            rise: RISE,
            color: PALETTE.roofMustard,
            overhang: 0.25,
            tip: 0.16,
        });
        g.cyl(0.1, 0.17, 0.2, { color: '#c9962f', at: [0, eaves + RISE - 0.08, 0], seg: 12, layer: 'gloss' });
        g.cyl(0.045, 0.055, DISH_Y - (eaves + RISE) - 0.08, {
            color: '#4f4a55',
            at: [0, eaves + RISE + 0.08, 0],
            seg: 8,
            layer: 'gloss',
        });
        // A lantern under the eave.
        g.box(0.05, 0.05, 0.3, { color: PALETTE.woodDeep, at: [0.62, eaves - 0.16, 0.8], r: 0 });
        g.lathe(
            [
                [0.04, 0],
                [0.11, 0.05],
                [0.13, 0.15],
                [0.11, 0.25],
                [0.04, 0.3],
            ],
            { color: PALETTE.lantern, at: [0.62, eaves - 0.48, 0.92], layer: 'window', seg: 12 },
        );
    });

    // ----- The billboard: two posts, a dark board under a strip of mustard tiles -----
    s.group({ at: [BOARD_X, 0, BOARD_Z], rot: [0, BOARD_TURN, 0] }, (g) => {
        const half = BOARD_W / 2;
        for (const x of [-1, 1]) {
            g.cyl(0.07, 0.085, BOARD_Y + BOARD_H / 2 + 0.16, {
                color: PALETTE.woodDark,
                at: [x * (half - 0.14), 0, -0.1],
                seg: 10,
            });
            g.box(0.3, 0.12, 0.3, { color: PALETTE.stone, at: [x * (half - 0.14), 0, -0.1], r: 0.04 });
        }
        soft(g, BOARD_W + 0.2, BOARD_H + 0.2, 0.12, 0.05, {
            color: '#3a3848',
            at: [0, BOARD_Y - BOARD_H / 2 - 0.1, 0],
        });
        g.box(BOARD_W + 0.3, 0.09, 0.18, {
            color: PALETTE.woodDark,
            at: [0, BOARD_Y + BOARD_H / 2 + 0.1, -0.03],
            r: 0.03,
        });
        soft(g, BOARD_W + 0.56, 0.07, 0.5, 0.03, {
            color: PALETTE.roofMustard,
            at: [0, BOARD_Y + BOARD_H / 2 + 0.2, 0.0],
            rot: [0.34, 0, 0],
            layer: 'gloss',
        });
        g.cyl(0.05, 0.05, BOARD_W + 0.62, {
            color: '#c9962f',
            at: [-(BOARD_W + 0.62) / 2, BOARD_Y + BOARD_H / 2 + 0.33, -0.2],
            rot: [0, 0, -Math.PI / 2],
            seg: 8,
            layer: 'gloss',
        });
        // A shelf lip under the board.
        g.box(BOARD_W + 0.1, 0.06, 0.2, { color: PALETTE.woodDark, at: [0, BOARD_Y - BOARD_H / 2 - 0.16, 0.03], r: 0 });
    });

    // The wire from the mast to the board's near post.
    const reach = BOARD_W / 2 - 0.14;
    const boardEnd: [number, number, number] = [
        BOARD_X + Math.cos(BOARD_TURN) * reach - 0.05,
        BOARD_Y + BOARD_H / 2 + 0.2,
        BOARD_Z - Math.sin(BOARD_TURN) * reach - 0.09,
    ];
    const mastFoot: [number, number, number] = [HUT_X, eaves + RISE + 0.16, HUT_Z];
    s.tube(
        [
            mastFoot,
            [
                lerp(mastFoot[0], boardEnd[0], 0.4),
                lerp(mastFoot[1], boardEnd[1], 0.4) - 0.14,
                lerp(mastFoot[2], boardEnd[2], 0.4),
            ],
            [
                lerp(mastFoot[0], boardEnd[0], 0.75),
                lerp(mastFoot[1], boardEnd[1], 0.75) - 0.1,
                lerp(mastFoot[2], boardEnd[2], 0.75),
            ],
            boardEnd,
        ],
        0.016,
        { color: '#4f4a55', seg: 14 },
    );
    // Things left in the yard under the board: a cable drum and a tool box.
    s.group({ at: [-0.5, 0, 0.15], rot: [0, 0.9, 0] }, (g) => {
        for (const end of [-1, 1])
            g.cyl(0.27, 0.27, 0.05, {
                color: PALETTE.wood,
                at: [end * 0.15 - 0.025, 0.27, 0],
                rot: [0, 0, -Math.PI / 2],
                seg: 14,
            });
        g.cyl(0.16, 0.16, 0.26, { color: '#4f4a55', at: [-0.13, 0.27, 0], rot: [0, 0, -Math.PI / 2], seg: 12 });
    });
    soft(s, 0.36, 0.2, 0.22, 0.04, { color: PALETTE.roofMustard, at: [-1.1, 0, 0.7], rot: [0, 0.5, 0] });
    s.box(0.2, 0.03, 0.03, { color: '#4f4a55', at: [-1.1, 0.21, 0.7], rot: [0, 0.5, 0], r: 0 });

    group.add(s.build('indexer'));

    // ----- The server lights: a rack of small lamps that flicker -----
    const LEDS = 24;
    const ledMaterial = new THREE.MeshBasicMaterial({ toneMapped: true });
    const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.036, 0.055), ledMaterial, LEDS);
    const ledTone: THREE.Color[] = [];
    const ledBeat: number[] = [];
    {
        const matrix = new THREE.Matrix4();
        const tones = [PALETTE.ok, PALETTE.ok, '#8ecbff', PALETTE.warn];
        let i = 0;
        for (const rack of [-1, 1]) {
            for (let row = 0; row < 4; row += 1) {
                for (let column = 0; column < 3; column += 1) {
                    const along = rack * 0.235 + (column - 1) * 0.105;
                    matrix.makeTranslation(HUT_X + 0.65 + 0.062, FLOOR + 0.42 + row * 0.082, HUT_Z - along);
                    leds.setMatrixAt(i, matrix);
                    ledTone.push(new THREE.Color(tones[(i * 7 + row) % tones.length] as string));
                    ledBeat.push(0.35 + ((i * 37) % 11) * 0.09);
                    leds.setColorAt(i, ledTone[i] as THREE.Color);
                    i += 1;
                }
            }
        }
    }
    group.add(leds);

    // ----- The dish: turns on the mast (yaw), nods on its yoke (lift) -----
    const pivot = new THREE.Group();
    pivot.position.set(HUT_X, DISH_Y, HUT_Z);
    const yoke = new Sculpt();
    yoke.cyl(0.09, 0.07, 0.12, { color: '#4f4a55', at: [0, -0.1, 0], seg: 10, layer: 'gloss' });
    for (const z of [-1, 1])
        yoke.box(0.1, 0.14, 0.04, { color: '#4f4a55', at: [-0.03, -0.06, z * 0.12], r: 0, layer: 'gloss' });
    pivot.add(yoke.build('yoke'));
    const nod = new THREE.Group();
    pivot.add(nod);
    const bowl = new Sculpt();
    // Built pointing up, then laid over to point along +X.
    bowl.group({ rot: [0, 0, -Math.PI / 2] }, (g) => {
        g.cyl(0.13, 0.1, 0.16, { color: '#4f4a55', at: [0, -0.12, 0], seg: 12, layer: 'gloss' });
        g.lathe(
            [
                [0.001, 0.02],
                [0.3, 0.055],
                [0.55, 0.145],
                [DISH_R - 0.02, 0.27],
                [DISH_R, 0.31],
            ],
            { color: '#d9a43c', top: PALETTE.roofMustard, seg: 28, layer: 'gloss' },
        );
        g.lathe(
            [
                [DISH_R, 0.31],
                [DISH_R - 0.04, 0.285],
                [0.54, 0.165],
                [0.29, 0.08],
                [0.001, 0.05],
            ],
            { color: '#fffaf0', seg: 28 },
        );
        g.torus(DISH_R, 0.034, { color: PALETTE.roofMustard, at: [0, 0.31, 0], seg: 28, layer: 'gloss' });
        g.torus(0.42, 0.014, { color: '#eadcbd', at: [0, 0.118, 0], seg: 24 });
        // The feed: an arm from the low rim to a horn at the focus.
        g.tube(
            [
                [-(DISH_R - 0.03), 0.3, 0],
                [-0.62, 0.52, 0],
                [-0.3, 0.7, 0],
                [0, 0.74, 0],
            ],
            0.022,
            { color: '#4f4a55', seg: 10 },
        );
        g.cyl(0.05, 0.075, 0.12, { color: '#4f4a55', at: [0, 0.68, 0], seg: 10, layer: 'gloss' });
    });
    nod.add(bowl.build('dish'));
    const beacon = makeLamp(new THREE.IcosahedronGeometry(0.075, 1), PALETTE.roofMustard, 0.5);
    beacon.mesh.position.set(0.84, 0, 0);
    nod.add(beacon.mesh);
    group.add(pivot);

    // ----- Signal rings: a small pool, shown only while a ping is on its way -----
    const ringGeometry = new THREE.TorusGeometry(0.32, 0.03, 8, 30);
    const rings: {
        mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
        from: THREE.Vector3;
        along: THREE.Vector3;
        at: number;
    }[] = [];
    for (let i = 0; i < RINGS; i += 1) {
        const mesh = new THREE.Mesh(
            ringGeometry,
            new THREE.MeshBasicMaterial({
                color: '#f5a623',
                transparent: true,
                opacity: 0,
                depthWrite: false,
                toneMapped: true,
            }),
        );
        mesh.visible = false;
        mesh.renderOrder = 3;
        group.add(mesh);
        rings.push({ mesh, from: new THREE.Vector3(), along: new THREE.Vector3(1, 0, 0), at: -10 });
    }

    // ----- The public feed -----
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(BOARD_W * BOARD_DENSITY);
    canvas.height = Math.round(BOARD_H * BOARD_DENSITY);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const boardMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: true });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), boardMaterial);
    board.rotation.y = BOARD_TURN;
    board.position.set(BOARD_X + Math.sin(BOARD_TURN) * 0.068, BOARD_Y, BOARD_Z + Math.cos(BOARD_TURN) * 0.068);
    group.add(board);

    let feed: readonly FeedLine[] = [];
    let feedAt = -10;
    let now = 0;
    let drawing = false;
    const SLIDE = 0.34;

    const drawFeed = (): void => {
        const context = canvas.getContext('2d');
        if (!context) return;
        const { width, height } = canvas;
        const unit = height / 100;
        context.clearRect(0, 0, width, height);
        // The board: deep blue-grey with a thin mustard line round it.
        const back = context.createLinearGradient(0, 0, 0, height);
        back.addColorStop(0, '#232a40');
        back.addColorStop(1, '#1b2134');
        context.fillStyle = back;
        context.beginPath();
        context.roundRect(0, 0, width, height, unit * 5);
        context.fill();
        context.strokeStyle = '#e2b04a';
        context.lineWidth = unit * 1.1;
        context.beginPath();
        context.roundRect(unit * 2.2, unit * 2.2, width - unit * 4.4, height - unit * 4.4, unit * 3.4);
        context.stroke();

        // The header.
        const margin = unit * 7.5;
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.fillStyle = '#ffd168';
        context.font = `700 ${Math.round(unit * 15)}px ${DISPLAY_FONT}`;
        context.fillText('PUBLIC FEED', margin, unit * 15.5);
        // A "live" lamp and the currency, at the right.
        context.textAlign = 'right';
        context.font = `700 ${Math.round(unit * 7.5)}px ${DISPLAY_FONT}`;
        context.fillStyle = '#9fb0cc';
        // The feed itself is planned; the board says so, small enough to clear the title.
        context.fillText('PLANNED', width - margin, unit * 16);
        const usd = context.measureText('PLANNED').width;
        context.beginPath();
        context.arc(width - margin - usd - unit * 4.5, unit * 15.5, unit * 2, 0, Math.PI * 2);
        context.fillStyle = feed.length > 0 ? '#e2b04a' : '#5b667f';
        context.fill();
        context.fillStyle = '#39425c';
        context.fillRect(margin, unit * 26, width - margin * 2, unit * 0.9);

        // The lines, newest on top; a new one slides in from under the header.
        const rows = 4;
        const top = unit * 29;
        const rowH = (height - top - unit * 6) / rows;
        const chip = rowH * 0.3;
        const textX = margin + chip + unit * 4;
        const room = width - margin - textX;
        context.textAlign = 'left';
        if (feed.length === 0) {
            context.font = `600 ${Math.round(rowH * 0.5)}px ${DISPLAY_FONT}`;
            context.fillStyle = '#6f7b97';
            context.fillText('waiting for trades', margin, top + rowH * 0.5);
            context.fillStyle = '#2d3550';
            for (let i = 1; i < rows; i += 1)
                context.fillRect(margin, top + rowH * (i + 0.5) - unit * 0.6, room * (0.75 - i * 0.14), unit * 1.2);
            texture.needsUpdate = true;
            return;
        }
        const shown = feed.slice(0, rows);
        // One size for every line, set by the longest.
        let size = rowH * 0.66;
        context.font = `700 ${Math.round(size)}px ${FEED_FONT}`;
        const widest = Math.max(...shown.map((line) => context.measureText(line.text).width));
        if (widest > room) size = (size * room) / widest;
        context.font = `700 ${Math.round(size)}px ${FEED_FONT}`;
        const slide = 1 - ease.out(clamp((now - feedAt) / SLIDE));
        context.save();
        context.beginPath();
        context.rect(0, top - unit, width, height - top - unit * 3.5);
        context.clip();
        shown.forEach((line, i) => {
            const y = top + rowH * (i + 0.5) - slide * rowH;
            context.globalAlpha = (i === 0 ? 1 - slide * 0.7 : 1) * (1 - i * 0.13);
            context.fillStyle = TONE[line.tone];
            context.beginPath();
            context.roundRect(margin, y - chip / 2, chip, chip, chip * 0.3);
            context.fill();
            context.fillText(line.text, textX, y + unit * 0.4);
        });
        context.restore();
        context.globalAlpha = 1;
        texture.needsUpdate = true;
    };
    drawFeed();

    const hitbox = makeHitbox(3, 3.2, 3, [0, 0, 0]);
    group.add(hitbox);

    // To read a block the dish looks up the rail, a little past the dock, where blocks have just been sealed.
    const toRailX = SITES.dock[0] - (SITES.indexer[0] + HUT_X);
    const toRailZ = SITES.dock[1] + READ_PAST_DOCK - (SITES.indexer[1] + HUT_Z);
    const readYaw = Math.atan2(-toRailZ, toRailX);
    const readLift = Math.atan2(READ_HEIGHT - DISH_Y, Math.hypot(toRailX, toRailZ));

    let pingAt = -10;
    let yaw = SCAN_YAW;
    let lift = SCAN_LIFT;
    const forward = new THREE.Vector3(0, 0, 1);
    const color = new THREE.Color();
    /** Which ring each pulse of a ping uses, and when it leaves, in seconds after `ping()`. */
    const PULSES = [0.24, 0.46];
    let pulsesSent = PULSES.length;

    return {
        group,
        hitbox,
        anchors: {
            label: anchor(group, HUT_X, DISH_Y + DISH_R + 0.3, HUT_Z),
            // In front of the board, where its keeper stands to read it.
            door: anchor(group, -0.45, 0, 1.25),
            dish: anchor(group, HUT_X, DISH_Y, HUT_Z),
            board: anchor(group, BOARD_X + Math.sin(BOARD_TURN) * 0.1, BOARD_Y, BOARD_Z + Math.cos(BOARD_TURN) * 0.1),
        },
        ping() {
            pingAt = now;
            pulsesSent = 0;
        },
        setFeed(lines) {
            const next = lines.slice(0, 4).map((line) => ({ text: line.text, tone: line.tone }));
            const same =
                next.length === feed.length &&
                next.every((line, n) => line.text === feed[n]?.text && line.tone === feed[n]?.tone);
            if (same) return;
            // A new line on top slides in; any other change is simply redrawn.
            const newTop = next.length > 0 && (next[0]?.text !== feed[0]?.text || next.length !== feed.length);
            feed = next;
            if (newTop) {
                feedAt = now;
                drawing = true;
            }
            drawFeed();
        },
        update(_dt, time) {
            now = time;
            const t = time - pingAt;

            // The dish: a slow sweep of the sky; on a ping it snaps to the rail, holds, and drifts back.
            let read = 0;
            if (t >= 0 && t < 1.5) {
                if (t < 0.24) read = ease.outBack(t / 0.24);
                else if (t < 1.0) read = 1;
                else read = 1 - ease.inOut((t - 1.0) / 0.5);
            }
            const scanYaw = SCAN_YAW + Math.sin(time * 0.42) * SCAN_SWEEP;
            const scanLift = SCAN_LIFT + Math.sin(time * 0.63 + 1) * 0.07;
            yaw = lerp(scanYaw, readYaw, read);
            lift = lerp(scanLift, readLift, read);
            // A little recoil with each pulse.
            let kick = 0;
            for (const at of PULSES) {
                const k = t - at;
                if (k >= 0 && k < 0.2) kick += Math.sin((k / 0.2) * Math.PI) * 0.05;
            }
            pivot.rotation.y = yaw;
            nod.rotation.z = lift + kick;

            // Pulses leave the dish along the way it points at that moment.
            while (pulsesSent < PULSES.length && t >= (PULSES[pulsesSent] as number)) {
                const ring = rings[pulsesSent % RINGS];
                if (ring) {
                    ring.along.set(Math.cos(lift) * Math.cos(yaw), Math.sin(lift), -Math.cos(lift) * Math.sin(yaw));
                    ring.from.set(HUT_X, DISH_Y, HUT_Z).addScaledVector(ring.along, 0.8);
                    ring.mesh.quaternion.setFromUnitVectors(forward, ring.along);
                    ring.at = pingAt + (PULSES[pulsesSent] as number);
                }
                pulsesSent += 1;
            }
            for (const ring of rings) {
                const k = (time - ring.at) / 0.62;
                if (k < 0 || k >= 1) {
                    ring.mesh.visible = false;
                    continue;
                }
                ring.mesh.visible = true;
                ring.mesh.position.copy(ring.from).addScaledVector(ring.along, ease.out(k) * 3);
                ring.mesh.scale.setScalar(0.5 + ease.out(k) * 1.5);
                ring.mesh.material.opacity = (1 - k) * (1 - k) * 0.95;
            }

            // Lights: the beacon breathes and flashes on a ping; the rack flickers.
            const glow = clamp((MATERIALS.lit.color.r - 0.95) / 0.35, 0, 2.2);
            const flash = t >= 0 && t < 1 ? 1 - t : 0;
            beacon.set(
                color.set(PALETTE.roofMustard).lerp(BEACON_FLASH, flash).getHex(),
                0.55 + 0.25 * Math.sin(time * 3.1) + flash * 1.2,
            );
            ledMaterial.color.setScalar(0.85 + glow * 0.3);
            for (let i = 0; i < LEDS; i += 1) {
                const beat = ledBeat[i] as number;
                const on = Math.sin(time / beat + i * 1.7) > -0.2 || (flash > 0.5 && i % 2 === 0);
                leds.setColorAt(i, color.copy(ledTone[i] as THREE.Color).multiplyScalar(on ? 1.25 : 0.16));
            }
            if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
            boardMaterial.color.setScalar(0.94 + glow * 0.14);

            if (drawing) {
                drawFeed();
                if (time - feedAt > SLIDE) drawing = false;
            }
        },
    };
}
