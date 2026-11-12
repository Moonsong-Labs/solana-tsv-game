/**
 * What the venue's manager can set in motion, building by building. The
 * manager rarely acts alone: a credential is the bureau's to issue, a thaw
 * the holder's or the issuer's, a pause the council's. Each action says who
 * really does it, where it stands in solana-tsv (live on main, in review,
 * planned, or simulated for the game), what stops it, and what it changes.
 *
 * Actions change the venue's state only; the pool's own checks in
 * `rules.ts` then decide every trade as they always do.
 */
import { DAY, credentialFinding, initialLp } from './rules.ts';
import {
    HOLD_LABEL,
    STOCKS,
    credentialFor,
    credentialValid,
    days,
    firstPolicy,
    type HoldReason,
    venueOf,
    type Park,
    type StockId,
} from './park.ts';
import type { Availability, Features, TradePolicy, WalletId } from './types.ts';

/** The buildings that offer actions. Pools are one site; the stock says which. */
export type Site = 'bureau' | 'issuer' | 'pool' | 'gate' | 'council' | 'haltBoard' | 'exchange';

export type ActionId =
    | 'verify'
    | 'revoke'
    | 'holder-thaw'
    | 'issuer-thaw'
    | 'create-stock'
    | 'thaw-vault'
    | 'recover'
    | 'return-stock'
    | 'create-pool'
    | 'fund-pool'
    | 'reconcile'
    | 'set-policy'
    | 'approve'
    | 'pause-swaps'
    | 'lift-pause'
    | 'hold'
    | 'lift-hold'
    | 'lift-flag'
    | 'restart-poster'
    | 'sim-halt'
    | 'sim-resume'
    | 'sim-poster-down'
    | 'sim-clock'
    | 'sim-shortfall';

/** The terms of a new trade policy version, as the gate's editor drafts them. */
export interface PolicyDraft {
    jurisdictions: string[];
    maxKycAgeDays: number;
    delegates: WalletId[];
}

export interface ActionArgs {
    /** The person acted on. */
    who?: WalletId;
    stock?: StockId;
    /** For an approval: the broker the owner approves. */
    broker?: WalletId;
    policy?: PolicyDraft;
    hold?: HoldReason;
}

export interface ActionDef {
    id: ActionId;
    site: Site;
    /** The verb, as a button says it. */
    title: string;
    /** Who really acts. */
    actor: string;
    availability: Availability | 'mock';
    /** Where it stands, in a few words. */
    standing: string;
    /** Venue minutes it takes, time locks included. */
    minutes: number;
    /** The rule family this action is about: it is offered only while that family is in force. */
    feature?: keyof Features;
    /** Offered only in free play: the world's events, not the manager's. */
    sandbox?: boolean;
    /** What it does, in one sentence. */
    detail: string;
    /** The button's label for these arguments, when it differs from the title. */
    label?(park: Park, args: ActionArgs): string;
    /** Why it cannot be done now, as the system would answer; undefined when it can. */
    blocked(park: Park, args: ActionArgs): string | undefined;
    apply(park: Park, args: ActionArgs): void;
    /** One line for the log, in the past tense. */
    line(park: Park, args: ActionArgs): string;
}

/** A demo time lock for the operations role: production values are an operator decision. */
export const TIME_LOCK = 10;

const name = (park: Park, who: WalletId | undefined): string => (who ? park.people[who].name : 'someone');

function listingOf(park: Park, args: ActionArgs) {
    return args.stock ? park.listings[args.stock] : undefined;
}

function needStock(park: Park, args: ActionArgs): string | undefined {
    if (!args.stock) return 'Choose a stock.';
    if (!park.listings[args.stock]) return `${args.stock} is not on this venue.`;
    return undefined;
}

function needWho(args: ActionArgs): string | undefined {
    return args.who ? undefined : 'Choose a person.';
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export const ACTIONS: readonly ActionDef[] = [
    // ----- The credential bureau: the KYC provider -----
    {
        id: 'verify',
        site: 'bureau',
        title: 'Verify and issue a credential',
        actor: 'The credential bureau (KYC provider)',
        availability: 'live',
        standing: 'Live on main · the KYC form itself is mocked',
        minutes: 20,
        detail: 'The bureau checks who the person is and where they live, then writes a fresh credential for their wallet: one attestation, read by every pool.',
        label(park, args) {
            const person = args.who ? park.people[args.who] : undefined;
            if (person?.credential) return 'Renew the credential';
            if (person?.revoked) return 'Issue again';
            return 'Verify and issue a credential';
        },
        blocked(park, args) {
            const missing = needWho(args);
            if (missing) return missing;
            const person = park.people[args.who as WalletId];
            if (person.barred)
                return `The bureau declines: ${person.name}'s file is under review. Who gets a credential is the KYC provider's call, not the venue's.`;
            if (person.credential && park.now - person.credential.verifiedAt < DAY)
                return `${person.name} was verified today already.`;
            return undefined;
        },
        apply(park, args) {
            const person = park.people[args.who as WalletId];
            person.credential = credentialFor(person.home, park.now, park.now + days(365));
            person.revoked = false;
        },
        line(park, args) {
            const person = park.people[args.who as WalletId];
            return `The bureau verified ${person.name} and issued a credential (${person.home}).`;
        },
    },
    {
        id: 'revoke',
        site: 'bureau',
        title: 'Revoke the credential',
        actor: 'The credential bureau (KYC provider)',
        availability: 'live',
        standing: 'Live on main',
        minutes: 5,
        detail: 'Closes the attestation on chain. Every pool refuses the wallet from then on, withdrawals included; a thawed account stays thawed.',
        blocked(park, args) {
            const missing = needWho(args);
            if (missing) return missing;
            const person = park.people[args.who as WalletId];
            return person.credential ? undefined : `${person.name} holds no credential.`;
        },
        apply(park, args) {
            const person = park.people[args.who as WalletId];
            person.credential = undefined;
            person.revoked = true;
        },
        line: (park, args) => `The bureau revoked ${name(park, args.who)}'s credential.`,
    },

    // ----- The mint house: the issuer and its stock accounts -----
    {
        id: 'holder-thaw',
        site: 'issuer',
        title: 'Thaw with the credential',
        actor: 'The holder, or anyone for them',
        availability: 'live',
        standing: 'Live on main · Token ACL permissionless thaw',
        minutes: 2,
        detail: "Stock accounts start frozen. Anyone may send the thaw; the issuer's gate allows it while the owner's credential meets the issuer's holding policy.",
        blocked(park, args) {
            const missing = needStock(park, args) ?? needWho(args);
            if (missing) return missing;
            const listing = listingOf(park, args);
            const person = park.people[args.who as WalletId];
            if (!listing?.created) return `${args.stock} does not exist yet: the issuer creates it first.`;
            if (person.holdings[args.stock as StockId].account === 'thawed')
                return `${person.name}'s ${args.stock} account is already thawed.`;
            if (!credentialValid(person, park.now))
                return `The issuer's gate refuses the thaw: ${person.name} holds no valid credential${person.revoked ? ' (it was revoked)' : ''}.`;
            return undefined;
        },
        apply(park, args) {
            park.people[args.who as WalletId].holdings[args.stock as StockId].account = 'thawed';
        },
        line: (park, args) => `${name(park, args.who)} thawed their ${args.stock} account with the credential.`,
    },
    {
        id: 'issuer-thaw',
        site: 'issuer',
        title: 'Thaw by hand',
        actor: 'The issuer',
        availability: 'live',
        standing: "Live on main · Token ACL's permissioned thaw",
        minutes: 5,
        detail: "The issuer, as the stock's freeze authority, thaws an account itself. It decides who may hold; it says nothing about who may trade.",
        blocked(park, args) {
            const missing = needStock(park, args) ?? needWho(args);
            if (missing) return missing;
            const person = park.people[args.who as WalletId];
            if (!listingOf(park, args)?.created) return `${args.stock} does not exist yet.`;
            if (person.holdings[args.stock as StockId].account === 'thawed')
                return `${person.name}'s ${args.stock} account is already thawed.`;
            return undefined;
        },
        apply(park, args) {
            park.people[args.who as WalletId].holdings[args.stock as StockId].account = 'thawed';
        },
        line: (park, args) => `The issuer thawed ${name(park, args.who)}'s ${args.stock} account by hand.`,
    },
    {
        id: 'create-stock',
        site: 'issuer',
        title: 'Create the stock',
        actor: 'The issuer',
        availability: 'live',
        standing: 'Live on main',
        minutes: 10,
        detail: 'A Token-2022 mint whose accounts start frozen. The issuer mints the first shares to its holders; those with a valid credential thaw their accounts.',
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            return listingOf(park, args)?.created ? `${args.stock} already exists.` : undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (!listing) return;
            listing.created = true;
            for (const [id, shares] of Object.entries(listing.allocation) as Array<[WalletId, number]>) {
                const person = park.people[id];
                const holding = person.holdings[listing.stock];
                holding.shares += shares;
                holding.account = credentialValid(person, park.now) ? 'thawed' : 'frozen';
            }
        },
        line: (_park, args) =>
            `The issuer created ${args.stock ? STOCKS[args.stock].name : 'the stock'} and minted its first shares.`,
    },
    {
        id: 'thaw-vault',
        site: 'issuer',
        title: "Thaw the pool's vault",
        actor: 'The issuer',
        availability: 'live',
        standing: 'Live on main',
        minutes: 5,
        detail: "The pool's stock vault starts frozen like any new account. Only the issuer can thaw it, and the pool cannot be funded before.",
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const pool = listingOf(park, args)?.pool;
            if (!pool || pool.status === 'none') return `There is no ${args.stock} pool yet, so no vault to thaw.`;
            return pool.vaultThawed ? `The ${args.stock} vault is already thawed.` : undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (listing) listing.pool.vaultThawed = true;
        },
        line: (_park, args) => `The issuer thawed the ${args.stock} pool's stock vault.`,
    },
    {
        id: 'recover',
        site: 'issuer',
        title: 'Recover the shares',
        actor: 'The issuer (permanent delegate)',
        availability: 'live',
        standing: 'Live on main · the pool-side checks are planned',
        minutes: 5,
        feature: 'reserves',
        detail: "The stock's permanent delegate moves shares out of any account, on a court order for example. No venue role can stop it.",
        label: (park, args) => `Recover ${name(park, args.who)}'s ${args.stock ?? ''} shares`,
        blocked(park, args) {
            const missing = needStock(park, args) ?? needWho(args);
            if (missing) return missing;
            const person = park.people[args.who as WalletId];
            return person.holdings[args.stock as StockId].shares > 1e-9
                ? undefined
                : `${person.name} holds no ${args.stock}.`;
        },
        apply(park, args) {
            park.people[args.who as WalletId].holdings[args.stock as StockId].shares = 0;
        },
        line: (park, args) => `The issuer recovered ${name(park, args.who)}'s ${args.stock} shares.`,
    },
    {
        id: 'return-stock',
        site: 'issuer',
        title: 'Return shares to the vault',
        actor: 'The issuer',
        availability: 'planned',
        standing: 'Planned · honest reserves',
        minutes: 5,
        feature: 'reserves',
        detail: "The issuer sends back what its recovery took from the pool, so the vault covers the books again. Only the issuer can take shares out of a vault; putting them back is a plain transfer, and here the issuer returns its own.",
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const pool = listingOf(park, args)?.pool;
            if (!pool || pool.vaultTsa >= pool.tsa - 1e-9) return `The ${args.stock} vault is not short.`;
            return undefined;
        },
        apply(park, args) {
            const pool = listingOf(park, args)?.pool;
            if (pool) pool.vaultTsa = pool.tsa;
        },
        line: (_park, args) => `The issuer returned the missing shares to the ${args.stock} vault.`,
    },

    // ----- The pools -----
    {
        id: 'create-pool',
        site: 'pool',
        title: 'Create the pool',
        actor: 'Yuki, liquidity provider',
        availability: 'live',
        standing: 'Live on main · a venue role creating pools is planned',
        minutes: 5,
        detail: 'An empty pool with two vaults. On main any wallet may create one, and only that wallet may fund it, once.',
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const listing = listingOf(park, args);
            if (!listing?.created) return `${args.stock} does not exist yet: the issuer creates the stock first.`;
            return listing.pool.status !== 'none' ? `The ${args.stock} pool already exists.` : undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (!listing) return;
            listing.pool.status = 'created';
            listing.creator = 'yuki';
        },
        line: (_park, args) => `Yuki created the ${args.stock} pool, empty.`,
    },
    {
        id: 'fund-pool',
        site: 'pool',
        title: 'Fund the pool',
        actor: 'Yuki, who created it',
        availability: 'live',
        standing: 'Live on main',
        minutes: 5,
        detail: "Yuki pours in 100 shares and their worth in USDC. Funding is a checked move too: it needs the policy, a thawed vault, and Yuki's own valid credential and account.",
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const listing = listingOf(park, args);
            const stock = args.stock as StockId;
            const yuki = park.people.yuki;
            if (!listing || listing.pool.status === 'none') return `There is no ${stock} pool yet.`;
            if (listing.pool.status === 'open') return `The ${stock} pool is already funded: it can be funded once.`;
            // fund_pool runs the trade policy on its creator before any token moves, so a missing policy
            // or an ineligible creator is refused before the frozen vault is ever touched.
            const policy = listing.policy;
            if (!policy) return 'Refused with 7001 CREDENTIAL_INVALID: the pool has no trade policy yet.';
            if (yuki.holdings[stock].account !== 'thawed')
                return `Refused with 7000 ACCOUNT_NOT_ELIGIBLE: Yuki's ${stock} account is frozen.`;
            const wallet = venueOf(park, stock).wallets.yuki;
            if (credentialFinding(wallet, policy, park.now, false))
                return "Refused with 7001 CREDENTIAL_INVALID: Yuki's credential does not meet the pool's policy.";
            if (!wallet.credential || !policy.jurisdictions.includes(wallet.credential.jurisdiction))
                return "Refused with 7000 ACCOUNT_NOT_ELIGIBLE: the pool's policy does not accept Yuki's jurisdiction.";
            if (!listing.pool.vaultThawed)
                return "Funding fails: the pool's stock vault is still frozen, and only the issuer can thaw it. (The token program answers AccountFrozen.)";
            const usdc = 100 * STOCKS[stock].opening;
            if (yuki.holdings[stock].shares < 100 || yuki.usdc < usdc)
                return `Yuki needs 100 ${stock} and ${usdc.toFixed(2)} USDC to fund it.`;
            return undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (!listing) return;
            const stock = listing.stock;
            const shares = 100;
            const usdc = Math.round(shares * STOCKS[stock].opening * 100) / 100;
            const lp = initialLp(shares, usdc);
            listing.pool = { ...listing.pool, status: 'open', tsa: shares, usdc, vaultTsa: shares, lpSupply: lp };
            listing.market.price = STOCKS[stock].opening;
            const yuki = park.people.yuki;
            yuki.holdings[stock].shares -= shares;
            yuki.usdc -= usdc;
            yuki.holdings[stock].lp += lp;
        },
        line: (_park, args) =>
            `Yuki funded the ${args.stock} pool: 1 ${args.stock} = ${args.stock ? STOCKS[args.stock].opening.toFixed(2) : ''} USDC.`,
    },
    {
        id: 'reconcile',
        site: 'pool',
        title: 'Reconcile the books',
        actor: 'Anyone',
        availability: 'planned',
        standing: 'Planned · honest reserves',
        minutes: 2,
        feature: 'reserves',
        detail: 'Compares the vault with the recorded reserves. A shortfall is recorded and the pool flagged; reconciling never clears a flag.',
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            return listingOf(park, args)?.pool.status === 'open' ? undefined : `The ${args.stock} pool is not open.`;
        },
        apply(park, args) {
            const pool = listingOf(park, args)?.pool;
            if (pool && pool.vaultTsa < pool.tsa - 1e-9) pool.flagged = true;
        },
        line(park, args) {
            const pool = listingOf(park, args)?.pool;
            if (pool && pool.vaultTsa < pool.tsa - 1e-9) return `Reconciled ${args.stock}: the vault is short, and the pool is flagged.`;
            return `Reconciled ${args.stock}: the vault covers the books${pool?.flagged ? '; the flag stays until operations lifts it' : ''}.`;
        },
    },

    // ----- The gate: each pool's trade policy -----
    {
        id: 'set-policy',
        site: 'gate',
        title: 'Publish a new policy version',
        actor: 'The venue admin key',
        availability: 'live',
        standing: 'Live on main · which role will own it is not settled',
        minutes: 5,
        detail: "Each pool has its own versioned trade policy: who may trade in it. Every change is a new version; old pages never come back.",
        label(park, args) {
            const policy = listingOf(park, args)?.policy;
            return policy ? `Publish policy v${policy.version + 1}` : 'Set policy v1';
        },
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const listing = listingOf(park, args);
            const draft = args.policy;
            if (!listing || listing.pool.status === 'none')
                return `There is no ${args.stock} pool yet: a policy belongs to a pool.`;
            if (!draft) return 'Draft the policy first.';
            if (draft.jurisdictions.length === 0) return 'A policy names at least one jurisdiction.';
            if (draft.delegates.length > 8) return 'Refused with InvalidInput (6003): at most 8 brokers.';
            if (draft.maxKycAgeDays < 1) return 'Refused with InvalidInput (6003): the KYC age limit must be at least a day.';
            const policy = listing.policy;
            if (
                policy &&
                sameList(policy.jurisdictions, draft.jurisdictions) &&
                sameList(policy.delegates, draft.delegates) &&
                policy.maxKycAgeDays === draft.maxKycAgeDays
            )
                return 'Nothing changed: this draft says what the policy already says.';
            return undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            const draft = args.policy;
            if (!listing || !draft) return;
            const base: TradePolicy = listing.policy ?? { ...firstPolicy(), version: 0 };
            listing.policy = {
                ...base,
                version: base.version + 1,
                jurisdictions: [...draft.jurisdictions],
                maxKycAgeDays: draft.maxKycAgeDays,
                delegates: [...draft.delegates],
            };
        },
        line(park, args) {
            const policy = listingOf(park, args)?.policy;
            return `The venue published ${args.stock} trade policy v${policy?.version ?? 1}.`;
        },
    },
    {
        id: 'approve',
        site: 'gate',
        title: 'Approve the broker',
        actor: 'The owner, from their own wallet',
        availability: 'live',
        standing: 'Live on main · an SPL approval',
        minutes: 2,
        detail: "The owner lets a broker sign for their token accounts. The venue cannot do it for them, and the broker still needs the pool's listing and a credential of his own.",
        label: (park, args) => `${name(park, args.who)} approves ${name(park, args.broker)}`,
        blocked(park, args) {
            const missing = needWho(args);
            if (missing) return missing;
            if (!args.broker) return 'Choose the broker.';
            if (args.broker === args.who) return 'An owner does not need to approve themselves.';
            const person = park.people[args.who as WalletId];
            return person.approves === args.broker ? `${person.name} has already approved ${name(park, args.broker)}.` : undefined;
        },
        apply(park, args) {
            park.people[args.who as WalletId].approves = args.broker;
        },
        line: (park, args) => `${name(park, args.who)} approved ${name(park, args.broker)} as a broker.`,
    },

    // ----- The council hall: the venue's role multisigs -----
    {
        id: 'pause-swaps',
        site: 'council',
        title: 'Pause swaps',
        actor: 'Emergency role (2 of 3, a demo threshold)',
        availability: 'planned',
        standing: 'Planned · role multisigs · per pool or per stock is not settled',
        minutes: 3,
        feature: 'governance',
        detail: "Stops swaps in one pool at once, with no time lock. The planned restriction flags hold one bit per operation; the game models the swap bit only, so deposits and withdrawals go on here (whether a pause may hold exits is still open). Emergency cannot lift its own pause.",
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const listing = listingOf(park, args);
            if (listing?.pool.status !== 'open') return `The ${args.stock} pool is not open.`;
            return listing.swapsPaused ? `Swaps in ${args.stock} are already paused.` : undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (listing) listing.swapsPaused = true;
        },
        line: (_park, args) => `Emergency paused swaps in the ${args.stock} pool.`,
    },
    {
        id: 'lift-pause',
        site: 'council',
        title: 'Lift the pause',
        actor: 'Operations role (2 of 3, then a time lock)',
        availability: 'planned',
        standing: 'Planned · role multisigs',
        minutes: 2 + TIME_LOCK,
        feature: 'governance',
        detail: `Reopens swaps after the operations time lock (${TIME_LOCK} minutes here, a demo value).`,
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            return listingOf(park, args)?.swapsPaused ? undefined : `Swaps in ${args.stock} are not paused.`;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (listing) listing.swapsPaused = false;
        },
        line: (_park, args) => `Operations lifted the swap pause on ${args.stock}, after the time lock.`,
    },
    {
        id: 'hold',
        site: 'council',
        title: 'Impose a venue hold',
        actor: 'Emergency role (PR #101 lets operations impose one too)',
        availability: 'review',
        standing: 'In review · PR #101 · the multisigs are planned',
        minutes: 3,
        feature: 'halts',
        detail: "Halts one stock on the venue through its halt record: swaps and deposits are refused with 7004, withdrawals pass. Only operations can lift it.",
        label: (_park, args) => `${args.hold ? HOLD_LABEL[args.hold] : 'Venue'} hold on ${args.stock ?? 'a stock'}`,
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            if (!args.hold) return 'Choose the reason for the hold.';
            return listingOf(park, args)?.holds.includes(args.hold)
                ? `${args.stock} already carries a ${HOLD_LABEL[args.hold].toLowerCase()} hold.`
                : undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (listing && args.hold) listing.holds = [...listing.holds, args.hold];
        },
        line: (_park, args) =>
            `A ${args.hold ? HOLD_LABEL[args.hold].toLowerCase() : 'venue'} hold now halts ${args.stock} on the venue.`,
    },
    {
        id: 'lift-hold',
        site: 'council',
        title: 'Lift a venue hold',
        actor: 'Operations role (then a time lock)',
        availability: 'review',
        standing: 'In review · PR #101 · the time lock is planned',
        minutes: 2 + TIME_LOCK,
        feature: 'halts',
        detail: "Lifts one of the venue's own holds, one at a time. It can never lift a halt the exchange posted.",
        label: (_park, args) => `Lift the ${args.hold ? HOLD_LABEL[args.hold].toLowerCase() : ''} hold on ${args.stock ?? ''}`,
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const listing = listingOf(park, args);
            if (!listing || listing.holds.length === 0) {
                if (listing?.market.record === 'halted')
                    return `There is no venue hold on ${args.stock}: the exchange halted it, and no venue role can lift a halt the primary market posted.`;
                return `There is no venue hold on ${args.stock}.`;
            }
            if (!args.hold || !listing.holds.includes(args.hold)) return 'Choose a hold that is in place.';
            return undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (listing) listing.holds = listing.holds.filter((hold) => hold !== args.hold);
        },
        line: (_park, args) =>
            `Operations lifted the ${args.hold ? HOLD_LABEL[args.hold].toLowerCase() : ''} hold on ${args.stock}, after the time lock.`,
    },
    {
        id: 'lift-flag',
        site: 'council',
        title: 'Lift the out-of-balance flag',
        actor: 'Operations role (2 of 3, then a time lock)',
        availability: 'planned',
        standing: 'Planned · honest reserves',
        minutes: 2 + TIME_LOCK,
        feature: 'reserves',
        detail: 'Clears the flag once the vault is whole again. The balance check compares the vault with the books on every move, flag or not.',
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const pool = listingOf(park, args)?.pool;
            if (!pool?.flagged) return `The ${args.stock} pool is not flagged.`;
            if (pool.vaultTsa < pool.tsa - 1e-9)
                return `The ${args.stock} vault still holds less than the books record. Lifting the flag would not reopen the pool: the balance check compares the two on every move. (Whether a lift may ever reopen an unrestored shortfall is still an open decision.)`;
            return undefined;
        },
        apply(park, args) {
            const pool = listingOf(park, args)?.pool;
            if (pool) pool.flagged = false;
        },
        line: (_park, args) => `Operations lifted the ${args.stock} pool's flag, after the time lock.`,
    },

    // ----- The halt board: the halt poster and the records -----
    {
        id: 'restart-poster',
        site: 'haltBoard',
        title: 'Restore the halt poster',
        actor: "The venue's operators",
        availability: 'planned',
        standing: 'Planned · the poster service (its posting and heartbeat instructions are in review, PR #101)',
        minutes: 4,
        feature: 'halts',
        detail: "Brings the poster back: it posts what the exchange says for every stock, and fresh evidence lands. It relays halts; it cannot invent a resume.",
        blocked: (park) => (park.poster ? 'The poster is running: the evidence is fresh.' : undefined),
        apply(park) {
            park.poster = true;
            for (const listing of Object.values(park.listings)) {
                if (!listing) continue;
                listing.market.record = listing.market.status === 'halted' ? 'halted' : 'trading';
                listing.market.evidenceFresh = true;
            }
        },
        line: () => 'The halt poster is back: every record follows the exchange again, with fresh evidence.',
    },

    // ----- The exchange: the world's events, in free play -----
    {
        id: 'sim-halt',
        site: 'exchange',
        title: 'The exchange halts it',
        actor: 'The primary market (simulated)',
        availability: 'mock',
        standing: 'Simulated feed',
        minutes: 0,
        feature: 'halts',
        sandbox: true,
        detail: 'A trading pause on the primary market. If the poster is running, the on-chain record follows a moment later.',
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            return listingOf(park, args)?.market.status === 'halted' ? `${args.stock} is already halted.` : undefined;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (!listing) return;
            listing.market.status = 'halted';
            listing.market.haltCode = 'LUDP';
            if (park.poster) listing.market.record = 'halted';
        },
        line: (_park, args) => `The exchange paused trading in ${args.stock}.`,
    },
    {
        id: 'sim-resume',
        site: 'exchange',
        title: 'The exchange resumes it',
        actor: 'The primary market (simulated)',
        availability: 'mock',
        standing: 'Simulated feed',
        minutes: 0,
        feature: 'halts',
        sandbox: true,
        detail: 'The primary market resumes. Only its resumption message reopens the record, never a timer.',
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            return listingOf(park, args)?.market.status === 'halted' ? undefined : `${args.stock} is trading.`;
        },
        apply(park, args) {
            const listing = listingOf(park, args);
            if (!listing) return;
            listing.market.status = 'trading';
            listing.market.haltCode = undefined;
            if (park.poster) listing.market.record = 'trading';
        },
        line: (_park, args) => `The exchange resumed trading in ${args.stock}.`,
    },
    {
        id: 'sim-poster-down',
        site: 'exchange',
        title: 'The halt poster goes quiet',
        actor: 'The world (simulated)',
        availability: 'mock',
        standing: 'Simulated outage',
        minutes: 0,
        feature: 'halts',
        sandbox: true,
        detail: 'No fresh evidence reaches the chain. Unknown counts as halted: every pool fails closed with 7007.',
        blocked: (park) => (park.poster ? undefined : 'The poster is already silent.'),
        apply(park) {
            park.poster = false;
            for (const listing of Object.values(park.listings)) if (listing) listing.market.evidenceFresh = false;
        },
        line: () => 'The halt poster went quiet. The evidence is going stale.',
    },
    {
        id: 'sim-clock',
        site: 'exchange',
        title: 'Let an hour pass',
        actor: 'The clock',
        availability: 'mock',
        standing: 'Simulated',
        minutes: 60,
        sandbox: true,
        detail: "Credentials age and expire on their own. Past midnight a new trade date starts and every stock's daily budget is fresh.",
        blocked: () => undefined,
        apply(park) {
            // The clock moves after apply: a new trade date starts when the hour crosses midnight.
            if (Math.floor((park.now + 60) / DAY) > Math.floor(park.now / DAY))
                for (const listing of Object.values(park.listings)) if (listing) listing.budget.usedShares = 0;
        },
        line: (park) =>
            Math.floor(park.now / DAY) > Math.floor((park.now - 60) / DAY)
                ? 'An hour went by, into a new trade date: every budget is fresh.'
                : 'An hour went by.',
    },
    {
        id: 'sim-shortfall',
        site: 'issuer',
        title: 'A recovery hits the vault',
        actor: "The issuer's clerk (simulated)",
        availability: 'mock',
        standing: 'Simulated event · the balance check it trips is planned',
        minutes: 0,
        feature: 'reserves',
        sandbox: true,
        detail: "A recovery takes 20 shares from the pool's vault by mistake. The vault no longer covers the books: the pool refuses every move (7009) until the shares come back and operations lifts the flag.",
        blocked(park, args) {
            const missing = needStock(park, args);
            if (missing) return missing;
            const pool = listingOf(park, args)?.pool;
            if (pool?.status !== 'open') return `The ${args.stock} pool is not open.`;
            return pool.vaultTsa < 20 + 1e-9 ? `The ${args.stock} vault holds too little.` : undefined;
        },
        apply(park, args) {
            const pool = listingOf(park, args)?.pool;
            if (!pool) return;
            pool.vaultTsa -= 20;
            pool.flagged = true;
        },
        line: (_park, args) => `A recovery took 20 ${args.stock} from the pool's vault; the pool is flagged.`,
    },
];

export function actionDef(id: ActionId): ActionDef {
    const found = ACTIONS.find((action) => action.id === id);
    if (!found) throw new Error(`unknown action ${id}`);
    return found;
}

/** Whether an action belongs on this venue right now: its rules are in force, and it is not a free-play event in a scenario. */
export function offered(park: Park, action: ActionDef, sandbox: boolean): boolean {
    if (action.sandbox && !sandbox) return false;
    return action.feature === undefined || park.features[action.feature];
}

export type Outcome = { ok: true; line: string; minutes: number } | { ok: false; error: string };

/** Carries out an action: checks it, applies it and moves the clock. A refused action changes nothing. */
export function perform(park: Park, id: ActionId, args: ActionArgs, sandbox = false): Outcome {
    const action = actionDef(id);
    if (!offered(park, action, sandbox)) return { ok: false, error: 'That is not part of this scenario.' };
    const error = action.blocked(park, args);
    if (error) return { ok: false, error };
    action.apply(park, args);
    park.now += action.minutes;
    return { ok: true, line: action.line(park, args), minutes: action.minutes };
}

/** The policy draft that starts from a pool's current policy (or the first one). */
export function draftOf(policy: TradePolicy | undefined): PolicyDraft {
    const base = policy ?? firstPolicy();
    return {
        jurisdictions: [...base.jurisdictions],
        maxKycAgeDays: base.maxKycAgeDays,
        delegates: [...base.delegates],
    };
}

/** The jurisdictions the policy editor offers. */
export const JURISDICTIONS = ['US', 'DE', 'GB', 'JP'] as const;
