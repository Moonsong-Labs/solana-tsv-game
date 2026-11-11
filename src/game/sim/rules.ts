/**
 * The pool's checks, as the venue runs them: in a fixed order, and the first
 * one that fails refuses the whole trade with its code and writes nothing.
 *
 * Sources, in the solana-tsv repository: `docs/increment-2.md`,
 * `programs/cpmm-pool/src/trade_policy.rs` and `crates/tsv-eligibility` for
 * what is on its main branch (eligibility: 7000 and 7001; a withdrawal drops
 * only the expiry and KYC-age tests); the knowledge base's check order
 * (decision 0006), controlled exits (decision 0007) and solana-tsv's open
 * halts pull request (#101) for the rest. Each check carries where it stands
 * today, so the game never passes a design off as shipped code.
 *
 * Not modelled: the price band of the halts design (7011). The simulated
 * exchange price follows the pool, so no trade in the script would leave it.
 */
import type {
    Availability,
    CheckId,
    CheckResult,
    CheckStatus,
    Credential,
    LampState,
    Operation,
    Quote,
    ReasonId,
    TradePolicy,
    TradeRequest,
    Venue,
    Verdict,
    Wallet,
} from './types.ts';

/** The five steps of the check order (step 0, authority, covers admin instructions only and never runs on a trade). */
export const STEPS = [
    {
        step: 1,
        title: 'Restrictions',
        blurb: 'Is trading open at all? Checked first, so a halted pool says "halted" to everyone.',
    },
    { step: 2, title: 'Balance', blurb: 'Do the vaults hold what the books say?' },
    { step: 3, title: 'Eligibility', blurb: 'May these wallets trade here?' },
    { step: 4, title: 'Pricing', blurb: "The price comes from the pool's reserves." },
    { step: 5, title: 'Settlement', blurb: 'Does the fill fit the daily budget?' },
] as const;

export interface CheckDef {
    id: CheckId;
    step: 1 | 2 | 3 | 5;
    /** The rule as the rulebook prints it. */
    rule: string;
    /** Short name for lamps and chips. */
    short: string;
    availability: Availability;
    /** Where the rule stands, in a few words, with its source. */
    status: string;
    /** The feature flag that switches the rule on; live rules have none. */
    feature?: keyof Venue['features'];
    /** How the check treats a withdrawal, when it differs. */
    exit?: string;
}

/** The checks, in the order the pool runs them. */
export const CHECKS: readonly CheckDef[] = [
    {
        id: 'pool-open',
        step: 1,
        short: 'Pool open',
        rule: 'The pool is funded and open.',
        availability: 'live',
        status: 'Live on main',
    },
    {
        id: 'venue-pause',
        step: 1,
        short: 'No pause',
        rule: 'The venue has not paused this kind of trade.',
        availability: 'planned',
        status: 'Planned · role multisigs',
        feature: 'governance',
        exit: 'Withdrawals stay open.',
    },
    {
        id: 'halt',
        step: 1,
        short: 'Not halted',
        rule: 'The symbol is not halted on its primary market.',
        availability: 'review',
        status: 'In review · PR #101',
        feature: 'halts',
        exit: 'Withdrawals never read halts.',
    },
    {
        id: 'inputs-fresh',
        step: 1,
        short: 'Inputs fresh',
        rule: 'The halt evidence is fresh. Unknown counts as halted.',
        availability: 'review',
        status: 'In review · PR #101',
        feature: 'halts',
        exit: 'Withdrawals never read halts.',
    },
    {
        id: 'in-balance',
        step: 2,
        short: 'In balance',
        rule: 'The vaults hold at least the recorded reserves.',
        availability: 'planned',
        status: 'Planned · honest reserves',
        feature: 'reserves',
        exit: 'Withdrawals are refused too.',
    },
    {
        id: 'account-thawed',
        step: 3,
        short: 'Account thawed',
        rule: "The stock account is thawed. The stock's accounts start frozen.",
        availability: 'live',
        status: 'Live on main',
    },
    {
        id: 'authority',
        step: 3,
        short: 'Signer allowed',
        rule: 'The signer owns the accounts, or is a broker the owner approved and the policy lists.',
        availability: 'live',
        status: 'Live on main',
    },
    {
        id: 'credential',
        step: 3,
        short: 'Credential valid',
        rule: 'Each wallet holds a valid credential: present, not expired, KYC recent enough.',
        availability: 'live',
        status: 'Live on main',
        exit: 'On a withdrawal, expiry and KYC age are not checked: an expired credential may still exit. A revoked one is held.',
    },
    {
        id: 'jurisdiction',
        step: 3,
        short: 'Jurisdiction',
        rule: "The credential's jurisdiction is on the policy's list.",
        availability: 'live',
        status: 'Live on main',
    },
    {
        id: 'budget',
        step: 5,
        short: 'Within budget',
        rule: "The fill stays within the stock's daily share budget.",
        availability: 'planned',
        status: 'Planned · volume limits',
        feature: 'metering',
    },
];

export interface ReasonDef {
    id: ReasonId;
    check: CheckId;
    /** The finding, as the gatekeeper cites it. */
    title: string;
    /** The venue's refusal code. Missing where no code is assigned. */
    code?: number;
    codeName?: string;
    /** Shown instead of a code when there is none. */
    codeNote?: string;
    /** One plain sentence on what it means. */
    meaning: string;
}

const ELIGIBLE = { code: 7000, codeName: 'ACCOUNT_NOT_ELIGIBLE' } as const;
const CREDENTIAL = { code: 7001, codeName: 'CREDENTIAL_INVALID' } as const;

/** Every finding the gatekeeper can cite, in check order. Codes are the venue's frozen refusal codes (`crates/tsv-errors` in solana-tsv). */
export const REASONS: readonly ReasonDef[] = [
    {
        id: 'pool-not-open',
        check: 'pool-open',
        title: 'The pool is not open',
        codeNote: 'pool error 6000',
        meaning: "The pool isn't funded or open yet.",
    },
    {
        id: 'venue-paused',
        check: 'venue-pause',
        title: 'The venue paused swaps',
        codeNote: 'code not settled',
        meaning: 'The emergency role paused this kind of trade.',
    },
    {
        id: 'symbol-halted',
        check: 'halt',
        title: 'The symbol is halted',
        code: 7004,
        codeName: 'SYMBOL_HALTED',
        meaning: 'Trading in the symbol is halted.',
    },
    {
        id: 'inputs-stale',
        check: 'inputs-fresh',
        title: 'The halt evidence is stale',
        code: 7007,
        codeName: 'INPUTS_STALE',
        meaning: 'A required input is missing or out of date, so the venue fails closed.',
    },
    {
        id: 'out-of-balance',
        check: 'in-balance',
        title: 'The pool is out of balance',
        code: 7009,
        codeName: 'POOL_OUT_OF_BALANCE',
        meaning: "The vaults don't cover the recorded reserves and fees owed.",
    },
    {
        id: 'account-frozen',
        check: 'account-thawed',
        title: 'The stock account is frozen',
        ...ELIGIBLE,
        meaning: "A wallet or delegate in the trade doesn't meet the trade policy.",
    },
    {
        id: 'delegate-not-listed',
        check: 'authority',
        title: "The broker is not on the policy's list",
        ...ELIGIBLE,
        meaning: "A wallet or delegate in the trade doesn't meet the trade policy.",
    },
    {
        id: 'delegate-not-approved',
        check: 'authority',
        title: 'The owner never approved this signer',
        ...ELIGIBLE,
        meaning: "A wallet or delegate in the trade doesn't meet the trade policy.",
    },
    {
        id: 'credential-missing',
        check: 'credential',
        title: 'No credential (missing or revoked)',
        ...CREDENTIAL,
        meaning: 'A credential is missing, expired, revoked, in the wrong format or for another wallet.',
    },
    {
        id: 'credential-expired',
        check: 'credential',
        title: 'The credential has expired',
        ...CREDENTIAL,
        meaning: 'A credential is missing, expired, revoked, in the wrong format or for another wallet.',
    },
    {
        id: 'kyc-too-old',
        check: 'credential',
        title: 'The KYC check is too old',
        ...CREDENTIAL,
        meaning: 'A credential is missing, expired, revoked, in the wrong format or for another wallet.',
    },
    {
        id: 'jurisdiction',
        check: 'jurisdiction',
        title: 'The jurisdiction is not accepted',
        ...ELIGIBLE,
        meaning: "A wallet or delegate in the trade doesn't meet the trade policy.",
    },
    {
        id: 'budget-exceeded',
        check: 'budget',
        title: 'The fill would cross the daily budget',
        code: 7008,
        codeName: 'VOLUME_BUDGET_EXCEEDED',
        meaning: "The trade would cross the stock's daily share budget.",
    },
];

export function checkDef(id: CheckId): CheckDef {
    const found = CHECKS.find((check) => check.id === id);
    if (!found) throw new Error(`unknown check ${id}`);
    return found;
}

export function reasonDef(id: ReasonId): ReasonDef {
    const found = REASONS.find((reason) => reason.id === id);
    if (!found) throw new Error(`unknown reason ${id}`);
    return found;
}

/** The trade fee on main: `tradeFeeRate 10`, that is 0.001% of what goes in. */
export const TRADE_FEE = 0.00001;

export const DAY = 1440;

/** Whether a check is in force at this point of the day. */
export function inForce(venue: Venue, id: CheckId): boolean {
    const feature = checkDef(id).feature;
    return feature === undefined || venue.features[feature];
}

/** The findings the gatekeeper may cite right now: those whose check is in force. */
export function citableReasons(venue: Venue): ReasonDef[] {
    return REASONS.filter((reason) => reason.id !== 'pool-not-open' && inForce(venue, reason.check));
}

/** The LP supply a pool starts with: the square root of the two amounts in base units (9, 6 and 9 decimals). */
export function initialLp(tsa: number, usdc: number): number {
    return Math.sqrt(tsa * 1e9 * usdc * 1e6) / 1e9;
}

/** What the request would move, at the pool's current reserves. */
export function quote(venue: Venue, request: TradeRequest): Quote {
    const { tsa, usdc, lpSupply } = venue.pool;
    if (venue.pool.status !== 'open' || tsa <= 0 || usdc <= 0) return { usdc: 0, tsa: 0, lp: 0, shares: 0 };
    const k = tsa * usdc;
    switch (request.op) {
        case 'buy': {
            const paid = request.amount;
            const out = tsa - k / (usdc + paid * (1 - TRADE_FEE));
            return { usdc: -paid, tsa: out, lp: 0, shares: out };
        }
        case 'sell': {
            const sold = request.amount;
            const out = usdc - k / (tsa + sold * (1 - TRADE_FEE));
            return { usdc: out, tsa: -sold, lp: 0, shares: sold };
        }
        case 'deposit': {
            const share = request.amount / lpSupply;
            return { usdc: -usdc * share, tsa: -tsa * share, lp: request.amount, shares: 0 };
        }
        case 'withdraw': {
            const share = request.amount / lpSupply;
            return { usdc: usdc * share, tsa: tsa * share, lp: -request.amount, shares: 0 };
        }
    }
}

/** Days since the KYC check behind a credential, rounded down. */
export function kycAgeDays(credential: Credential, now: number): number {
    return Math.floor((now - credential.verifiedAt) / DAY);
}

export function isExpired(credential: Credential, now: number): boolean {
    return credential.expiresAt <= now;
}

/** What is wrong with a wallet's credential for this policy, if anything. On an exit, expiry and KYC age are not checked. */
export function credentialFinding(
    wallet: Wallet,
    policy: TradePolicy,
    now: number,
    exit: boolean,
): ReasonId | undefined {
    const credential = wallet.credential;
    if (!credential || credential.name !== policy.credential || credential.schemaVersion !== policy.schemaVersion)
        return 'credential-missing';
    if (exit) return undefined;
    if (isExpired(credential, now)) return 'credential-expired';
    // The gate refuses from the limit itself: a check exactly that old is already too old.
    if (now - credential.verifiedAt >= policy.maxKycAgeDays * DAY) return 'kyc-too-old';
    return undefined;
}

type Finding = { status: CheckStatus; reason?: ReasonId };

const PASS: Finding = { status: 'pass' };
const OPEN: Finding = { status: 'open' };
const NA: Finding = { status: 'na' };

function fail(reason: ReasonId): Finding {
    return { status: 'fail', reason };
}

/** Runs one check on a request. */
function runCheck(id: CheckId, venue: Venue, request: TradeRequest, fill: Quote): Finding {
    const op: Operation = request.op;
    const exit = op === 'withdraw';
    const swap = op === 'buy' || op === 'sell';
    const owner = venue.wallets[request.owner];
    const signer = venue.wallets[request.signer];
    const delegated = request.signer !== request.owner;
    const policy = venue.policy;
    switch (id) {
        case 'pool-open':
            return venue.pool.status === 'open' ? PASS : fail('pool-not-open');
        case 'venue-pause':
            if (!swap) return exit ? OPEN : NA;
            return venue.swapsPaused ? fail('venue-paused') : PASS;
        case 'halt':
            if (exit) return OPEN;
            return venue.market.record === 'halted' ? fail('symbol-halted') : PASS;
        case 'inputs-fresh':
            if (exit) return OPEN;
            return venue.market.evidenceFresh ? PASS : fail('inputs-stale');
        case 'in-balance':
            return venue.pool.flagged || venue.pool.vaultTsa < venue.pool.tsa - 1e-9 ? fail('out-of-balance') : PASS;
        case 'account-thawed':
            // Checked on withdrawals too: a frozen account cannot receive the stock leg.
            return owner.account === 'thawed' ? PASS : fail('account-frozen');
        case 'authority':
            if (!delegated) return NA;
            if (!policy || !policy.delegates.includes(request.signer)) return fail('delegate-not-listed');
            return owner.approves === request.signer ? PASS : fail('delegate-not-approved');
        case 'credential': {
            if (!policy) return fail('credential-missing');
            const wallets = delegated ? [owner, signer] : [owner];
            for (const wallet of wallets) {
                const finding = credentialFinding(wallet, policy, venue.now, exit);
                if (finding) return fail(finding);
            }
            return PASS;
        }
        case 'jurisdiction': {
            // An exit drops only expiry and KYC age; the claims are still checked.
            if (!policy) return fail('jurisdiction');
            const wallets = delegated ? [owner, signer] : [owner];
            const accepted = wallets.every(
                (wallet) =>
                    wallet.credential !== undefined && policy.jurisdictions.includes(wallet.credential.jurisdiction),
            );
            return accepted ? PASS : fail('jurisdiction');
        }
        case 'budget':
            if (!swap) return NA;
            return venue.budget.usedShares + fill.shares > venue.budget.dailyShares + 1e-9
                ? fail('budget-exceeded')
                : PASS;
    }
}

/** The pool's decision: every check in order; the first failure refuses. */
export function judge(venue: Venue, request: TradeRequest): Verdict {
    const fill = quote(venue, request);
    const trace: CheckResult[] = [];
    let failed: { id: CheckId; reason: ReasonId } | undefined;
    for (const check of CHECKS) {
        if (!inForce(venue, check.id)) {
            trace.push({ id: check.id, status: 'off' });
            continue;
        }
        if (failed) {
            trace.push({ id: check.id, status: 'skip' });
            continue;
        }
        const finding = runCheck(check.id, venue, request, fill);
        trace.push({ id: check.id, status: finding.status });
        if (finding.status === 'fail' && finding.reason) failed = { id: check.id, reason: finding.reason };
    }
    if (failed) {
        const reason = reasonDef(failed.reason);
        return {
            outcome: 'refuse',
            failed: failed.id,
            reason: failed.reason,
            code: reason.code,
            codeName: reason.codeName,
            trace,
            quote: fill,
        };
    }
    return { outcome: 'fill', trace, quote: fill };
}

/** Settles a filled request: moves the balances and the reserves. A refusal writes nothing, so it has no counterpart here. */
export function settle(venue: Venue, request: TradeRequest, fill: Quote): void {
    const owner = venue.wallets[request.owner];
    owner.usdc += fill.usdc;
    owner.tsa += fill.tsa;
    owner.lp += fill.lp;
    venue.pool.usdc -= fill.usdc;
    venue.pool.tsa -= fill.tsa;
    venue.pool.vaultTsa -= fill.tsa;
    venue.pool.lpSupply += fill.lp;
    venue.budget.usedShares += fill.shares;
}

/** The pool's price: USDC for one TSA. */
export function price(venue: Venue): number {
    return venue.pool.tsa > 0 ? venue.pool.usdc / venue.pool.tsa : 0;
}

/**
 * What the lantern of a step (1 to 5) shows once the pool has decided: it
 * sums up the step's checks. A step whose rules are not in force, or do not
 * apply to this kind of trade, stays dark, so the game never lights a check
 * that did not run.
 */
export function stepLamp(verdict: Verdict, step: number): LampState {
    const failedStep = verdict.failed ? checkDef(verdict.failed).step : undefined;
    if (failedStep !== undefined && step > failedStep) return 'skip';
    // Pricing has no refusal of its own: it happens whenever the steps before it pass.
    if (step === 4) return 'pass';
    const items = verdict.trace.filter((item) => checkDef(item.id).step === step);
    if (items.some((item) => item.status === 'fail')) return 'fail';
    if (items.every((item) => item.status === 'off')) return 'off';
    // A step with a rule that never stops an exit says so on a withdrawal: that is the point of the
    // lantern, more than the checks beside it that passed.
    if (items.some((item) => item.status === 'open')) return 'open';
    if (items.some((item) => item.status === 'pass')) return 'pass';
    // Its rules are in force but none applies to this kind of trade (the budget on a withdrawal, say).
    return 'na';
}

/**
 * Half the width of the exchange's price band at a time of day, as a
 * fraction of the reference price: 5% for a Tier 1 stock above 3 USD,
 * doubled in the first fifteen and the last twenty-five minutes of regular
 * trading. Display only: the pool in this game does not check the band.
 */
export function bandWidth(now: number): number {
    const minute = ((Math.floor(now) % DAY) + DAY) % DAY;
    const opening = minute >= 9 * 60 + 30 && minute < 9 * 60 + 45;
    const closing = minute >= 15 * 60 + 35 && minute < 16 * 60;
    return opening || closing ? 0.1 : 0.05;
}

/** What a settled request is called: only a swap is a fill. */
export function settledWord(op: Operation): string {
    return op === 'deposit' ? 'Deposited' : op === 'withdraw' ? 'Withdrawn' : 'Filled';
}
