/**
 * The venue as its manager sees it: up to four pools, one per tokenized
 * stock against USDC, and the people of the town.
 *
 * On solana-tsv's main branch every stock/USDC pair gets its own pool, with
 * its own vaults, status and trade policy; one KYC credential per wallet
 * serves them all, and each stock has its own token account per wallet. The
 * pool's checks themselves stay in `rules.ts`: `venueOf` builds the
 * single-pool view they read, so every trade here is judged by the same
 * code, in the same order, with the same codes as at the gate.
 */
import { DAY, initialLp, judge, quote, settle } from './rules.ts';
import type {
    AccountState,
    Budget,
    Credential,
    Features,
    Market,
    Pool,
    Quote,
    ReasonId,
    TradePolicy,
    TradeRequest,
    Venue,
    Verdict,
    Wallet,
    WalletId,
} from './types.ts';

export type StockId = 'TSA' | 'TSB' | 'TSC' | 'TSD';

export const STOCK_IDS: readonly StockId[] = ['TSA', 'TSB', 'TSC', 'TSD'];

export interface StockDef {
    id: StockId;
    name: string;
    /** The price the pool opens at, in USDC. */
    opening: number;
    /** The colour of its tokens and its side of the pond. */
    tone: string;
}

/** The test stocks. solana-tsv's demo apps support five, TSA to TSE; the game uses the first four. */
export const STOCKS: Record<StockId, StockDef> = {
    TSA: { id: 'TSA', name: 'Test Stock A', opening: 12.4, tone: '#f59bb0' },
    TSB: { id: 'TSB', name: 'Test Stock B', opening: 8.2, tone: '#7fcf9a' },
    TSC: { id: 'TSC', name: 'Test Stock C', opening: 21.5, tone: '#f3c45a' },
    TSD: { id: 'TSD', name: 'Test Stock D', opening: 5.6, tone: '#b49ae6' },
};

/** The credential every pool's policy names: one SAS credential and schema for every stock, as on main. */
export const CREDENTIAL_NAME = 'TSV Investor';

/**
 * The venue's holds on a stock's halt record, from the halts pull request
 * (#101): emergency or operations impose one, only operations lifts it, and
 * any of them refuses swaps and deposits with 7004 while withdrawals pass.
 */
export type HoldReason = 'emergency' | 'regulatory' | 'operational';

export const HOLD_LABEL: Record<HoldReason, string> = {
    emergency: 'Emergency',
    regulatory: 'Regulatory',
    operational: 'Operational',
};

/** One stock and its pool. */
export interface Listing {
    stock: StockId;
    /** The issuer has created the stock: a mint whose accounts start frozen. */
    created: boolean;
    pool: Pool;
    /** The wallet that created the pool: on main only it may fund it, once. */
    creator?: WalletId;
    policy?: TradePolicy;
    /** The primary market for the stock, and the on-chain record of it the poster keeps. */
    market: Market;
    /** The venue's holds on the stock's halt record. */
    holds: HoldReason[];
    /** Swaps paused by the emergency role (the planned per-pool restriction). */
    swapsPaused: boolean;
    /** The stock's daily share budget: per underlying stock, never venue-wide. */
    budget: Budget;
    /** Shares the issuer mints to these wallets when it creates the stock. */
    allocation: Partial<Record<WalletId, number>>;
}

/** One wallet's position in one stock. */
export interface Holding {
    /** Shares of the stock. */
    shares: number;
    /** LP tokens of the stock's pool. */
    lp: number;
    account: AccountState;
}

export interface Person {
    id: WalletId;
    name: string;
    role: string;
    address: string;
    /** One USDC account, shared by every pool. */
    usdc: number;
    /** Where the bureau's KYC check places them. */
    home: string;
    /** One attestation per wallet, read by every pool's policy. */
    credential?: Credential;
    revoked?: boolean;
    /** The bureau will not verify them again: their file is under review. A KYC provider's call, not the venue's. */
    barred?: boolean;
    /** The broker this owner has approved to sign for their token accounts (an SPL approval). */
    approves?: WalletId;
    holdings: Record<StockId, Holding>;
}

export interface Park {
    now: number;
    /** Which rule families are in force. A scenario switches on only what it is about. */
    features: Features;
    /** The halt poster is posting: the records follow the exchange and the evidence stays fresh. */
    poster: boolean;
    people: Record<WalletId, Person>;
    listings: Partial<Record<StockId, Listing>>;
}

/** Days in minutes, for credentials. */
export function days(count: number): number {
    return count * DAY;
}

export function credentialFor(jurisdiction: string, verifiedAt: number, expiresAt: number): Credential {
    return { name: CREDENTIAL_NAME, schemaVersion: 1, jurisdiction, verifiedAt, expiresAt };
}

/** A policy as the venue first sets it: the one credential, the United States, KYC under 30 days, no brokers. */
export function firstPolicy(): TradePolicy {
    return {
        version: 1,
        credential: CREDENTIAL_NAME,
        schemaVersion: 1,
        jurisdictions: ['US'],
        maxKycAgeDays: 30,
        delegates: [],
    };
}

const EMPTY_POOL: Pool = {
    status: 'none',
    tsa: 0,
    usdc: 0,
    lpSupply: 0,
    vaultThawed: false,
    vaultTsa: 0,
    flagged: false,
};

const NO_HOLDING: Holding = { shares: 0, lp: 0, account: 'none' };

/** A stock that does not exist yet: no mint, no pool. */
export function emptyListing(stock: StockId, allocation: Listing['allocation'] = {}): Listing {
    return {
        stock,
        created: false,
        pool: { ...EMPTY_POOL },
        holds: [],
        swapsPaused: false,
        market: { status: 'trading', price: STOCKS[stock].opening, record: 'trading', evidenceFresh: true },
        budget: { dailyShares: 12, usedShares: 0 },
        allocation,
    };
}

/** A stock whose pool is open: funded by Yuki with 100 shares at its opening price, with policy v1. */
export function openListing(stock: StockId, opts: { shares?: number; policy?: Partial<TradePolicy> } = {}): Listing {
    const shares = opts.shares ?? 100;
    const usdc = Math.round(shares * STOCKS[stock].opening * 100) / 100;
    const listing = emptyListing(stock);
    listing.created = true;
    listing.creator = 'yuki';
    listing.pool = {
        status: 'open',
        tsa: shares,
        usdc,
        lpSupply: initialLp(shares, usdc),
        vaultThawed: true,
        vaultTsa: shares,
        flagged: false,
    };
    listing.policy = { ...firstPolicy(), ...opts.policy };
    return listing;
}

/** The pool's view of the venue for one stock: what `judge` and `settle` read. */
export function venueOf(park: Park, stock: StockId): Venue {
    const listing = park.listings[stock];
    const wallets = {} as Record<WalletId, Wallet>;
    for (const person of Object.values(park.people)) {
        const holding = person.holdings[stock] ?? NO_HOLDING;
        wallets[person.id] = {
            id: person.id,
            name: person.name,
            role: person.role,
            address: person.address,
            usdc: person.usdc,
            tsa: holding.shares,
            lp: holding.lp,
            account: holding.account,
            credential: person.credential,
            revoked: person.revoked,
            approves: person.approves,
        };
    }
    if (!listing) {
        return {
            now: park.now,
            stockCreated: false,
            pool: { ...EMPTY_POOL },
            market: { status: 'trading', price: STOCKS[stock].opening, record: 'trading', evidenceFresh: true },
            swapsPaused: false,
            budget: { dailyShares: 0, usedShares: 0 },
            features: park.features,
            wallets,
        };
    }
    return {
        now: park.now,
        stockCreated: listing.created,
        // Shared with the listing: a fill moves the reserves and the budget in place.
        pool: listing.pool,
        policy: listing.policy,
        // A venue hold refuses like a halt: 7004, swaps and deposits only.
        market: { ...listing.market, record: listing.holds.length > 0 ? 'halted' : listing.market.record },
        swapsPaused: listing.swapsPaused,
        budget: listing.budget,
        features: park.features,
        wallets,
    };
}

/** What the pool for `stock` decides on a request. */
export function judgeOn(park: Park, stock: StockId, request: TradeRequest): Verdict {
    return judge(venueOf(park, stock), request);
}

/** What the request would move at the pool's current reserves. */
export function quoteOn(park: Park, stock: StockId, request: TradeRequest): Quote {
    return quote(venueOf(park, stock), request);
}

/** Settles a filled request on one pool and writes the owner's new balances back. */
export function settleOn(park: Park, stock: StockId, request: TradeRequest, fill: Quote): void {
    const venue = venueOf(park, stock);
    settle(venue, request, fill);
    const owner = venue.wallets[request.owner];
    const person = park.people[request.owner];
    person.usdc = owner.usdc;
    const holding = person.holdings[stock];
    holding.shares = owner.tsa;
    holding.lp = owner.lp;
    // The simulated exchange quotes what the pool trades at, as in the day; the price band is not modelled.
    const listing = park.listings[stock];
    if (listing && listing.market.status !== 'halted' && listing.pool.tsa > 0)
        listing.market.price = Math.round((listing.pool.usdc / listing.pool.tsa) * 100) / 100;
}

/**
 * How far a swap would move its pool's price, as a fraction (0.03 is 3%). The halts design adds a
 * price band this game does not model, so trades the player composes stay well inside one.
 */
export function priceMove(park: Park, stock: StockId, request: TradeRequest): number {
    if (request.op !== 'buy' && request.op !== 'sell') return 0;
    const pool = park.listings[stock]?.pool;
    const before = priceOf(park, stock);
    if (!pool || pool.status !== 'open' || before <= 0) return 0;
    const fill = quoteOn(park, stock, request);
    const after = (pool.usdc - fill.usdc) / (pool.tsa - fill.tsa);
    return Math.abs(after / before - 1);
}

/** The widest move a composed trade may make: inside the five percent the day's own trades keep to. */
export const MAX_MOVE = 0.05;

/**
 * What the owner lacks to make this trade, if anything. The pool's checks do not read balances (the
 * token program refuses a transfer the account cannot cover), so the game asks before a trade walks.
 */
export function lacks(park: Park, stock: StockId, request: TradeRequest): string | undefined {
    const owner = park.people[request.owner];
    const holding = owner.holdings[stock];
    const pool = park.listings[stock]?.pool;
    const fill = quoteOn(park, stock, request);
    const short = (what: string): string => `${owner.name} does not hold ${what}.`;
    switch (request.op) {
        case 'buy':
            return owner.usdc + 1e-9 < request.amount ? short(`${request.amount} USDC`) : undefined;
        case 'sell':
            return holding.shares + 1e-9 < request.amount ? short(`${request.amount} ${stock}`) : undefined;
        case 'deposit':
            return holding.shares + 1e-9 < -fill.tsa || owner.usdc + 1e-9 < -fill.usdc
                ? short(`the ${stock} and USDC this deposit takes`)
                : undefined;
        case 'withdraw':
            if (holding.lp + 1e-9 < request.amount) return short(`${request.amount} LP of the ${stock} pool`);
            return pool && request.amount >= pool.lpSupply ? `The ${stock} pool cannot pay out all of its liquidity.` : undefined;
    }
}

/** The pool's price: USDC for one share. */
export function priceOf(park: Park, stock: StockId): number {
    const pool = park.listings[stock]?.pool;
    return pool && pool.tsa > 0 ? pool.usdc / pool.tsa : 0;
}

/** The stocks with a listing, in town order. */
export function listed(park: Park): StockId[] {
    return STOCK_IDS.filter((stock) => park.listings[stock] !== undefined);
}

/** Whether a credential is present, unexpired and issued for the policy's credential. */
export function credentialValid(person: Person, now: number): boolean {
    const credential = person.credential;
    return credential !== undefined && credential.name === CREDENTIAL_NAME && credential.expiresAt > now;
}

/** Whole days since the person's KYC check, or undefined without a credential. */
export function kycAge(person: Person, now: number): number | undefined {
    return person.credential ? Math.floor((now - person.credential.verifiedAt) / DAY) : undefined;
}

// ----- The cast -----

/** The people of the town, as a scenario starts: who they are and where the bureau would place them. */
const PEOPLE: ReadonlyArray<{ id: WalletId; name: string; role: string; address: string; usdc: number; home: string }> = [
    { id: 'yuki', name: 'Yuki', role: 'Liquidity provider', address: 'Yuk1…p4Lq', usdc: 9000, home: 'US' },
    { id: 'hana', name: 'Hana', role: 'Trader', address: 'Hana…7xQ2', usdc: 2000, home: 'US' },
    { id: 'sora', name: 'Sora', role: 'Trader', address: 'Sora…m9Tz', usdc: 1500, home: 'US' },
    { id: 'ito', name: 'Mr. Ito', role: 'Retired holder', address: 'Ito8…c2Wd', usdc: 800, home: 'US' },
    { id: 'jordan', name: 'Jordan', role: 'New investor', address: 'Jord…k5Ne', usdc: 500, home: 'US' },
    { id: 'lukas', name: 'Lukas', role: 'Investor in Germany', address: 'Luka…h3Vb', usdc: 900, home: 'DE' },
    { id: 'priya', name: 'Priya', role: 'Trader', address: 'Priy…s8Ga', usdc: 700, home: 'US' },
    { id: 'kenji', name: 'Kenji', role: 'Broker', address: 'Kenj…b6Ru', usdc: 300, home: 'US' },
    { id: 'ben', name: 'Big Ben', role: 'Investor', address: 'BigB…w1Yo', usdc: 50000, home: 'US' },
];

function emptyHoldings(): Record<StockId, Holding> {
    return {
        TSA: { ...NO_HOLDING },
        TSB: { ...NO_HOLDING },
        TSC: { ...NO_HOLDING },
        TSD: { ...NO_HOLDING },
    };
}

/**
 * A town at `now` with every listed stock's pool open, and the people as
 * most scenarios find them: verified a few days ago, a thawed account and a
 * few shares in every listed stock, Yuki holding the pools' LP tokens.
 * Jordan has no credential yet, and Sora's was revoked. Scenarios change
 * what their story needs.
 */
export function baseTown(now: number, stocks: readonly StockId[], features: Partial<Features> = {}): Park {
    const people = {} as Record<WalletId, Person>;
    const verified: Partial<Record<WalletId, number>> = { yuki: 12, hana: 9, ito: 20, lukas: 6, priya: 12, kenji: 15, ben: 2 };
    for (const spec of PEOPLE) {
        const age = verified[spec.id];
        people[spec.id] = {
            ...spec,
            credential: age === undefined ? undefined : credentialFor(spec.home, now - days(age), now + days(300)),
            holdings: emptyHoldings(),
        };
    }
    people.sora.revoked = true;
    people.sora.barred = true;
    const listings: Park['listings'] = {};
    for (const stock of stocks) {
        const listing = openListing(stock);
        listings[stock] = listing;
        for (const person of Object.values(people)) {
            const holding = person.holdings[stock];
            if (person.id === 'jordan') continue;
            holding.account = 'thawed';
            holding.shares = person.id === 'yuki' ? 400 : 20;
        }
        people.yuki.holdings[stock].lp = listing.pool.lpSupply;
    }
    return {
        now,
        features: { halts: false, governance: false, reserves: false, metering: false, ...features },
        poster: true,
        people,
        listings,
    };
}

/** A deep copy, so a scenario's start can be replayed. */
export function clonePark(park: Park): Park {
    return structuredClone(park);
}

// ----- Objectives -----

/** A trade that must fill, or must be refused, for the scenario to be solved. */
export interface TradeObjective {
    kind: 'trade';
    id: string;
    /** What the player reads: who does what, on which pool. */
    label: string;
    stock: StockId;
    request: TradeRequest;
    expect: 'fill' | 'refuse';
    /** When the refusal must carry this finding. */
    reason?: ReasonId;
    /** A guard rail: it holds at the start, and the player must not break it. */
    keep?: boolean;
}

/** A fact about the venue that must hold. */
export interface StateObjective {
    kind: 'state';
    id: string;
    label: string;
    test(park: Park): boolean;
    keep?: boolean;
}

export type Objective = TradeObjective | StateObjective;

export interface ObjectiveStatus {
    met: boolean;
    /** The pool's decision, for a trade objective. */
    verdict?: Verdict;
}

export function objectiveStatus(park: Park, objective: Objective): ObjectiveStatus {
    if (objective.kind === 'state') return { met: objective.test(park) };
    const verdict = judgeOn(park, objective.stock, objective.request);
    const met =
        verdict.outcome === objective.expect &&
        (objective.reason === undefined || verdict.reason === objective.reason);
    return { met, verdict };
}

export function allMet(park: Park, objectives: readonly Objective[]): boolean {
    return objectives.every((objective) => objectiveStatus(park, objective).met);
}

/** The guard rails a move broke: kept objectives that held before and no longer do. */
export function brokenGuards(park: Park, objectives: readonly Objective[]): Objective[] {
    return objectives.filter((objective) => objective.keep && !objectiveStatus(park, objective).met);
}
