/**
 * How manager mode says things: trades, refusals, credentials, a stock's
 * state and an action's time, in plain words. Pure functions over the park.
 */
import { AVAILABILITY_LABEL } from '../../content/places.ts';
import type { ActionArgs, ActionDef, ActionId } from '../../sim/actions.ts';
import { amount, money } from '../../sim/format.ts';
import { kycAge, priceOf, type Park, type Person, type StockId } from '../../sim/park.ts';
import { reasonDef } from '../../sim/rules.ts';
import type { Operation, Quote, ReasonId, TradeRequest, WalletId } from '../../sim/types.ts';

export type Tone = 'good' | 'warn' | 'bad' | 'idle' | 'ice';

/** Only a swap that settles is a fill; deposits and withdrawals are liquidity moves that go through. */
export function isSwap(op: Operation): boolean {
    return op === 'buy' || op === 'sell';
}

/** "must fill", "must go through" or "must be refused". */
export function mustWords(op: Operation | undefined, expect: 'fill' | 'refuse'): string {
    if (expect === 'refuse') return 'must be refused';
    return op && !isSwap(op) ? 'must go through' : 'must fill';
}

/** "fills" or "goes through". */
export function passWord(op: Operation | undefined): string {
    return op && !isSwap(op) ? 'goes through' : 'fills';
}

/** The refusal as the venue answers it: "7001 · The credential has expired". */
export function refusalText(reason: ReasonId | undefined): string {
    if (!reason) return 'refused';
    const def = reasonDef(reason);
    return `${def.code ?? def.codeNote ?? 'no code'} · ${def.title}`;
}

/** A trade in a few words: "buy 10 USDC of TSB". */
export function tradeWords(request: TradeRequest, stock: StockId): string {
    switch (request.op) {
        case 'buy':
            return `buy ${amount(request.amount, 0)} USDC of ${stock}`;
        case 'sell':
            return `sell ${amount(request.amount)} ${stock}`;
        case 'deposit':
            return `deposit ${amount(request.amount)} LP of ${stock} liquidity`;
        case 'withdraw':
            return `withdraw ${amount(request.amount)} LP from ${stock}`;
    }
}

/** What a fill would hand the owner: "+0.80 TSB". */
export function fillWords(request: TradeRequest, stock: StockId, fill: Quote): string {
    switch (request.op) {
        case 'buy':
            return `+${amount(fill.tsa)} ${stock} for ${amount(-fill.usdc)} USDC`;
        case 'sell':
            return `+${amount(fill.usdc)} USDC for ${amount(-fill.tsa)} ${stock}`;
        case 'deposit':
            return `+${amount(fill.lp)} LP for ${amount(-fill.tsa)} ${stock} + ${amount(-fill.usdc)} USDC`;
        case 'withdraw':
            return `+${amount(fill.tsa)} ${stock} + ${amount(fill.usdc)} USDC`;
    }
}

/** The possessive the game's papers use for each resident; "their" where the story never says. */
const POSSESSIVE: Partial<Record<WalletId, string>> = {
    hana: 'her',
    priya: 'her',
    ito: 'his',
    kenji: 'his',
    ben: 'his',
};

export function possessive(who: WalletId): string {
    return POSSESSIVE[who] ?? 'their';
}

/** A person's credential, as the bureau's register reads. */
export function credentialLine(person: Person, now: number): { text: string; tone: Tone } {
    const credential = person.credential;
    let text: string;
    let tone: Tone;
    if (credential && credential.expiresAt <= now) {
        text = 'expired';
        tone = 'warn';
    } else if (credential) {
        const age = kycAge(person, now) ?? 0;
        text = `valid · KYC ${age === 1 ? '1 day' : `${age} days`} · ${credential.jurisdiction}`;
        tone = 'good';
    } else if (person.revoked) {
        text = 'revoked';
        tone = 'bad';
    } else {
        text = 'none';
        tone = 'idle';
    }
    if (person.barred) text += ' · file under review';
    return { text, tone };
}

/**
 * One stock as the top bar shows it: its price while its pool would let a swap through, else the first
 * of the pool's own checks that would stop one (in the pool's order).
 */
export function stockState(park: Park, stock: StockId): { text: string; tone: Tone; title: string } {
    const listing = park.listings[stock];
    const f = park.features;
    if (!listing || !listing.created || listing.pool.status !== 'open')
        return { text: 'NOT OPEN', tone: 'idle', title: `The ${stock} pool is not open yet.` };
    const pool = listing.pool;
    if (f.governance && listing.swapsPaused)
        return { text: 'PAUSED', tone: 'bad', title: `Emergency paused swaps in ${stock}.` };
    if (f.halts && listing.holds.length > 0)
        return { text: 'HOLD', tone: 'bad', title: `A venue hold halts ${stock} (7004).` };
    if (f.halts && listing.market.record === 'halted')
        return { text: 'HALTED', tone: 'bad', title: `The on-chain record says ${stock} is halted (7004).` };
    if (f.halts && !listing.market.evidenceFresh)
        return { text: 'STALE', tone: 'bad', title: 'The halt evidence is stale: the pool fails closed (7007).' };
    if (f.reserves && pool.vaultTsa < pool.tsa - 1e-9)
        return { text: 'SHORT', tone: 'bad', title: `The ${stock} vault holds less than the books (7009).` };
    if (f.reserves && pool.flagged)
        return {
            text: 'FLAGGED',
            tone: 'bad',
            title: `The ${stock} pool is flagged until operations lifts it (7009).`,
        };
    const price = `${money(priceOf(park, stock))}`;
    if (f.halts && listing.market.status === 'halted')
        return {
            text: price,
            tone: 'warn',
            title: `The exchange halted ${stock}, but the on-chain record still says trading.`,
        };
    return { text: price, tone: 'good', title: `1 ${stock} = ${price} USDC` };
}

/** "20 min", "12 min incl. time lock", "at once". */
export function minutesText(def: ActionDef): string {
    if (def.minutes === 0) return 'at once';
    const time = def.minutes >= 60 && def.minutes % 60 === 0 ? `${def.minutes / 60} h` : `${def.minutes} min`;
    return /time lock/i.test(def.actor) ? `${time} incl. time lock` : time;
}

/** The part of a standing the tag beside it does not already say. */
export function afterTag(availability: keyof typeof AVAILABILITY_LABEL, standing: string): string | undefined {
    const label = AVAILABILITY_LABEL[availability];
    if (standing === label) return undefined;
    if (standing.startsWith(`${label} · `)) return standing.slice(label.length + 3);
    if (availability === 'mock' && standing.startsWith(label)) return undefined;
    return standing;
}

/** The part of an action's standing the tag does not already say. */
export function standingNote(def: ActionDef): string | undefined {
    return afterTag(def.availability, def.standing);
}

/** Who the order comes from, inside a sentence: "from the issuer", "at the gate". */
export function fromWords(from: string): string {
    if (/^At /.test(from)) return `at ${from.slice(3)}`;
    return `from ${from.replace(/^The /, 'the ')}`;
}

/** A scenario's standing without the words its tag already says: "Live on main: credentials…" → "Credentials…". */
export function standingLine(availability: keyof typeof AVAILABILITY_LABEL, standing: string): string {
    const label = `${AVAILABILITY_LABEL[availability]}: `;
    if (!standing.startsWith(label)) return standing;
    const rest = standing.slice(label.length);
    return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Tells one button's action and arguments from another's, the drafted policy aside. */
export function argsKey(action: ActionId, args: ActionArgs): string {
    return [action, args.who ?? '', args.stock ?? '', args.broker ?? '', args.hold ?? ''].join(':');
}
