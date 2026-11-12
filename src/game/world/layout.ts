/**
 * Where everything stands on the island. The island is a square of side
 * `ISLAND` centred on the origin; the camera looks from the +X +Z corner, so
 * a model's +X and +Z faces are the ones the viewer sees.
 *
 * One list for the models, the walking routes and the camera, so they agree.
 */
import type { V3 } from '../scene/kit.ts';
import type { StockId } from '../sim/park.ts';

export const ISLAND = 24;
export const HALF = ISLAND / 2;

/** Ground positions [x, z] of each place's footprint centre. */
export const SITES = {
    /** The issuer's mint house: creates the stock and thaws the pool's vault. */
    issuer: [-8.4, -7.6],
    /** The credential bureau: the KYC provider that writes credentials. */
    bureau: [-10, 9],
    /** The gatekeeper's booth, beside the entry road. */
    booth: [-7.4, 1.9],
    /** The gate across the entry road: the pool program's checks. */
    gate: [-1.9, 4],
    /** The pool: the pond and its two vaults. */
    pool: [2.2, 2.4],
    /** The council hall: the venue's four role multisigs. */
    council: [-1.6, -8.8],
    /** The exchange: the primary market. */
    exchange: [7.2, -8.2],
    /** The halt board: the on-chain record of the symbol's trading state. */
    haltBoard: [5.2, -0.5],
    /** The archive: every decision with the state it read. */
    archive: [8.2, -3.2],
    /** The indexer's hut and the public feed billboard. */
    indexer: [8.2, 9.6],
    /** The chain's loading dock, where transactions board the open block. */
    dock: [10.6, 2.6],
} as const satisfies Record<string, readonly [number, number]>;

export type SiteId = keyof typeof SITES;

/** The rail the blocks ride, along the front-right edge. */
export const RAIL = { x: 10.6, zStart: -13.5, zEnd: 13.5 } as const;

/** The entry road runs along X at this Z, from the back-left edge to the gate. */
export const ENTRY_Z = 4;
/** The exit road runs along Z at this X, from the pool plaza to the front-left edge. */
export const EXIT_X = 2.2;

/** Named spots characters walk between, on the ground. */
export const SPOTS = {
    /** Off the island, where visitors appear. */
    spawn: [-13.4, 0, ENTRY_Z],
    /** Where the visitor being inspected stands: at the left end of the booth's counter, beside the gatekeeper on screen. */
    window: [-8.75, 0, ENTRY_Z - 0.4],
    /** Before the barrier, where the checks run: left of the gate as the camera sees it, not behind its lanterns. */
    barrier: [-4.3, 0, ENTRY_Z + 0.3],
    /** Just through the gate. */
    pastGate: [-0.9, 0, ENTRY_Z],
    /** At the pond's rim, where a trade settles. */
    poolRim: [-0.05, 0, 3.7],
    /** Where an exit starts. */
    exitStart: [EXIT_X, 0, 6.2],
    /** Off the island, where visitors who traded leave. */
    exitEnd: [EXIT_X, 0, 13.6],
    /** In front of the credential bureau's door. */
    bureauDoor: [-7.4, 0, 10],
    /** Where the path to the bureau leaves the entry road. */
    bureauTurn: [-6.4, 0, ENTRY_Z + 0.5],
    bureauPath: [-6.4, 0, 10],
    /** In front of the issuer's door. */
    issuerDoor: [-8.4, 0, -5.2],
    /** Where the liquidity provider stands to fund the pool. */
    lpSpot: [3.6, 0, 5.1],
    /** In front of the council hall's steps. */
    councilSteps: [-1.6, 0, -5.4],
} as const satisfies Record<string, V3>;

export type SpotId = keyof typeof SPOTS;

/** Where the people waiting stand: slot 0 is next to be seen. */
export function queueSpot(slot: number): V3 {
    return [-10.2 - slot * 1.15, 0, ENTRY_Z + (slot % 2 === 0 ? 0.12 : -0.12)];
}

/** Camera views: the point to look at and how many world units fit on screen top to bottom. */
export const VIEWS = {
    town: { target: [0.2, 0.6, 0.4], span: 31 },
    gate: { target: [-5.6, 0.9, 3.4], span: 12 },
    pool: { target: [1.8, 1, 1.6], span: 14 },
    bureau: { target: [-8.6, 1.2, 9], span: 12 },
    issuer: { target: [-7.6, 2.4, -6.2], span: 15 },
    council: { target: [-1.6, 2.4, -7.2], span: 15.5 },
    exchange: { target: [6.2, 3.4, -5.4], span: 19 },
    /** The exchange tower and the halt board together, for the halt scenes. */
    halt: { target: [6.5, 3.5, -4.2], span: 16.5 },
    /** The tower's clock face. */
    clock: { target: [7.6, 4, -7.6], span: 9.5 },
    /** The halt board and its hourglass. */
    board: { target: [5.4, 1.5, -0.8], span: 8.5 },
    chain: { target: [8.2, 2.6, 3], span: 15.5 },
    venue: { target: [-2.6, 0.7, 3.2], span: 16 },
    /** Close on the gate's five lanterns while the checks run. */
    lanterns: { target: [-2.4, 2, 4], span: 9.5 },
    /** The gate and the pond, to follow a filled trade to the pool. */
    settle: { target: [-0.6, 1, 3.4], span: 12.5 },
} as const satisfies Record<string, { target: V3; span: number }>;

export type ViewId = keyof typeof VIEWS;

// ----- The market quarter: manager mode's second island -----

/**
 * The market quarter, a second floating island off the main island's front
 * edge, holding the pools of the other three stocks. The main island is
 * full, so the quarter hangs beyond the exit road, which crosses to it over
 * a bridge. It sits in front of the town as the camera sees it, so only low
 * things stand near its back edge.
 */
export const ANNEX = { x0: -25.2, x1: 4.8, z0: 14, z1: 23.5 } as const satisfies {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
};

/** The bridge from the exit road's end to the quarter: flat, level with the paving, as wide as the road. */
export const BRIDGE = { x0: EXIT_X - 0.95, x1: EXIT_X + 0.95, z0: HALF - 0.3, z1: ANNEX.z0 + 0.3 } as const;

/** The quarter's front path runs along X at this Z, past every pool's jetty. */
export const FRONT_Z = 22.4;

/** The stocks whose pools stand in the market quarter, from the bridge outwards. */
export const QUARTER_STOCKS = ['TSB', 'TSC', 'TSD'] as const satisfies readonly StockId[];

/** Ground positions [x, z] of each stock's pond. TSA's is the main island's pool. */
export const POOL_SITES: Record<StockId, readonly [number, number]> = {
    TSA: SITES.pool,
    TSB: [-2, 18.5],
    TSC: [-10.5, 18.5],
    TSD: [-19, 18.5],
};

/** Where a pool's jetty stands, from its pond's centre: the same corner for every pool. */
const JETTY: readonly [number, number] = [-2.25, 1.3];

/** Where a trader stands to settle at a stock's pool: its jetty. */
export function poolRim(stock: StockId): V3 {
    if (stock === 'TSA') return SPOTS.poolRim;
    const [x, z] = POOL_SITES[stock];
    return [x + JETTY[0], 0, z + JETTY[1]];
}

/** Off the quarter's front edge, where the quarter's road leaves it. */
const QUARTER_EXIT: V3 = [EXIT_X, 0, ANNEX.z1 + 1.6];

/**
 * The walk from just past the gate (`SPOTS.pastGate`) to a pool's jetty.
 * To the quarter: across the plaza to the exit road, down it and over the
 * bridge to the front path, along it, and up the pool's own spur.
 */
export function routeToPool(stock: StockId): V3[] {
    if (stock === 'TSA') return [SPOTS.poolRim];
    const [x, , z] = poolRim(stock);
    return [SPOTS.exitStart, [EXIT_X, 0, FRONT_Z], [x, 0, FRONT_Z], [x, 0, z]];
}

/**
 * The walk from a pool's jetty to off the islands, where the walker is
 * removed. With the quarter in place the exit road leads onto the bridge, so
 * every pool's traders leave by the quarter's road, off its front edge.
 */
export function routeFromPool(stock: StockId): V3[] {
    if (stock === 'TSA') return [SPOTS.exitStart, QUARTER_EXIT];
    const [x] = poolRim(stock);
    return [[x, 0, FRONT_Z], [EXIT_X, 0, FRONT_Z], QUARTER_EXIT];
}

/** A camera view framing one stock's pool, as `VIEWS.pool` frames TSA's. */
export function poolView(stock: StockId): { target: V3; span: number } {
    if (stock === 'TSA') return VIEWS.pool;
    const [x, z] = POOL_SITES[stock];
    const [px, pz] = SITES.pool;
    const [tx, ty, tz] = VIEWS.pool.target;
    return { target: [x + tx - px, ty, z + tz - pz], span: VIEWS.pool.span };
}

/**
 * What a view of the whole park must hold: both islands' corners on the
 * ground, raised to the height of the trees and roofs near the edges, and
 * lowered to the foot of the slabs.
 */
export const PARK_POINTS: readonly V3[] = (
    [
        [-HALF, -HALF],
        [HALF, -HALF],
        [HALF, HALF],
        [-HALF, HALF],
        [ANNEX.x0, ANNEX.z0],
        [ANNEX.x1, ANNEX.z0],
        [ANNEX.x1, ANNEX.z1],
        [ANNEX.x0, ANNEX.z1],
    ] as const
).flatMap(([x, z]): V3[] => [
    [x, 3.5, z],
    [x, -3.2, z],
]);

/**
 * The sun's shadow frame for both islands: the point it aims at and the
 * half-size of its square. Worked out over every sun direction of the day,
 * so the corners and the treetops always fall inside it.
 */
export const MANAGER_SHADOW: { target: V3; reach: number } = { target: [-6.4, 0, 5.6], reach: 26.5 };
