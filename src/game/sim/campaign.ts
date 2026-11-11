/**
 * The venue day: the cast, the opening state, and every beat in order (the
 * chapters, the setup steps the player clicks through, the scripted events
 * and the visitors at the gate).
 *
 * Beats change the venue only through their `apply`, so the test can replay
 * the whole day without a browser and check that every visitor gets the
 * outcome the script expects.
 */
import { DAY, initialLp, quote, settle } from './rules.ts';
import type { Availability, CheckId, ReasonId, TradeRequest, Venue, Wallet, WalletId } from './types.ts';

/** Minutes from midnight for a time on the venue day. */
export function at(hour: number, minute: number): number {
    return hour * 60 + minute;
}

const CREDENTIAL = 'TSV Investor';

function credential(jurisdiction: string, verifiedDaysAgo: number, expiresAt: number) {
    return {
        name: CREDENTIAL,
        schemaVersion: 1,
        jurisdiction,
        verifiedAt: at(10, 0) - verifiedDaysAgo * DAY,
        expiresAt,
    };
}

const NEXT_YEAR = 353 * DAY;

/** The people who come to the gate. `look` names their model in the town. */
export const CAST: Record<WalletId, { look: string; pitch: number; bio: string }> = {
    yuki: { look: 'provider', pitch: 0.9, bio: 'Liquidity provider. Funds the pool and earns its fees.' },
    hana: { look: 'trader1', pitch: 1.25, bio: 'Trader. Verified, and a regular.' },
    sora: { look: 'trader2', pitch: 1.0, bio: 'Trader. Verified this morning; not for long.' },
    ito: { look: 'elder', pitch: 0.7, bio: 'Retired. His credential runs out at noon.' },
    jordan: { look: 'newcomer', pitch: 1.4, bio: 'New investor. No credential yet.' },
    lukas: { look: 'foreigner', pitch: 1.1, bio: 'Visitor with a credential from Germany.' },
    priya: { look: 'stale', pitch: 1.3, bio: 'Trader. Her KYC check is 45 days old.' },
    kenji: { look: 'broker', pitch: 0.8, bio: 'Broker. Trades for clients who approved him.' },
    ben: { look: 'whale', pitch: 0.6, bio: 'Big spender, by his own account.' },
};

function wallet(
    id: WalletId,
    name: string,
    role: string,
    address: string,
    usdc: number,
    rest: Partial<Wallet> = {},
): Wallet {
    return { id, name, role, address, usdc, tsa: 0, lp: 0, account: 'none', ...rest };
}

/** The venue before the day starts: people and their dollars, no stock and no pool yet. */
export function openingVenue(): Venue {
    return {
        now: at(9, 0),
        stockCreated: false,
        pool: { status: 'none', tsa: 0, usdc: 0, lpSupply: 0, vaultThawed: false, vaultTsa: 0, flagged: false },
        market: { status: 'trading', price: 12.4, record: 'trading', evidenceFresh: true },
        swapsPaused: false,
        budget: { dailyShares: 6, usedShares: 0 },
        features: { halts: false, governance: false, reserves: false, metering: false },
        wallets: {
            yuki: wallet('yuki', 'Yuki', 'Liquidity provider', 'Yuk1…p4Lq', 5000, {
                credential: credential('US', 12, NEXT_YEAR),
            }),
            hana: wallet('hana', 'Hana', 'Trader', 'Hana…7xQ2', 2000, {
                credential: credential('US', 9, NEXT_YEAR),
                approves: 'kenji',
            }),
            sora: wallet('sora', 'Sora', 'Trader', 'Sora…m9Tz', 1500, { credential: credential('US', 3, NEXT_YEAR) }),
            ito: wallet('ito', 'Mr. Ito', 'Retired holder', 'Ito8…c2Wd', 800, {
                credential: credential('US', 20, at(12, 0)),
            }),
            jordan: wallet('jordan', 'Jordan', 'New investor', 'Jord…k5Ne', 500),
            lukas: wallet('lukas', 'Lukas', 'Visitor', 'Luka…h3Vb', 900, {
                credential: credential('DE', 6, NEXT_YEAR),
            }),
            priya: wallet('priya', 'Priya', 'Trader', 'Priy…s8Ga', 700, {
                credential: credential('US', 45, 320 * DAY),
            }),
            kenji: wallet('kenji', 'Kenji', 'Broker', 'Kenj…b6Ru', 300, {
                credential: credential('US', 15, NEXT_YEAR),
            }),
            ben: wallet('ben', 'Big Ben', 'Investor', 'BigB…w1Yo', 50000, {
                credential: credential('US', 2, NEXT_YEAR),
            }),
        },
    };
}

export interface ChapterDef {
    id: string;
    number: number;
    title: string;
    /** The question the chapter answers. The first, second and fourth follow the delivery plan's (the first in plainer words); the others are the game's own. */
    question: string;
    /** Time of day for the light: 0 dawn to 1 night. */
    daytime: number;
    availability: Availability;
    /** What is real about this chapter's rules, in one line. */
    standing: string;
    /** Rules that enter the rulebook with this chapter. */
    unlocks: CheckId[];
    music: 'morning' | 'day' | 'tense' | 'dusk' | 'night';
    apply?(venue: Venue): void;
}

export type SetupId = 'create-stock' | 'create-pool' | 'set-policy' | 'thaw-vault' | 'fund-pool';

export interface SetupStep {
    id: SetupId;
    /** Which place the player clicks. */
    site: 'issuer' | 'pool' | 'gate' | 'council';
    /** Who acts. */
    actor: string;
    /** The instruction, as a call to action. */
    prompt: string;
    /** The button on the place's marker. */
    action: string;
    /** What just happened, shown after the click. */
    done: string;
    /** Why it matters, one or two sentences. */
    detail: string;
    apply(venue: Venue): void;
}

export type SceneId =
    | 'rush'
    | 'jordan-kyc'
    | 'revoke-sora'
    | 'policy-v2'
    | 'noon'
    | 'halt'
    | 'quiet'
    | 'poster-back'
    | 'emergency-pause'
    | 'operations-lift'
    | 'recovery'
    | 'reconcile'
    | 'budget'
    | 'closing';

export interface SceneDef {
    id: SceneId;
    title: string;
    /** Narration, one line per moment of the scene. */
    captions: string[];
    availability: Availability;
    apply(venue: Venue): void;
}

export interface CaseDef {
    id: string;
    /** The time on the venue clock when this visitor reaches the window. */
    time: number;
    request: TradeRequest;
    /** What the visitor says on arrival. */
    greeting: string;
    /** Replies when the gatekeeper asks for each paper, and after the stamp. */
    say: { account: string; kyc: string; authority?: string; filled: string; refused: string };
    expect: { outcome: 'fill' | 'refuse'; reason?: ReasonId };
    /** Where a new gatekeeper should look. */
    hint: string;
    /** The point of the case, shown with the verdict. */
    lesson: string;
}

export type Beat =
    | { kind: 'chapter'; chapter: ChapterDef }
    | { kind: 'setup'; step: SetupStep }
    | { kind: 'scene'; scene: SceneDef }
    | { kind: 'case'; case: CaseDef };

const own = (who: WalletId, op: TradeRequest['op'], amount: number): TradeRequest => ({
    op,
    signer: who,
    owner: who,
    amount,
});

/** The deposits of the "morning rush" scene, in order, with their time on the venue clock. */
export const RUSH: ReadonlyArray<{ id: string; time: number; request: TradeRequest }> = [
    { id: 'rush-sora', time: at(9, 46), request: own('sora', 'deposit', 1) },
    { id: 'rush-ito', time: at(9, 50), request: own('ito', 'deposit', 1) },
];

/** Settles the morning rush's deposits, as the pool would. */
export function settleRush(venue: Venue): void {
    for (const item of RUSH) {
        venue.now = item.time;
        settle(venue, item.request, quote(venue, item.request));
    }
}

const CHAPTERS: Record<string, ChapterDef> = {
    setup: {
        id: 'setup',
        number: 0,
        title: 'Open the venue',
        question: 'Can a stock that starts frozen for everyone trade in an open pool?',
        daytime: 0.02,
        availability: 'live',
        standing: 'Live on main: the split pool setup.',
        unlocks: ['pool-open'],
        music: 'morning',
    },
    eligibility: {
        id: 'eligibility',
        number: 1,
        title: 'Show me your KYC',
        question: 'Why is freezing not enough, and how does the pool check who trades?',
        daytime: 0.2,
        availability: 'live',
        standing: 'Live on main: the pool checks eligibility on every trade.',
        unlocks: ['account-thawed', 'credential', 'jurisdiction'],
        music: 'day',
    },
    exits: {
        id: 'exits',
        number: 2,
        title: 'Brokers and exits',
        question: 'Who may sign for someone else, and who may always leave?',
        daytime: 0.4,
        availability: 'live',
        standing: 'Live on main: delegates and controlled exits.',
        unlocks: ['authority'],
        music: 'day',
    },
    halts: {
        id: 'halts',
        number: 3,
        title: 'When the market stops',
        question: 'Can an on-chain venue stop when the primary exchange stops?',
        daytime: 0.6,
        availability: 'review',
        standing: 'In review: primary-market halts, pull request #101.',
        unlocks: ['halt', 'inputs-fresh'],
        music: 'tense',
        apply(venue) {
            venue.features.halts = true;
            // Early afternoon: the halt lands two minutes later.
            venue.now = at(14, 0);
        },
    },
    brakes: {
        id: 'brakes',
        number: 4,
        title: "The venue's own brakes",
        question: 'Who holds the pause button, and can a deficit move the price?',
        daytime: 0.82,
        availability: 'planned',
        standing: 'Planned: role multisigs, honest reserves and volume limits.',
        unlocks: ['venue-pause', 'in-balance', 'budget'],
        music: 'dusk',
        apply(venue) {
            venue.features.governance = true;
            venue.features.reserves = true;
            venue.features.metering = true;
            venue.now = at(15, 0);
        },
    },
};

const SETUP: SetupStep[] = [
    {
        id: 'create-stock',
        site: 'issuer',
        actor: 'The issuer',
        prompt: 'Start at the mint house: create the stock.',
        action: 'Create Test Stock A',
        done: 'Test Stock A exists. Every account that holds it starts frozen.',
        detail: 'The issuer keeps control of its security: it can mint, pause and recover, and only a wallet with a valid credential gets its account thawed.',
        apply(venue) {
            venue.stockCreated = true;
            const holders: Array<[WalletId, number]> = [
                ['yuki', 1000],
                ['hana', 100],
                ['sora', 100],
                ['ito', 60],
                ['priya', 20],
            ];
            for (const [id, amount] of holders) {
                venue.wallets[id].tsa = amount;
                venue.wallets[id].account = 'thawed';
            }
            // The issuer's own holding rule accepted Lukas's credential; the venue's trade policy is a separate matter.
            venue.wallets.lukas.account = 'thawed';
            venue.wallets.ben.account = 'thawed';
        },
    },
    {
        id: 'create-pool',
        site: 'pool',
        actor: 'Yuki, liquidity provider',
        prompt: 'Now dig the pool: Yuki creates it, empty.',
        action: 'Create the pool',
        done: 'The pool exists, with two empty vaults. Not funded yet.',
        detail: "A standard pool setup refuses this stock outright: it does not accept the token's extensions. The venue's pool splits the setup instead: create first, fund later. Today its creator is the only one who can fund it; creating pools becomes a venue role's job later.",
        apply(venue) {
            venue.pool.status = 'created';
        },
    },
    {
        id: 'set-policy',
        site: 'gate',
        actor: 'The venue',
        prompt: 'Give the gate its rulebook: set the trade policy.',
        action: 'Set trade policy v1',
        done: 'Trade policy v1 is set: credential TSV Investor, United States, KYC under 30 days old, no brokers.',
        detail: 'The policy belongs to the venue, not the issuer. It says who may trade in this pool, and every change gets a new version.',
        apply(venue) {
            venue.policy = {
                version: 1,
                credential: CREDENTIAL,
                schemaVersion: 1,
                jurisdictions: ['US'],
                maxKycAgeDays: 30,
                delegates: [],
            };
        },
    },
    {
        id: 'thaw-vault',
        site: 'issuer',
        actor: 'The issuer',
        prompt: "The pool's stock vault is frozen like any new account. Ask the issuer to thaw it.",
        action: "Thaw the pool's vault",
        done: "The issuer thawed the pool's stock vault. The venue could not have done it alone.",
        detail: "Only the issuer can thaw an account without a credential. The pool's vault is the one account it thaws by hand.",
        apply(venue) {
            venue.pool.vaultThawed = true;
        },
    },
    {
        id: 'fund-pool',
        site: 'pool',
        actor: 'Yuki, liquidity provider',
        prompt: 'Fill the pool: Yuki, who created it, brings 100 TSA and 1,240 USDC.',
        action: 'Fund the pool',
        done: 'The pool is open: 100 TSA and 1,240 USDC, so 1 TSA = 12.40 USDC.',
        detail: 'Funding is a checked trade too: Yuki needed a valid credential to pour in. Only the wallet that created the pool can fund it, once.',
        apply(venue) {
            const tsa = 100;
            const usdc = 1240;
            const lp = initialLp(tsa, usdc);
            venue.pool = { ...venue.pool, status: 'open', tsa, usdc, vaultTsa: tsa, lpSupply: lp };
            venue.wallets.yuki.tsa -= tsa;
            venue.wallets.yuki.usdc -= usdc;
            venue.wallets.yuki.lp += lp;
            venue.now = at(9, 30);
        },
    },
];

const SCENES: Record<SceneId, SceneDef> = {
    rush: {
        id: 'rush',
        title: 'Morning rush',
        captions: [
            'Word gets around. Sora and Mr. Ito add liquidity.',
            'The pool runs the same checks on every one of them.',
        ],
        availability: 'live',
        apply(venue) {
            // The scene settles the two deposits itself, one after the other; this only closes it.
            venue.now = at(9, 52);
        },
    },
    'jordan-kyc': {
        id: 'jordan-kyc',
        title: 'Jordan gets verified',
        captions: [
            'Jordan walks to the credential bureau and passes KYC.',
            'The bureau writes a credential for the wallet: an attestation on chain.',
            "With it, Jordan opens a stock account and thaws it. No one's permission needed: the credential is the key.",
        ],
        availability: 'live',
        apply(venue) {
            venue.now = at(10, 14);
            venue.wallets.jordan.credential = {
                name: CREDENTIAL,
                schemaVersion: 1,
                jurisdiction: 'US',
                verifiedAt: venue.now,
                expiresAt: venue.now + 365 * DAY,
            };
            venue.wallets.jordan.account = 'thawed';
        },
    },
    'revoke-sora': {
        id: 'revoke-sora',
        title: 'A credential is revoked',
        captions: [
            "The bureau reviews Sora's file and revokes the credential.",
            "Sora's stock account stays thawed: nobody froze it again.",
            'Freezing alone would let Sora trade. So the pool checks again, every trade.',
        ],
        availability: 'live',
        apply(venue) {
            venue.now = at(10, 31);
            venue.wallets.sora.credential = undefined;
            venue.wallets.sora.revoked = true;
        },
    },
    'policy-v2': {
        id: 'policy-v2',
        title: 'The policy changes',
        captions: [
            'The venue lists Kenji as a permitted broker: trade policy v2.',
            'Your rulebook updates itself. Old pages never come back.',
        ],
        availability: 'live',
        apply(venue) {
            venue.now = at(11, 26);
            if (venue.policy) venue.policy = { ...venue.policy, version: 2, delegates: ['kenji'] };
        },
    },
    noon: {
        id: 'noon',
        title: 'Noon',
        captions: [
            "The clock strikes twelve. Mr. Ito's credential runs out.",
            'Expired is not revoked. Watch what each may still do.',
        ],
        availability: 'live',
        apply(venue) {
            venue.now = at(12, 1);
        },
    },
    halt: {
        id: 'halt',
        title: 'Trading pause',
        captions: [
            'On the exchange, the price pins to its band: a Limit State.',
            'Fifteen seconds later: a trading pause. The bell rings.',
            'The halt poster sends word. The on-chain record flips to HALTED one to three slots later.',
        ],
        availability: 'review',
        apply(venue) {
            venue.now = at(14, 2);
            venue.market.status = 'halted';
            venue.market.haltCode = 'LUDP';
            venue.market.record = 'halted';
        },
    },
    quiet: {
        id: 'quiet',
        title: 'The feed goes quiet',
        captions: [
            'The exchange resumes, and the record follows: TRADING.',
            'Then the halt poster goes silent. No fresh evidence arrives.',
            'The record still says TRADING. Can you trust it?',
        ],
        availability: 'review',
        apply(venue) {
            venue.now = at(14, 21);
            venue.market.status = 'trading';
            venue.market.haltCode = undefined;
            venue.market.record = 'trading';
            venue.market.evidenceFresh = false;
        },
    },
    'poster-back': {
        id: 'poster-back',
        title: 'The poster is back',
        captions: ['The halt poster recovers. Fresh evidence lands and trading reopens.'],
        availability: 'review',
        apply(venue) {
            venue.now = at(14, 33);
            venue.market.evidenceFresh = true;
        },
    },
    'emergency-pause': {
        id: 'emergency-pause',
        title: 'The emergency role pauses swaps',
        captions: [
            'Something looks wrong. Two of the three emergency signers agree (a demo threshold).',
            'No waiting period: swaps are paused at once.',
            'The emergency role can only protect. It cannot lift its own pause.',
        ],
        availability: 'planned',
        apply(venue) {
            venue.now = at(15, 4);
            venue.swapsPaused = true;
        },
    },
    'operations-lift': {
        id: 'operations-lift',
        title: 'Operations lifts the pause',
        captions: [
            'Lifting a pause is the operations role: two of three, then a time lock (demo values).',
            'The lock runs out. Swaps are allowed again.',
        ],
        availability: 'planned',
        apply(venue) {
            venue.now = at(15, 16);
            venue.swapsPaused = false;
        },
    },
    recovery: {
        id: 'recovery',
        title: 'The issuer recovers stock',
        captions: [
            "A court order: the issuer pulls 20 TSA out of the pool's vault with its recovery power.",
            'Anyone may reconcile the books. They now record the shortfall, and the pool is flagged.',
        ],
        availability: 'planned',
        apply(venue) {
            venue.now = at(15, 24);
            venue.pool.vaultTsa -= 20;
            venue.pool.flagged = true;
        },
    },
    reconcile: {
        id: 'reconcile',
        title: 'Made whole',
        captions: [
            'The issuer returns the stock, and the books are reconciled again.',
            'Operations lifts the flag. A lift never overrides a real shortfall.',
        ],
        availability: 'planned',
        apply(venue) {
            venue.now = at(15, 37);
            venue.pool.vaultTsa = venue.pool.tsa;
            venue.pool.flagged = false;
        },
    },
    budget: {
        id: 'budget',
        title: 'The daily budget',
        captions: [
            "The order caps a venue's average daily volume in a stock, as a share of the stock's volume on the market.",
            "To stay under it, the venue gives each day a budget in shares: today's is 6 (a demo value).",
        ],
        availability: 'planned',
        apply(venue) {
            venue.now = at(15, 42);
        },
    },
    closing: {
        id: 'closing',
        title: 'Closing bell',
        captions: [
            'Four o’clock. The exchange rings the close.',
            'Night falls. Every fill and every refusal of the day is on chain, where the indexer and the archive can read it.',
        ],
        availability: 'live',
        apply(venue) {
            venue.now = at(16, 0);
        },
    },
};

const CASES: CaseDef[] = [
    {
        id: 'hana-buy',
        time: at(9, 41),
        request: own('hana', 'buy', 10),
        greeting: 'Morning! Ten dollars of Test Stock A, please.',
        say: {
            account: 'Here, my stock account.',
            kyc: 'Of course. Fresh from the bureau.',
            filled: 'Thank you! Lovely pool you have.',
            refused: 'Oh. What did I miss?',
        },
        expect: { outcome: 'fill' },
        hint: 'Ask for her account and her credential. Compare each line with the rulebook: thawed, valid today, United States.',
        lesson: 'Thawed account, valid credential, accepted jurisdiction: the pool fills. About 0.80 TSA for 10 USDC.',
    },
    {
        id: 'jordan-first',
        time: at(10, 3),
        request: own('jordan', 'buy', 25),
        greeting: "Hi! First time here. I'd like 25 dollars of the stock.",
        say: {
            account: 'I just opened it. It came like this.',
            kyc: "KYC? I… don't have one of those.",
            filled: 'Wait, really? Yay!',
            refused: 'Oh no. Where do I get a credential?',
        },
        expect: { outcome: 'refuse', reason: 'account-frozen' },
        hint: 'Two things are wrong. The pool cites the first one it meets: the account, before any credential.',
        lesson: 'A new stock account starts frozen, and the pool refuses a frozen account before it reads any credential: 7000.',
    },
    {
        id: 'jordan-back',
        time: at(10, 19),
        request: own('jordan', 'buy', 25),
        greeting: "I'm back! The bureau was really nice.",
        say: {
            account: 'Thawed it myself, with the credential.',
            kyc: 'Ta-da. Issued today.',
            filled: 'My first shares!',
            refused: 'But I did everything…',
        },
        expect: { outcome: 'fill' },
        hint: 'Same person, new papers. Check them like anyone else.',
        lesson: "A credential thawed the account without anyone's sign-off, and the pool found it valid: filled.",
    },
    {
        id: 'sora-sell',
        time: at(10, 36),
        request: own('sora', 'sell', 5),
        greeting: 'Selling five shares. Quick, please.',
        say: {
            account: 'Thawed since this morning. See?',
            kyc: 'I… had one. Look, the account still works!',
            filled: 'Ha. Told you.',
            refused: 'But my account is thawed!',
        },
        expect: { outcome: 'refuse', reason: 'credential-missing' },
        hint: 'The account is still thawed. Is that enough? Ask for the credential.',
        lesson: 'The account stayed thawed after the revocation. The pool reads the credential on every trade, so it still refuses: 7001.',
    },
    {
        id: 'lukas-buy',
        time: at(10, 52),
        request: own('lukas', 'buy', 40),
        greeting: 'Guten Tag. Forty dollars of the stock, please.',
        say: {
            account: 'The issuer thawed it last week.',
            kyc: 'Here. Valid until next year.',
            filled: 'Wunderbar.',
            refused: 'But the issuer accepted me?',
        },
        expect: { outcome: 'refuse', reason: 'jurisdiction' },
        hint: "Everything is valid. Now read the credential's jurisdiction, and what the policy accepts.",
        lesson: 'Two gates: the issuer decides who may hold, the venue who may trade here. Policy v1 accepts the United States only: 7000.',
    },
    {
        id: 'priya-buy',
        time: at(11, 8),
        request: own('priya', 'buy', 15),
        greeting: 'Fifteen dollars of TSA. I trade here all the time.',
        say: {
            account: 'Same account as always.',
            kyc: 'It runs until next autumn. Plenty of time.',
            filled: 'See you tomorrow!',
            refused: 'It has not even expired!',
        },
        expect: { outcome: 'refuse', reason: 'kyc-too-old' },
        hint: 'Not expired. But when was the KYC check done? The policy has a maximum age.',
        lesson: 'The credential has not expired, but the KYC behind it is 45 days old and the policy wants it under 30: 7001.',
    },
    {
        id: 'kenji-first',
        time: at(11, 19),
        request: { op: 'buy', signer: 'kenji', owner: 'hana', amount: 20 },
        greeting: 'Kenji, broker. Buying twenty dollars of TSA for my client Hana.',
        say: {
            account: "Hana's account. I sign, she owns.",
            kyc: 'Both of ours. Hers and mine.',
            authority: 'Her approval, signed. I may move her tokens.',
            filled: 'A pleasure doing business.',
            refused: 'Hana approved me. Is that not enough?',
        },
        expect: { outcome: 'refuse', reason: 'delegate-not-listed' },
        hint: 'A broker needs three things: the owner’s approval, his own credential, and a place on the policy’s list.',
        lesson: "Hana approved him and his credential is valid, but policy v1 lists no brokers: 7000. The owner's say-so is not the venue's.",
    },
    {
        id: 'kenji-back',
        time: at(11, 31),
        request: { op: 'buy', signer: 'kenji', owner: 'hana', amount: 20 },
        greeting: 'Kenji again. I hear the policy changed.',
        say: {
            account: "Hana's account, as before.",
            kyc: 'Still both valid.',
            authority: 'Same approval.',
            filled: 'Excellent. Hana will be pleased.',
            refused: 'Again?',
        },
        expect: { outcome: 'fill' },
        hint: 'Read the rulebook again: it is version 2 now.',
        lesson: 'Approved by the owner, listed by the policy, credentialed himself: the broker trades. The shares land in Hana’s account.',
    },
    {
        id: 'ito-sell',
        time: at(12, 6),
        request: own('ito', 'sell', 3),
        greeting: 'Good day. I would like to sell three shares.',
        say: {
            account: 'Thawed, as it has been for weeks.',
            kyc: 'Here you are. A fine credential.',
            filled: 'Most kind.',
            refused: 'Expired? At noon? Oh dear.',
        },
        expect: { outcome: 'refuse', reason: 'credential-expired' },
        hint: 'Compare the expiry on the credential with the clock.',
        lesson: 'The credential expired at noon. A sale is a trade, and a trade needs a valid credential: 7001.',
    },
    {
        id: 'ito-exit',
        time: at(12, 12),
        request: own('ito', 'withdraw', 0.5),
        greeting: 'Then may I at least take half my liquidity out of the pool?',
        say: {
            account: 'The same account.',
            kyc: 'The same credential. Still expired, I fear.',
            filled: 'Thank you. I shall renew it tomorrow.',
            refused: 'So my savings are stuck?',
        },
        expect: { outcome: 'fill' },
        hint: 'A withdrawal is an exit, not a trade. Read what the rulebook says about exits.',
        lesson: 'A controlled exit: an expired credential may still withdraw its own share. Expiry is a lapse, not a reason to hold property.',
    },
    {
        id: 'sora-exit',
        time: at(12, 24),
        request: own('sora', 'withdraw', 1),
        greeting: 'Fine. If I cannot sell, I withdraw my liquidity.',
        say: {
            account: 'Thawed. Still.',
            kyc: 'You know I have none.',
            filled: 'Finally.',
            refused: 'Mr. Ito got his out!',
        },
        expect: { outcome: 'refuse', reason: 'credential-missing' },
        hint: 'Mr. Ito’s credential had expired. What happened to Sora’s?',
        lesson: 'Revoked is not expired. A revocation is a reason the holder must not receive the security, so the withdrawal is held: 7001.',
    },
    {
        id: 'hana-halted',
        time: at(14, 5),
        request: own('hana', 'buy', 10),
        greeting: 'Ten dollars more, please. Why is the bell ringing?',
        say: { account: 'Here you go.', kyc: 'Still valid!', filled: 'Thanks!', refused: 'Halted? Everywhere?' },
        expect: { outcome: 'refuse', reason: 'symbol-halted' },
        hint: 'Before any paper: look at the halt board.',
        lesson: 'Restrictions come first: a halted symbol is refused for everyone, before any credential is read: 7004.',
    },
    {
        id: 'yuki-exit',
        time: at(14, 11),
        request: own('yuki', 'withdraw', 2),
        greeting: 'I need some of my liquidity back. Is that still possible?',
        say: {
            account: 'My account, thawed.',
            kyc: 'Valid, as always.',
            filled: 'Good. An exit should always be open.',
            refused: 'Even withdrawals? That seems harsh.',
        },
        expect: { outcome: 'fill' },
        hint: 'The symbol is halted. Does a halt stop a withdrawal?',
        lesson: 'Withdrawals never read halts. A halt stops new trading, not people leaving with what is theirs.',
    },
    {
        id: 'jordan-stale',
        time: at(14, 26),
        request: own('jordan', 'sell', 0.5),
        greeting: 'The board says TRADING again! Half a share to sell, please.',
        say: {
            account: 'All thawed.',
            kyc: 'Still brand new.',
            filled: 'Sold!',
            refused: 'But it says TRADING right there!',
        },
        expect: { outcome: 'refuse', reason: 'inputs-stale' },
        hint: 'The board says TRADING. How old is that news? Check its hourglass.',
        lesson: 'The evidence is too old to trust, so the state is unknown, and unknown counts as halted. The venue fails closed: 7007.',
    },
    {
        id: 'hana-paused',
        time: at(15, 8),
        request: own('hana', 'sell', 2),
        greeting: 'Selling two shares before the close.',
        say: { account: 'Here.', kyc: 'Valid.', filled: 'Thanks!', refused: 'Paused by whom?' },
        expect: { outcome: 'refuse', reason: 'venue-paused' },
        hint: 'Look at the gate itself: the venue hung a sign on it. The Venue notice in your rulebook says the same.',
        lesson: 'The emergency role paused swaps. Which refusal code a venue pause carries is not settled yet; the trade is refused all the same.',
    },
    {
        id: 'ito-paused',
        time: at(15, 11),
        request: own('ito', 'withdraw', 0.5),
        greeting: 'Such commotion! I would like the rest of my liquidity, please.',
        say: {
            account: 'Thawed, as ever.',
            kyc: 'Expired since noon, I am afraid.',
            filled: 'Thank you. An open door is a comfort.',
            refused: 'But you let me out at noon!',
        },
        expect: { outcome: 'fill' },
        hint: 'Two red flags: the pause on the gate and his expired credential. Read what each one does to a withdrawal.',
        lesson: 'The pause stops swaps and an expired credential stops trades. A withdrawal is neither: exits stay open, so the pool pays him out.',
    },
    {
        id: 'yuki-short',
        time: at(15, 28),
        request: own('yuki', 'withdraw', 2),
        greeting: 'One more withdrawal, please. Two of my shares of the pool.',
        say: { account: 'Thawed.', kyc: 'Valid.', filled: 'Thank you.', refused: 'You let me out during the halt!' },
        expect: { outcome: 'refuse', reason: 'out-of-balance' },
        hint: 'Compare what the vault holds with what the books record.',
        lesson: 'The vault holds less than the books say, and the pool is flagged. Until the vault is whole and the flag lifted, nothing moves, withdrawals included, or the first out would be paid with the others’ money: 7009.',
    },
    {
        id: 'ben-budget',
        time: at(15, 46),
        request: own('ben', 'buy', 25),
        greeting: 'Twenty-five dollars of TSA. All at once. Chop chop.',
        say: {
            account: 'Thawed and ready.',
            kyc: 'Platinum-grade credential.',
            filled: 'That is how it is done.',
            refused: 'A budget? For twenty-five dollars?',
        },
        expect: { outcome: 'refuse', reason: 'budget-exceeded' },
        hint: 'His papers are perfect. How many shares would he receive, and how many are left in today’s budget?',
        lesson: 'His papers are perfect, but 1.83 more shares would cross the stock’s daily budget of 6: 7008. The refusal writes nothing, so no breach occurred.',
    },
    {
        id: 'hana-last',
        time: at(15, 54),
        request: own('hana', 'buy', 10),
        greeting: 'Last one of the day, I promise. Ten dollars.',
        say: {
            account: 'You know it by heart.',
            kyc: 'And this.',
            filled: 'See you tomorrow, gatekeeper!',
            refused: 'Really? Today of all days?',
        },
        expect: { outcome: 'fill' },
        hint: 'Every brake is off again. Check the papers one last time.',
        lesson: 'Nothing restricts the pool, the books balance, the papers are valid and the budget has room: filled.',
    },
];

const chapter = (id: keyof typeof CHAPTERS): Beat => ({ kind: 'chapter', chapter: CHAPTERS[id] as ChapterDef });
const scene = (id: SceneId): Beat => ({ kind: 'scene', scene: SCENES[id] });
const visitor = (id: string): Beat => {
    const found = CASES.find((item) => item.id === id);
    if (!found) throw new Error(`unknown case ${id}`);
    return { kind: 'case', case: found };
};

/** The whole day, in order. */
export const DAY_BEATS: readonly Beat[] = [
    chapter('setup'),
    ...SETUP.map((step): Beat => ({ kind: 'setup', step })),
    chapter('eligibility'),
    visitor('hana-buy'),
    scene('rush'),
    visitor('jordan-first'),
    scene('jordan-kyc'),
    visitor('jordan-back'),
    scene('revoke-sora'),
    visitor('sora-sell'),
    visitor('lukas-buy'),
    visitor('priya-buy'),
    chapter('exits'),
    visitor('kenji-first'),
    scene('policy-v2'),
    visitor('kenji-back'),
    scene('noon'),
    visitor('ito-sell'),
    visitor('ito-exit'),
    visitor('sora-exit'),
    chapter('halts'),
    scene('halt'),
    visitor('hana-halted'),
    visitor('yuki-exit'),
    scene('quiet'),
    visitor('jordan-stale'),
    scene('poster-back'),
    chapter('brakes'),
    scene('emergency-pause'),
    visitor('hana-paused'),
    visitor('ito-paused'),
    scene('operations-lift'),
    scene('recovery'),
    visitor('yuki-short'),
    scene('reconcile'),
    scene('budget'),
    visitor('ben-budget'),
    visitor('hana-last'),
    scene('closing'),
];

export const CHAPTER_LIST: readonly ChapterDef[] = Object.values(CHAPTERS);
export const CASE_COUNT = CASES.length;

/** Applies a beat's effect on the venue, without judging anything. Cases set the clock; their trade is settled by the game after the verdict. */
export function applyBeat(venue: Venue, beat: Beat): void {
    switch (beat.kind) {
        case 'chapter':
            beat.chapter.apply?.(venue);
            break;
        case 'setup':
            beat.step.apply(venue);
            break;
        case 'scene':
            if (beat.scene.id === 'rush') settleRush(venue);
            beat.scene.apply(venue);
            break;
        case 'case':
            venue.now = beat.case.time;
            // The simulated exchange quotes what the pool trades at; the halts design's price band is not modelled.
            if (venue.pool.status === 'open' && venue.market.status === 'trading')
                venue.market.price = Math.round((venue.pool.usdc / venue.pool.tsa) * 100) / 100;
            break;
    }
}
