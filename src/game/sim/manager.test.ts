import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACTIONS, actionDef, offered, perform, type ActionArgs, type ActionId } from './actions.ts';
import {
    allMet,
    baseTown,
    brokenGuards,
    MAX_MOVE,
    clonePark,
    judgeOn,
    lacks,
    priceMove,
    objectiveStatus,
    priceOf,
    quoteOn,
    settleOn,
    venueOf,
    type Park,
    type StockId,
} from './park.ts';
import { at } from './campaign.ts';
import { SCENARIO_LIST, scenarioDef, type ScenarioDef } from './scenarios.ts';
import type { Availability, WalletId } from './types.ts';

const RANK: Record<Availability, number> = { live: 0, review: 1, planned: 2 };

function solve(scenario: ScenarioDef): Park {
    const park = scenario.start();
    for (const step of scenario.solution) {
        const outcome = perform(park, step.action, step.args, scenario.sandbox);
        assert.ok(outcome.ok, `${scenario.id}: ${step.action} was refused: ${outcome.ok ? '' : outcome.error}`);
        assert.deepEqual(
            brokenGuards(park, scenario.objectives).map((objective) => objective.id),
            [],
            `${scenario.id}: ${step.action} broke a guard rail`,
        );
    }
    return park;
}

const missions = SCENARIO_LIST.filter((scenario) => !scenario.sandbox);

test('every scenario starts unsolved, with its guard rails holding', () => {
    for (const scenario of missions) {
        const park = scenario.start();
        assert.equal(allMet(park, scenario.objectives), false, `${scenario.id} is solved before any move`);
        assert.deepEqual(brokenGuards(park, scenario.objectives), [], `${scenario.id}: a guard rail fails at the start`);
        assert.ok(scenario.objectives.some((objective) => !objective.keep), `${scenario.id} has no goal`);
    }
});

test("every scenario's reference solution solves it, at par", () => {
    for (const scenario of missions) {
        const park = solve(scenario);
        for (const objective of scenario.objectives) {
            const status = objectiveStatus(park, objective);
            assert.ok(status.met, `${scenario.id}: ${objective.id} not met (${status.verdict?.reason ?? ''})`);
        }
        assert.equal(scenario.solution.length, scenario.par, `${scenario.id}: par`);
    }
});

test('no shorter path: dropping any step of a solution leaves the scenario unsolved', () => {
    for (const scenario of missions) {
        for (let skip = 0; skip < scenario.solution.length; skip += 1) {
            const park = scenario.start();
            scenario.solution.forEach((step, i) => {
                if (i !== skip) perform(park, step.action, step.args);
            });
            assert.equal(allMet(park, scenario.objectives), false, `${scenario.id} solved without step ${skip}`);
        }
    }
});

test("a scenario's standing is the least built of the actions it needs and the rules it switches on", () => {
    for (const scenario of missions) {
        const park = scenario.start();
        let worst = 0;
        for (const step of scenario.solution) {
            const availability = actionDef(step.action).availability;
            if (availability !== 'mock') worst = Math.max(worst, RANK[availability]);
        }
        if (park.features.halts) worst = Math.max(worst, RANK.review);
        if (park.features.governance || park.features.reserves || park.features.metering)
            worst = Math.max(worst, RANK.planned);
        assert.equal(RANK[scenario.availability], worst, scenario.id);
    }
});

test('the traps fail as the lessons say', () => {
    // A thaw by the issuer's hand alone leaves Jordan refused: the pool reads the credential.
    const noKyc = scenarioDef('no-kyc') as ScenarioDef;
    let park = noKyc.start();
    assert.equal(judgeOn(park, 'TSA', { op: 'buy', signer: 'jordan', owner: 'jordan', amount: 25 }).code, 7000);
    assert.ok(perform(park, 'issuer-thaw', { who: 'jordan', stock: 'TSA' }).ok);
    assert.equal(judgeOn(park, 'TSA', { op: 'buy', signer: 'jordan', owner: 'jordan', amount: 25 }).reason, 'credential-missing');
    // And a thaw with a credential Jordan does not have is refused by the issuer's gate.
    park = noKyc.start();
    assert.equal(perform(park, 'holder-thaw', { who: 'jordan', stock: 'TSA' }).ok, false);

    // Loosening the KYC age instead of renewing Priya breaks a guard rail.
    const germany = scenarioDef('germany') as ScenarioDef;
    park = germany.start();
    perform(park, 'set-policy', { stock: 'TSC', policy: { jurisdictions: ['US', 'DE'], maxKycAgeDays: 60, delegates: [] } });
    assert.deepEqual(brokenGuards(park, germany.objectives).map((objective) => objective.id), ['tsc-policy']);
    // Opening TSA to Germany as well breaks the other.
    park = germany.start();
    perform(park, 'set-policy', { stock: 'TSA', policy: { jurisdictions: ['US', 'DE'], maxKycAgeDays: 30, delegates: [] } });
    assert.deepEqual(brokenGuards(park, germany.objectives).map((objective) => objective.id), ['lukas-tsa']);

    // Fund before the thaw, or before the policy, and the funding fails.
    const opening = scenarioDef('grand-opening') as ScenarioDef;
    park = opening.start();
    perform(park, 'create-stock', { stock: 'TSD' });
    perform(park, 'create-pool', { stock: 'TSD' });
    // fund_pool checks the creator against the policy first: no policy, 7001, before any token moves.
    const noPolicy = perform(park, 'fund-pool', { stock: 'TSD' });
    assert.ok(!noPolicy.ok && /7001/.test(noPolicy.error));
    perform(park, 'set-policy', { stock: 'TSD', policy: { jurisdictions: ['US'], maxKycAgeDays: 30, delegates: [] } });
    const early = perform(park, 'fund-pool', { stock: 'TSD' });
    assert.ok(!early.ok && /frozen/.test(early.error));
    // A policy that does not accept the creator's jurisdiction refuses the funding too.
    perform(park, 'set-policy', { stock: 'TSD', policy: { jurisdictions: ['DE'], maxKycAgeDays: 30, delegates: [] } });
    perform(park, 'thaw-vault', { stock: 'TSD' });
    const foreign = perform(park, 'fund-pool', { stock: 'TSD' });
    assert.ok(!foreign.ok && /7000/.test(foreign.error));

    // A hold for another reason stops TSB but leaves the record without the reason the order needs;
    // a policy change holds the exits too.
    const sec = scenarioDef('sec-suspension') as ScenarioDef;
    park = sec.start();
    perform(park, 'hold', { stock: 'TSB', hold: 'emergency' });
    assert.deepEqual(
        sec.objectives.filter((objective) => !objectiveStatus(park, objective).met).map((objective) => objective.id),
        ['tsb-reason'],
    );
    park = sec.start();
    perform(park, 'set-policy', { stock: 'TSB', policy: { jurisdictions: ['DE'], maxKycAgeDays: 30, delegates: [] } });
    assert.deepEqual(brokenGuards(park, sec.objectives).map((objective) => objective.id), ['tsb-exit']);
    // Holding every stock stops the ones that should keep trading.
    park = sec.start();
    for (const stock of ['TSA', 'TSB', 'TSC'] as const) perform(park, 'hold', { stock, hold: 'emergency' });
    assert.deepEqual(brokenGuards(park, sec.objectives).map((objective) => objective.id), ['tsa-open', 'tsc-open']);

    // No role lifts a halt the exchange posted.
    const quiet = scenarioDef('feed-quiet') as ScenarioDef;
    park = quiet.start();
    perform(park, 'restart-poster', {});
    const lift = perform(park, 'lift-hold', { stock: 'TSC', hold: 'operational' });
    assert.ok(!lift.ok && /primary market/.test(lift.error));
    assert.equal(judgeOn(park, 'TSC', { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 }).code, 7004);

    // A flag lift cannot reopen a short vault.
    const wrong = scenarioDef('wrong-account') as ScenarioDef;
    park = wrong.start();
    assert.equal(perform(park, 'lift-flag', { stock: 'TSA' }).ok, false);
    perform(park, 'return-stock', { stock: 'TSA' });
    assert.equal(judgeOn(park, 'TSA', { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 }).code, 7009);
    perform(park, 'reconcile', { stock: 'TSA' });
    assert.equal(park.listings.TSA?.pool.flagged, true, 'reconciling never clears the flag');
});

test('pools are independent, and one credential serves them all', () => {
    const park = baseTown(at(10, 0), ['TSA', 'TSB'], { halts: true, governance: true });
    const buy = (stock: StockId) => judgeOn(park, stock, { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 });
    perform(park, 'hold', { stock: 'TSB', hold: 'emergency' });
    assert.equal(buy('TSA').outcome, 'fill');
    assert.equal(buy('TSB').code, 7004);
    perform(park, 'pause-swaps', { stock: 'TSA' });
    assert.equal(buy('TSA').reason, 'venue-paused');
    perform(park, 'revoke', { who: 'lukas' });
    for (const stock of ['TSA', 'TSB'] as const) {
        assert.equal(
            judgeOn(park, stock, { op: 'withdraw', signer: 'lukas', owner: 'lukas', amount: 0.1 }).reason,
            'credential-missing',
            stock,
        );
    }
    // A policy change on one pool leaves the other's version alone.
    perform(park, 'set-policy', { stock: 'TSB', policy: { jurisdictions: ['US', 'DE'], maxKycAgeDays: 30, delegates: [] } });
    assert.equal(park.listings.TSA?.policy?.version, 1);
    assert.equal(park.listings.TSB?.policy?.version, 2);
});

test('a refused action changes nothing; a done one moves the clock', () => {
    const park = baseTown(at(10, 0), ['TSA']);
    const before = JSON.stringify(park);
    const refused = perform(park, 'revoke', { who: 'jordan' });
    assert.equal(refused.ok, false);
    assert.equal(JSON.stringify(park), before);
    const done = perform(park, 'verify', { who: 'jordan' });
    assert.ok(done.ok);
    assert.equal(park.now, at(10, 20));
    // The bureau will not verify someone whose file is under review.
    assert.equal(perform(park, 'verify', { who: 'sora' }).ok, false);
});

test('a fill on one pool moves only that pool and the owner', () => {
    const park = baseTown(at(10, 0), ['TSA', 'TSB']);
    const request = { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 } as const;
    const before = clonePark(park);
    const verdict = judgeOn(park, 'TSB', request);
    assert.equal(verdict.outcome, 'fill');
    assert.equal(JSON.stringify(park), JSON.stringify(before), 'judging wrote something');
    settleOn(park, 'TSB', request, verdict.quote);
    assert.equal(park.people.hana.usdc, before.people.hana.usdc - 10);
    assert.ok(park.people.hana.holdings.TSB.shares > before.people.hana.holdings.TSB.shares);
    assert.equal(park.people.hana.holdings.TSA.shares, before.people.hana.holdings.TSA.shares);
    assert.deepEqual(park.listings.TSA, before.listings.TSA);
    assert.ok(priceOf(park, 'TSB') > priceOf(before, 'TSB'));
    assert.equal(venueOf(park, 'TSB').budget.usedShares, verdict.quote.shares);
});

test("no scenario's trade would move a pool's price more than five percent", () => {
    // The halts design's price band is not modelled; this keeps every scripted trade well inside one.
    for (const scenario of missions) {
        const park = solve(scenario);
        for (const objective of scenario.objectives) {
            if (objective.kind !== 'trade') continue;
            const { op } = objective.request;
            if (op !== 'buy' && op !== 'sell') continue;
            const pool = park.listings[objective.stock]?.pool;
            assert.ok(pool);
            const fill = quoteOn(park, objective.stock, objective.request);
            const after = (pool.usdc - fill.usdc) / (pool.tsa - fill.tsa);
            const move = Math.abs(after / priceOf(park, objective.stock) - 1);
            assert.ok(move < MAX_MOVE, `${scenario.id}: ${objective.id}`);
            assert.ok(Math.abs(priceMove(park, objective.stock, objective.request) - move) < 1e-12);
        }
    }
});

test('after a fill the exchange quotes what the pool trades at', () => {
    const park = baseTown(at(10, 0), ['TSB']);
    const request = { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 } as const;
    settleOn(park, 'TSB', request, judgeOn(park, 'TSB', request).quote);
    assert.equal(park.listings.TSB?.market.price, Math.round(priceOf(park, 'TSB') * 100) / 100);
});

test('free play offers every action, and scenarios only the ones whose rules are in force', () => {
    const free = scenarioDef('free') as ScenarioDef;
    const park = free.start();
    assert.equal(ACTIONS.filter((action) => offered(park, action, true)).length, ACTIONS.length);
    const live = (scenarioDef('no-kyc') as ScenarioDef).start();
    const shown = ACTIONS.filter((action) => offered(live, action, false));
    assert.ok(shown.every((action) => action.availability === 'live'), 'a live-only scenario offers a design');
    assert.ok(shown.some((action) => action.id === 'verify'));
});

const WHO = new Set<ActionId>(['verify', 'revoke', 'holder-thaw', 'issuer-thaw', 'recover', 'approve']);
const HOLDS = ['emergency', 'regulatory', 'operational'] as const;

test('no scenario has a shortcut below par (every move up to two deep)', () => {
    // The moves a player could reasonably make: every offered action with every person, stock and
    // hold, and policy drafts that add or drop Germany or the broker, or change the KYC age.
    const moves = (park: Park, sandbox: boolean): Array<{ action: ActionId; args: ActionArgs }> => {
        const out: Array<{ action: ActionId; args: ActionArgs }> = [];
        const people = Object.keys(park.people) as WalletId[];
        const stocks = Object.keys(park.listings) as StockId[];
        for (const def of ACTIONS) {
            if (!offered(park, def, sandbox)) continue;
            const options: ActionArgs[] = [];
            const whos = WHO.has(def.id) ? people : [undefined];
            const holds = def.id === 'hold' || def.id === 'lift-hold' ? HOLDS : [undefined];
            const stockList = def.site === 'bureau' || def.id === 'approve' ? [undefined] : stocks;
            for (const stock of stockList)
                for (const who of whos)
                    for (const hold of holds)
                        options.push({ stock, who, hold, broker: def.id === 'approve' ? 'kenji' : undefined });
            if (def.id === 'set-policy')
                for (const stock of stocks)
                    for (const jurisdictions of [['US'], ['US', 'DE'], ['DE']])
                        for (const maxKycAgeDays of [30, 60])
                            for (const delegates of [[], ['kenji']] as WalletId[][])
                                options.push({ stock, policy: { jurisdictions, maxKycAgeDays, delegates } });
            for (const args of options) if (!def.blocked(park, args)) out.push({ action: def.id, args });
        }
        return out;
    };
    for (const scenario of missions) {
        if (scenario.par <= 1) continue;
        const start = scenario.start();
        const first = moves(start, false);
        for (const a of first) {
            const one = clonePark(start);
            perform(one, a.action, a.args);
            assert.ok(!allMet(one, scenario.objectives) || scenario.par <= 1, `${scenario.id} solved by ${a.action} alone`);
            if (scenario.par <= 2) continue;
            for (const b of moves(one, false)) {
                const two = clonePark(one);
                perform(two, b.action, b.args);
                assert.ok(
                    !allMet(two, scenario.objectives),
                    `${scenario.id} solved in two: ${a.action} ${JSON.stringify(a.args)}, ${b.action} ${JSON.stringify(b.args)}`,
                );
            }
        }
    }
});

test('a trade the owner cannot pay for is caught before it walks', () => {
    const park = baseTown(at(10, 0), ['TSA']);
    assert.equal(lacks(park, 'TSA', { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 }), undefined);
    assert.match(lacks(park, 'TSA', { op: 'buy', signer: 'kenji', owner: 'kenji', amount: 5000 }) ?? '', /does not hold/);
    assert.match(lacks(park, 'TSA', { op: 'withdraw', signer: 'hana', owner: 'hana', amount: 1 }) ?? '', /LP/);
    const lp = park.people.yuki.holdings.TSA.lp;
    assert.match(lacks(park, 'TSA', { op: 'withdraw', signer: 'yuki', owner: 'yuki', amount: lp }) ?? '', /cannot pay out/);
});

test('free play: a new trade date refreshes the budgets, and a recovery can short a vault', () => {
    const free = scenarioDef('free') as ScenarioDef;
    const park = free.start();
    const tsb = park.listings.TSB;
    assert.ok(tsb);
    tsb.budget.usedShares = tsb.budget.dailyShares;
    park.now = at(23, 30);
    assert.ok(perform(park, 'sim-clock', {}, true).ok);
    assert.equal(tsb.budget.usedShares, 0);
    assert.ok(perform(park, 'sim-shortfall', { stock: 'TSB' }, true).ok);
    assert.equal(judgeOn(park, 'TSB', { op: 'withdraw', signer: 'yuki', owner: 'yuki', amount: 0.5 }).code, 7009);
    assert.ok(perform(park, 'return-stock', { stock: 'TSB' }, true).ok);
    assert.ok(perform(park, 'lift-flag', { stock: 'TSB' }, true).ok);
    assert.equal(judgeOn(park, 'TSB', { op: 'withdraw', signer: 'yuki', owner: 'yuki', amount: 0.5 }).outcome, 'fill');
});
