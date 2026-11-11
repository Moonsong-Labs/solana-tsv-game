/**
 * The simulated venue's data model. Pure data and pure functions only: the
 * rules engine and its tests run under `node --test` with no browser.
 *
 * Time is in minutes from midnight of the venue day (so 570 is 9:30 a.m. and
 * −1440 is midnight the day before).
 */

export type WalletId = 'yuki' | 'hana' | 'sora' | 'ito' | 'jordan' | 'lukas' | 'priya' | 'kenji' | 'ben';

/** A KYC credential: a Solana Attestation Service attestation for one wallet. */
export interface Credential {
    /** The credential's name, as the trade policy names it. */
    name: string;
    schemaVersion: number;
    jurisdiction: string;
    /** When the KYC check behind it was done. */
    verifiedAt: number;
    expiresAt: number;
}

/** The state of a wallet's stock token account. A wallet that never held the stock has none yet. */
export type AccountState = 'none' | 'frozen' | 'thawed';

export interface Wallet {
    id: WalletId;
    /** First name, as the game shows it. */
    name: string;
    /** What the person is, in a few words. */
    role: string;
    /** A short made-up address, for the papers. */
    address: string;
    usdc: number;
    tsa: number;
    lp: number;
    account: AccountState;
    /** Missing when the wallet has no credential, or when it was revoked (revoking closes the attestation). */
    credential?: Credential;
    /** True once a credential was revoked, to tell "revoked" from "never had one" on the papers. */
    revoked?: boolean;
    /** The wallet this owner has approved to sign for its token accounts (an SPL delegate approval). */
    approves?: WalletId;
}

/** The venue's trade policy: who may trade in this pool. Versioned; each change bumps the version by one. */
export interface TradePolicy {
    version: number;
    credential: string;
    schemaVersion: number;
    jurisdictions: string[];
    maxKycAgeDays: number;
    /** Brokers allowed to sign for an owner who approved them. */
    delegates: WalletId[];
}

export type PoolStatus = 'none' | 'created' | 'open';

export interface Pool {
    status: PoolStatus;
    /** Recorded reserves: what the pool prices from. */
    tsa: number;
    usdc: number;
    lpSupply: number;
    /** The issuer must thaw the pool's stock vault before anyone can fund it. */
    vaultThawed: boolean;
    /** What the stock vault really holds. Below the recorded reserve, the pool is out of balance. */
    vaultTsa: number;
    /** Set when a shortfall was recorded; operations lifts it after the vault is whole again. */
    flagged: boolean;
}

export type MarketStatus = 'trading' | 'limit' | 'halted';

/** The primary market and the on-chain record of its state. */
export interface Market {
    status: MarketStatus;
    /** The halt's reason code on the consolidated tape, for example LUDP. */
    haltCode?: string;
    price: number;
    /** What the on-chain symbol record says. */
    record: 'trading' | 'halted';
    /** False once the halt poster's evidence is older than the venue accepts: the state is then unknown. */
    evidenceFresh: boolean;
}

export interface Budget {
    /** The stock's daily share budget on this venue. */
    dailyShares: number;
    usedShares: number;
}

/** Rules that are not on the main branch yet switch on as the day goes, so the first chapters mirror main exactly. */
export interface Features {
    halts: boolean;
    governance: boolean;
    reserves: boolean;
    metering: boolean;
}

export interface Venue {
    now: number;
    stockCreated: boolean;
    pool: Pool;
    policy?: TradePolicy;
    market: Market;
    /** Swaps paused by the emergency role. */
    swapsPaused: boolean;
    budget: Budget;
    features: Features;
    wallets: Record<WalletId, Wallet>;
}

export type Operation = 'buy' | 'sell' | 'deposit' | 'withdraw';

/** What a visitor asks the pool to do. */
export interface TradeRequest {
    op: Operation;
    /** Who signs the transaction. */
    signer: WalletId;
    /** Whose token accounts the trade moves. Differs from the signer when a broker trades for a client. */
    owner: WalletId;
    /** USDC to spend for a buy, TSA to sell for a sell, LP for a deposit or a withdrawal. */
    amount: number;
}

/** The pool's checks, in the order it runs them. */
export type CheckId =
    | 'pool-open'
    | 'venue-pause'
    | 'halt'
    | 'inputs-fresh'
    | 'in-balance'
    | 'account-thawed'
    | 'authority'
    | 'credential'
    | 'jurisdiction'
    | 'budget';

/** Why a trade is refused: the finding the gatekeeper cites. */
export type ReasonId =
    | 'pool-not-open'
    | 'venue-paused'
    | 'symbol-halted'
    | 'inputs-stale'
    | 'out-of-balance'
    | 'account-frozen'
    | 'delegate-not-listed'
    | 'delegate-not-approved'
    | 'credential-missing'
    | 'credential-expired'
    | 'kyc-too-old'
    | 'jurisdiction'
    | 'budget-exceeded';

/** Whether a rule is on solana-tsv's main branch today, in one of its open pull requests, or planned. */
export type Availability = 'live' | 'review' | 'planned';

export type CheckStatus =
    /** Ran and passed. */
    | 'pass'
    /** Ran and failed: the trade is refused here. */
    | 'fail'
    /** Deliberately not checked for this operation, so holders can always exit. */
    | 'open'
    /** Not reached: an earlier check refused. */
    | 'skip'
    /** Not in force yet at this point of the day. */
    | 'off'
    /** Does not apply to this request (no broker involved, say). */
    | 'na';

export interface CheckResult {
    id: CheckId;
    status: CheckStatus;
}

/** What a swap or liquidity move would do to the balances. */
export interface Quote {
    /** Positive when the owner receives, negative when the owner pays. */
    usdc: number;
    tsa: number;
    lp: number;
    /** Shares that count against the daily budget (swaps only). */
    shares: number;
}

/** The pool's decision on a request. */
export interface Verdict {
    outcome: 'fill' | 'refuse';
    /** The first check that failed. */
    failed?: CheckId;
    reason?: ReasonId;
    /** The refusal code, when the venue has one for this check. */
    code?: number;
    codeName?: string;
    trace: CheckResult[];
    quote: Quote;
}

/** What one lantern of the gate shows for a step of the check order. */
export type LampState =
    /** Waiting. */
    | 'idle'
    /** Being checked right now. */
    | 'run'
    | 'pass'
    | 'fail'
    /** Deliberately not checked, so holders can exit. */
    | 'open'
    /** Not reached: an earlier step refused. */
    | 'skip'
    /** No rule of this step is in force yet. */
    | 'off'
    /** The step's rules are in force, but none applies to this kind of trade. */
    | 'na';
