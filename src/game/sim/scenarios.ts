/**
 * Manager mode's scenarios: the venue in a given state, an order to carry
 * out, and the trades that prove it done. Each objective is judged by the
 * pool's own checks, so a scenario is solved exactly when the venue would
 * behave as asked. Guard rails are objectives that hold at the start and
 * must keep holding.
 *
 * Every scenario carries where its rules stand in solana-tsv, and a
 * reference solution the tests replay.
 */
import type { ActionArgs, ActionId } from './actions.ts';
import { at } from './campaign.ts';
import {
    baseTown,
    days,
    emptyListing,
    type Objective,
    type Park,
    type StockId,
} from './park.ts';
import type { Availability, TradeRequest, WalletId } from './types.ts';

export type ScenarioId =
    | 'no-kyc'
    | 'germany'
    | 'broker'
    | 'grand-opening'
    | 'feed-quiet'
    | 'sec-suspension'
    | 'wrong-account'
    | 'free';

export interface ScenarioStep {
    action: ActionId;
    args: ActionArgs;
}

export interface ScenarioDef {
    id: ScenarioId;
    /** 0 for free play. */
    number: number;
    title: string;
    /** Who the order comes from, for the card's kicker. */
    from: string;
    /** The situation and the order, in two or three sentences. */
    brief: string;
    /** Where the rules it turns on stand: the least built of them. */
    availability: Availability;
    standing: string;
    difficulty: 1 | 2 | 3;
    /** The stocks whose pools stand in town, in order. */
    stocks: StockId[];
    start(): Park;
    objectives: Objective[];
    /** The fewest actions that solve it. */
    par: number;
    /** One way to solve it, for the tests. */
    solution: ScenarioStep[];
    /** Nudges, from gentle to plain. */
    hints: string[];
    /** What it teaches, shown when it is solved. */
    lesson: string;
    music: 'morning' | 'day' | 'tense' | 'dusk';
    /** Free play: every action, no objectives. */
    sandbox?: boolean;
}

const own = (who: WalletId, op: TradeRequest['op'], amount: number): TradeRequest => ({
    op,
    signer: who,
    owner: who,
    amount,
});

const SCENARIOS: ScenarioDef[] = [
    {
        id: 'no-kyc',
        number: 1,
        title: 'No KYC, no trade',
        from: 'At the gate',
        brief: 'Jordan, a new investor, wants 25 USDC of Test Stock A, and the pool keeps saying no. The venue cannot waive KYC. Get Jordan in the proper way.',
        availability: 'live',
        standing: 'Live on main: credentials, thaws and eligibility.',
        difficulty: 1,
        stocks: ['TSA'],
        start: () => baseTown(at(10, 0), ['TSA']),
        objectives: [
            {
                kind: 'trade',
                id: 'jordan-buys',
                label: 'Jordan buys 25 USDC of TSA',
                stock: 'TSA',
                request: own('jordan', 'buy', 25),
                expect: 'fill',
            },
        ],
        par: 2,
        solution: [
            { action: 'verify', args: { who: 'jordan' } },
            { action: 'holder-thaw', args: { who: 'jordan', stock: 'TSA' } },
        ],
        hints: [
            'Read why the pool refuses: it stops at the frozen account (7000) before it reads any credential.',
            'The credential bureau verifies people and writes their credentials.',
            'With a credential, Jordan can thaw the stock account at the mint house: nobody else needs to sign.',
        ],
        lesson: 'Nobody can waive KYC. The bureau verified Jordan, and the new credential let Jordan thaw the account, a thaw anyone may send while the issuer’s holding policy accepts the credential. A thaw by the issuer’s hand would not have been enough: the pool still reads the credential on every trade.',
        music: 'day',
    },
    {
        id: 'germany',
        number: 2,
        title: 'Germany, on one pool',
        from: 'Counsel',
        brief: 'Counsel has cleared investors in Germany for Test Stock C, and for C only. Lukas, in Germany, wants to buy C, and so does Priya, whose KYC check is 45 days old. Every other rule stays as it is.',
        availability: 'live',
        standing: 'Live on main: per-pool trade policies and one credential per wallet.',
        difficulty: 2,
        stocks: ['TSA', 'TSC'],
        start() {
            const park = baseTown(at(10, 30), ['TSA', 'TSC']);
            park.people.lukas.holdings.TSC.account = 'none';
            park.people.lukas.holdings.TSC.shares = 0;
            const priya = park.people.priya.credential;
            if (priya) priya.verifiedAt = park.now - days(45);
            return park;
        },
        objectives: [
            {
                kind: 'trade',
                id: 'lukas-tsc',
                label: 'Lukas buys 20 USDC of TSC',
                stock: 'TSC',
                request: own('lukas', 'buy', 20),
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'priya-tsc',
                label: 'Priya buys 15 USDC of TSC',
                stock: 'TSC',
                request: own('priya', 'buy', 15),
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'lukas-tsa',
                label: 'Lukas still cannot buy TSA',
                stock: 'TSA',
                request: own('lukas', 'buy', 20),
                expect: 'refuse',
                keep: true,
            },
            {
                kind: 'state',
                id: 'tsc-policy',
                label: "TSC's policy changes only to admit Germany",
                test: (park) => {
                    const policy = park.listings.TSC?.policy;
                    if (!policy) return false;
                    const places = [...policy.jurisdictions].sort().join();
                    return (
                        policy.maxKycAgeDays === 30 &&
                        policy.delegates.length === 0 &&
                        (places === 'US' || places === 'DE,US')
                    );
                },
                keep: true,
            },
        ],
        par: 3,
        solution: [
            { action: 'set-policy', args: { stock: 'TSC', policy: { jurisdictions: ['US', 'DE'], maxKycAgeDays: 30, delegates: [] } } },
            { action: 'holder-thaw', args: { who: 'lukas', stock: 'TSC' } },
            { action: 'verify', args: { who: 'priya' } },
        ],
        hints: [
            "Each pool has its own trade policy. Open the gate and pick TSC's.",
            'Lukas has never held TSC: his account for it does not exist yet.',
            "Priya's credential has not expired, but her KYC check is too old. Renew it rather than loosen the policy.",
        ],
        lesson: "TSC's policy now accepts Germany while TSA's stays US-only: each pool reads its own. The issuer had already accepted Lukas as a holder, so his credential thawed his account; the venue decides who may trade. Priya's one renewed credential counts in every pool at once.",
        music: 'day',
    },
    {
        id: 'broker',
        number: 3,
        title: 'A broker for Hana',
        from: 'Kenji, broker',
        brief: 'Hana wants Kenji, her broker, to trade Test Stock B for her. Kenji is trying to buy 10 USDC of TSB on her behalf and the pool refuses. Make it work, without letting Kenji near anyone else’s account, or near TSA.',
        availability: 'live',
        standing: 'Live on main: delegates need the owner’s approval and the policy’s list.',
        difficulty: 2,
        stocks: ['TSA', 'TSB'],
        start() {
            const park = baseTown(at(11, 0), ['TSA', 'TSB']);
            const kenji = park.people.kenji.credential;
            if (kenji) kenji.verifiedAt = park.now - days(31);
            return park;
        },
        objectives: [
            {
                kind: 'trade',
                id: 'kenji-hana-tsb',
                label: 'Kenji buys 10 USDC of TSB for Hana',
                stock: 'TSB',
                request: { op: 'buy', signer: 'kenji', owner: 'hana', amount: 10 },
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'kenji-priya-tsb',
                label: 'Kenji cannot trade for Priya',
                stock: 'TSB',
                request: { op: 'buy', signer: 'kenji', owner: 'priya', amount: 10 },
                expect: 'refuse',
                keep: true,
            },
            {
                kind: 'trade',
                id: 'kenji-hana-tsa',
                label: 'Kenji cannot trade TSA for Hana',
                stock: 'TSA',
                request: { op: 'buy', signer: 'kenji', owner: 'hana', amount: 20 },
                expect: 'refuse',
                keep: true,
            },
            {
                kind: 'state',
                id: 'tsb-age',
                label: 'TSB still wants KYC under 30 days',
                test: (park) => (park.listings.TSB?.policy?.maxKycAgeDays ?? 0) <= 30,
                keep: true,
            },
        ],
        par: 3,
        solution: [
            { action: 'approve', args: { who: 'hana', broker: 'kenji' } },
            { action: 'set-policy', args: { stock: 'TSB', policy: { jurisdictions: ['US'], maxKycAgeDays: 30, delegates: ['kenji'] } } },
            { action: 'verify', args: { who: 'kenji' } },
        ],
        hints: [
            'A broker needs three things. Read the refusal after each fix: the pool names the next one.',
            "The owner's approval is Hana's to sign, from her wallet. The venue's list is the TSB policy's.",
            "A broker's own credential is checked too, and Kenji's KYC is 31 days old: renew it rather than loosen the policy.",
        ],
        lesson: "Hana's approval says Kenji may sign for her; TSB's policy says the venue accepts him as a broker; his own credential says who he is. TSA's policy never listed him, so he stays out of TSA, and Priya never approved him.",
        music: 'day',
    },
    {
        id: 'grand-opening',
        number: 4,
        title: 'Grand opening: Test Stock D',
        from: 'The issuer',
        brief: 'The issuer is ready to bring Test Stock D to the venue. There is no stock, no pool and no policy yet. Open a TSD/USDC pool from nothing, so that Hana can buy 10 USDC of TSD.',
        availability: 'live',
        standing: 'Live on main: the split pool setup.',
        difficulty: 3,
        stocks: ['TSA', 'TSD'],
        start() {
            const park = baseTown(at(9, 0), ['TSA']);
            park.listings.TSD = emptyListing('TSD', { yuki: 400 });
            return park;
        },
        objectives: [
            {
                kind: 'trade',
                id: 'hana-tsd',
                label: 'Hana buys 10 USDC of TSD',
                stock: 'TSD',
                request: own('hana', 'buy', 10),
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'hana-tsa',
                label: 'TSA keeps trading',
                stock: 'TSA',
                request: own('hana', 'buy', 10),
                expect: 'fill',
                keep: true,
            },
        ],
        par: 6,
        solution: [
            { action: 'create-stock', args: { stock: 'TSD' } },
            { action: 'create-pool', args: { stock: 'TSD' } },
            { action: 'set-policy', args: { stock: 'TSD', policy: { jurisdictions: ['US'], maxKycAgeDays: 30, delegates: [] } } },
            { action: 'thaw-vault', args: { stock: 'TSD' } },
            { action: 'fund-pool', args: { stock: 'TSD' } },
            { action: 'holder-thaw', args: { who: 'hana', stock: 'TSD' } },
        ],
        hints: [
            'Start at the mint house: a pool needs a stock.',
            "Then: create the pool, give it a policy, have the issuer thaw the pool's vault, and fund it. Funding is checked too.",
            'Hana has never held TSD. Her account for it starts frozen like everyone’s.',
        ],
        lesson: "The split setup: create the stock, create the pool, set its policy, have the issuer thaw its vault, fund it. The venue could not thaw the vault alone, and funding without a policy or before the thaw fails. Every new stock's accounts start frozen, Hana's included.",
        music: 'morning',
    },
    {
        id: 'feed-quiet',
        number: 5,
        title: 'The feed goes quiet',
        from: 'Operations desk',
        brief: 'The halt poster has gone silent: no fresh evidence reaches the chain, so every pool fails closed. Meanwhile the exchange paused Test Stock C. Get the venue trading again, wherever the exchange is trading.',
        availability: 'planned',
        standing: 'Planned: the halt poster service. The halts and the fresh-evidence check (7007) are in review, pull request #101.',
        difficulty: 1,
        stocks: ['TSA', 'TSB', 'TSC'],
        start() {
            const park = baseTown(at(14, 20), ['TSA', 'TSB', 'TSC'], { halts: true });
            park.poster = false;
            for (const listing of Object.values(park.listings)) if (listing) listing.market.evidenceFresh = false;
            const tsc = park.listings.TSC;
            if (tsc) {
                tsc.market.status = 'halted';
                tsc.market.haltCode = 'LUDP';
            }
            return park;
        },
        objectives: [
            {
                kind: 'trade',
                id: 'tsa-trades',
                label: 'Hana buys 10 USDC of TSA',
                stock: 'TSA',
                request: own('hana', 'buy', 10),
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'tsb-trades',
                label: 'Hana buys 10 USDC of TSB',
                stock: 'TSB',
                request: own('hana', 'buy', 10),
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'tsc-halted',
                label: 'TSC stays stopped while the exchange halts it',
                stock: 'TSC',
                request: own('hana', 'buy', 10),
                expect: 'refuse',
                keep: true,
            },
            {
                kind: 'trade',
                id: 'tsc-exit',
                label: 'Yuki can still withdraw from TSC',
                stock: 'TSC',
                request: own('yuki', 'withdraw', 0.5),
                expect: 'fill',
                keep: true,
            },
        ],
        par: 1,
        solution: [{ action: 'restart-poster', args: {} }],
        hints: [
            'Every pool refuses with 7007: the halt evidence is stale. Unknown counts as halted.',
            'The halt board is where the poster posts.',
        ],
        lesson: 'Without fresh evidence the venue fails closed everywhere (7007). Restoring the poster reopened TSA and TSB, and TSC turned to a proper halt (7004): the venue follows the exchange, and no role can lift a halt the primary market posted. Withdrawals never stopped.',
        music: 'tense',
    },
    {
        id: 'sec-suspension',
        number: 6,
        title: 'The SEC suspends Test Stock B',
        from: 'Compliance',
        brief: 'The SEC has suspended trading in Test Stock B, and the exchange stopped it. The feed did not carry the suspension, so the on-chain record still says TRADING. The venue must stop with the primary market: stop TSB, and only TSB.',
        availability: 'review',
        standing: 'In review: venue holds on the halt record, pull request #101. The role multisigs are planned.',
        difficulty: 2,
        stocks: ['TSA', 'TSB', 'TSC'],
        start() {
            const park = baseTown(at(14, 5), ['TSA', 'TSB', 'TSC'], { halts: true });
            const tsb = park.listings.TSB;
            if (tsb) {
                tsb.market.status = 'halted';
                tsb.market.haltCode = 'SEC';
            }
            return park;
        },
        objectives: [
            {
                kind: 'trade',
                id: 'tsb-no-swaps',
                label: 'Hana cannot buy TSB',
                stock: 'TSB',
                request: own('hana', 'buy', 10),
                expect: 'refuse',
            },
            {
                kind: 'trade',
                id: 'tsb-no-deposits',
                label: 'No new liquidity in TSB',
                stock: 'TSB',
                request: own('yuki', 'deposit', 0.5),
                expect: 'refuse',
            },
            {
                kind: 'state',
                id: 'tsb-reason',
                label: 'The record says why: a regulatory hold on TSB',
                test: (park) => park.listings.TSB?.holds.includes('regulatory') === true,
            },
            {
                kind: 'trade',
                id: 'tsb-exit',
                label: 'Yuki can still withdraw from TSB',
                stock: 'TSB',
                request: own('yuki', 'withdraw', 0.5),
                expect: 'fill',
                keep: true,
            },
            {
                kind: 'trade',
                id: 'tsa-open',
                label: 'TSA keeps trading',
                stock: 'TSA',
                request: own('hana', 'buy', 10),
                expect: 'fill',
                keep: true,
            },
            {
                kind: 'trade',
                id: 'tsc-open',
                label: 'TSC keeps trading',
                stock: 'TSC',
                request: own('hana', 'buy', 10),
                expect: 'fill',
                keep: true,
            },
        ],
        par: 1,
        solution: [{ action: 'hold', args: { stock: 'TSB', hold: 'regulatory' } }],
        hints: [
            'Stopping one stock is the council’s job, not the policy’s: a policy change would hold the exits too.',
            'Each stock has its own halt record: a hold on one leaves the others trading.',
            'The order wants every stoppage on record with its reason, and for a suspension the halts design asks for the regulatory one: a later resume from the poster alone cannot reopen it.',
        ],
        lesson: 'A regulatory hold halts TSB on the venue (7004): no swaps, no deposits, exits open, and TSA and TSC untouched. The record keeps its reason, as the order asks of every stoppage, and for an SEC suspension the halts design asks for exactly this hold: a poster’s resume alone cannot reopen TSB, only operations can lift it.',
        music: 'tense',
    },
    {
        id: 'wrong-account',
        number: 7,
        title: 'The wrong account',
        from: "The issuer's counsel",
        brief: "A court ordered the issuer to recover Big Ben's 20 TSA. The issuer's clerk took 20 TSA from the pool's vault instead. The vault is short, the pool is flagged, and nothing moves in TSA. Put it right.",
        availability: 'planned',
        standing: 'Planned: honest reserves, the balance check and the operations role.',
        difficulty: 2,
        stocks: ['TSA', 'TSB'],
        start() {
            const park = baseTown(at(15, 0), ['TSA', 'TSB'], { governance: true, reserves: true });
            const tsa = park.listings.TSA;
            if (tsa) {
                tsa.pool.vaultTsa = tsa.pool.tsa - 20;
                tsa.pool.flagged = true;
            }
            return park;
        },
        objectives: [
            {
                kind: 'trade',
                id: 'tsa-buy',
                label: 'Hana buys 10 USDC of TSA',
                stock: 'TSA',
                request: own('hana', 'buy', 10),
                expect: 'fill',
            },
            {
                kind: 'trade',
                id: 'tsa-exit',
                label: 'Yuki can withdraw from TSA',
                stock: 'TSA',
                request: own('yuki', 'withdraw', 0.5),
                expect: 'fill',
            },
            {
                kind: 'state',
                id: 'court-order',
                label: "Big Ben's 20 TSA are recovered (the court order)",
                test: (park) => park.people.ben.holdings.TSA.shares < 1e-9,
            },
            {
                kind: 'trade',
                id: 'tsb-open',
                label: 'TSB keeps trading',
                stock: 'TSB',
                request: own('hana', 'buy', 10),
                expect: 'fill',
                keep: true,
            },
        ],
        par: 3,
        solution: [
            { action: 'return-stock', args: { stock: 'TSA' } },
            { action: 'lift-flag', args: { stock: 'TSA' } },
            { action: 'recover', args: { who: 'ben', stock: 'TSA' } },
        ],
        hints: [
            'A short vault stops everything in its pool, withdrawals too (7009). The flag is not the problem; the hole is.',
            'The issuer took the shares by mistake; the issuer can send them back.',
            'Once the vault is whole, operations can lift the flag. The court order still needs carrying out.',
        ],
        lesson: 'Only the issuer can move shares out of a vault, and here it put back what its clerk took. Whole again, the pool still waited for operations to lift its flag, after the time lock; the balance check compares vault and books on every move, so no lift could have reopened it while short. Then the order reached the right account.',
        music: 'dusk',
    },
    {
        id: 'free',
        number: 0,
        title: 'Free play',
        from: 'The whole venue',
        brief: 'Four pools, everyone in town, every rule switched on. Run the venue as you like: issue and revoke, halt and pause, rewrite the policies, then send trades through the gate and watch the pool decide.',
        availability: 'planned',
        standing: 'Live, in review and planned rules together: each action says where it stands.',
        difficulty: 1,
        stocks: ['TSA', 'TSB', 'TSC', 'TSD'],
        start: () =>
            baseTown(at(10, 0), ['TSA', 'TSB', 'TSC', 'TSD'], {
                halts: true,
                governance: true,
                reserves: true,
                metering: true,
            }),
        objectives: [],
        par: 0,
        solution: [],
        hints: ['Click a building for what you can do there. The gate also sends any trade you like through the checks.'],
        lesson: '',
        music: 'day',
        sandbox: true,
    },
];

export const SCENARIO_LIST: readonly ScenarioDef[] = SCENARIOS;

export function scenarioDef(id: string): ScenarioDef | undefined {
    return SCENARIOS.find((scenario) => scenario.id === id);
}
