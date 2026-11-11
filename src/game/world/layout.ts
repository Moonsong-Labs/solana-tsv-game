/**
 * Where everything stands on the island. The island is a square of side
 * `ISLAND` centred on the origin; the camera looks from the +X +Z corner, so
 * a model's +X and +Z faces are the ones the viewer sees.
 *
 * One list for the models, the walking routes and the camera, so they agree.
 */
import type { V3 } from '../scene/kit.ts';

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
