/**
 * What each place in the town stands for in the real venue: shown on name
 * tags and on the card that opens when the player clicks a place.
 */
import type { Availability } from '../sim/types.ts';
import type { PlaceId } from '../world/world.ts';

export type Kind = 'actor' | 'service' | 'contract' | 'chain';

export interface PlaceInfo {
    id: PlaceId;
    /** The name on the tag. */
    title: string;
    /** A few words under it. */
    sub: string;
    kind: Kind;
    /** What it is in the venue, in plain words. */
    what: string;
    /** What it does during the day, as short points. */
    does: string[];
    /** The real component it stands for. */
    real: string;
    availability: Availability | 'mock';
    /** Where it stands today, in a few words. */
    standing: string;
}

export const PLACES: Record<PlaceId, PlaceInfo> = {
    issuer: {
        id: 'issuer',
        title: 'Mint house',
        sub: 'the issuer',
        kind: 'actor',
        what: 'The company behind the stock. It issues Test Stock A as a token and keeps control of it.',
        does: [
            'Creates the stock: every new account starts frozen.',
            "Thaws the pool's vault, the one account it thaws by hand.",
            'Can pause all transfers and recover tokens from any account.',
        ],
        real: 'A Token-2022 mint with default-frozen accounts, Pausable, a permanent delegate and scaled amounts. Token ACL manages its freeze authority.',
        availability: 'live',
        standing: 'Live on main',
    },
    bureau: {
        id: 'bureau',
        title: 'Credential bureau',
        sub: 'KYC provider',
        kind: 'actor',
        what: 'The KYC provider. It verifies a person and writes a credential for their wallet.',
        does: [
            'Issues credentials: who, which jurisdiction, valid until when.',
            'Revokes them: the attestation is closed on chain.',
            'A valid credential lets its holder thaw their own stock account.',
        ],
        real: 'A credential issuer on the Solana Attestation Service (SAS). The eligibility gate reads its attestations to decide thaws.',
        availability: 'live',
        standing: 'Live on main · the KYC form itself is mocked',
    },
    gate: {
        id: 'gate',
        title: 'The gate',
        sub: "the pool's checks",
        kind: 'contract',
        what: 'You. The pool program checks every trade before it settles, in a fixed order. The first failing check refuses the trade with its code.',
        does: [
            'Step 1: restrictions. Step 2: balance. Step 3: eligibility. Step 4: pricing. Step 5: settlement.',
            'Reads the trade policy: accepted credential, jurisdictions, KYC age, brokers.',
            'A refusal writes nothing, and still lands on chain with its code.',
        ],
        real: 'The checks inside the vendored constant-product pool program (cpmm-pool) and its trade policy account.',
        availability: 'live',
        standing: 'Eligibility is live on main · other steps are in review or planned',
    },
    pool: {
        id: 'pool',
        title: 'The pool',
        sub: 'TSA / USDC',
        kind: 'contract',
        what: 'A permissioned pool where eligible participants trade one tokenized stock against USDC.',
        does: [
            'Holds two vaults: stock and dollars.',
            'Prices from its reserves: more dollars in, the stock costs more.',
            'Liquidity providers own a share of it and can withdraw that share.',
        ],
        real: 'A constant-product pool (Raydium CPMM, vendored and extended) with a split setup: create, issuer thaw, fund.',
        availability: 'live',
        standing: 'Live on main',
    },
    council: {
        id: 'council',
        title: 'Council hall',
        sub: 'role multisigs',
        kind: 'actor',
        what: "The venue's own governance: four roles, each a multisig with its own threshold and time lock.",
        does: [
            'Emergency: can pause, at once. Cannot lift its own pause.',
            'Operations: lifts pauses and collects fees, after a wait.',
            'Structural: creates pools. Upgrade: the programs themselves.',
        ],
        real: 'Four Squads multisigs. On main today a single venue admin key sets the trade policy; which role will own it is not settled.',
        availability: 'planned',
        standing: 'Planned · thresholds here are demo values',
    },
    exchange: {
        id: 'exchange',
        title: 'The exchange',
        sub: 'primary market',
        kind: 'actor',
        what: "The stock's primary listing market. When it halts trading in the symbol, the venue must stop too.",
        does: [
            'Publishes halts and resumptions on the consolidated tape.',
            'A price pinned to its band for 15 seconds becomes a trading pause.',
            'The venue resumes only on its resumption message, never on a timer.',
        ],
        real: 'A national securities exchange and the SIP feed. Simulated here: no real market data.',
        availability: 'mock',
        standing: 'Simulated feed',
    },
    haltBoard: {
        id: 'haltBoard',
        title: 'Halt board',
        sub: 'on-chain record',
        kind: 'service',
        what: "The on-chain record of the symbol's trading state, kept fresh by the halt poster.",
        does: [
            'The pool reads it on every swap and deposit.',
            'Halted: refused with 7004.',
            'Evidence too old: the record cannot be trusted, refused with 7007.',
        ],
        real: 'The halt poster service and the symbol record account of the halts design.',
        availability: 'review',
        standing: 'In review · PR #101',
    },
    archive: {
        id: 'archive',
        title: 'The archive',
        sub: 'decision archive',
        kind: 'service',
        what: 'Keeps every venue decision with the state it depended on, so it can be rebuilt years later.',
        does: ['Records every venue transaction, failed or not.', 'Stores the account versions each one read.'],
        real: 'services/archive, fed by a Yellowstone gRPC stream.',
        availability: 'live',
        standing: 'Validation draft on main, local only',
    },
    indexer: {
        id: 'indexer',
        title: 'Indexer & feed',
        sub: 'records and the feed',
        kind: 'service',
        what: 'Reads finalized blocks and records pools, fills, liquidity, credentials and refusals for the apps.',
        does: [
            'Feeds the apps and their activity screens.',
            'The public feed (planned) will show fills only, in dollars, within 10 minutes.',
            'Refusals are kept by the indexer and the archive, not published on the feed.',
        ],
        real: 'services/indexer with its read API. The public transparency feed is planned.',
        availability: 'live',
        standing: 'Indexer live on localnet · public feed planned',
    },
    chain: {
        id: 'chain',
        title: 'The chain',
        sub: 'Solana',
        kind: 'chain',
        what: 'Blocks follow one another. Every trade the venue sees boards one, filled or refused.',
        does: [
            'A fill moves tokens and emits a fill event.',
            'A refusal lands with its code and changes nothing else.',
            'Slots are slowed down here: real ones take about 0.4 seconds.',
        ],
        real: 'Solana: a local validator for the demos, msl-stagenet for the hosted ones.',
        availability: 'live',
        standing: 'Simulated in this game: nothing here touches a chain',
    },
};

export const AVAILABILITY_LABEL: Record<Availability | 'mock', string> = {
    live: 'Live on main',
    review: 'In review',
    planned: 'Planned',
    mock: 'Simulated',
};
