import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CASE_COUNT, DAY_BEATS, applyBeat, at, openingVenue } from './campaign.ts';
import { amount, clock, date } from './format.ts';
import { CHECKS, REASONS, citableReasons, judge, price, reasonDef, settle, stepLamp } from './rules.ts';
import type { ReasonId, Venue } from './types.ts';

/** Plays the day as the pool decides it, calling `visit` at every case. */
function playDay(visit?: (venue: Venue, id: string) => void): Venue {
    const venue = openingVenue();
    for (const beat of DAY_BEATS) {
        applyBeat(venue, beat);
        if (beat.kind !== 'case') continue;
        visit?.(venue, beat.case.id);
        const verdict = judge(venue, beat.case.request);
        if (verdict.outcome === 'fill') settle(venue, beat.case.request, verdict.quote);
    }
    return venue;
}

test('every visitor gets the outcome the script expects', () => {
    const venue = openingVenue();
    let cases = 0;
    for (const beat of DAY_BEATS) {
        applyBeat(venue, beat);
        if (beat.kind !== 'case') continue;
        cases += 1;
        const { id, request, expect } = beat.case;
        const verdict = judge(venue, request);
        assert.equal(verdict.outcome, expect.outcome, `${id}: outcome`);
        assert.equal(verdict.reason, expect.reason, `${id}: reason`);
        if (verdict.outcome === 'fill') settle(venue, request, verdict.quote);
    }
    assert.equal(cases, CASE_COUNT);
});

test('a refusal writes nothing', () => {
    playDay((venue, id) => {
        const before = JSON.stringify(venue);
        judge(
            venue,
            (
                DAY_BEATS.find((beat) => beat.kind === 'case' && beat.case.id === id) as {
                    case: { request: Parameters<typeof judge>[1] };
                }
            ).case.request,
        );
        assert.equal(JSON.stringify(venue), before, `${id}: judging changed the venue`);
    });
});

test('the pool opens at 12.40 and 10 USDC buys about 0.80 TSA', () => {
    const venue = openingVenue();
    for (const beat of DAY_BEATS) {
        applyBeat(venue, beat);
        if (beat.kind === 'case') {
            assert.equal(price(venue).toFixed(2), '12.40');
            assert.equal(venue.pool.lpSupply.toFixed(4), '11.1355');
            const verdict = judge(venue, beat.case.request);
            assert.equal(verdict.quote.tsa.toFixed(2), '0.80');
            assert.equal(verdict.quote.usdc, -10);
            return;
        }
    }
    assert.fail('no case found');
});

test('refusal codes match the venue catalogue', () => {
    const expected: Record<ReasonId, number | undefined> = {
        'pool-not-open': undefined,
        'venue-paused': undefined,
        'symbol-halted': 7004,
        'inputs-stale': 7007,
        'out-of-balance': 7009,
        'account-frozen': 7000,
        'delegate-not-listed': 7000,
        'delegate-not-approved': 7000,
        'credential-missing': 7001,
        'credential-expired': 7001,
        'kyc-too-old': 7001,
        jurisdiction: 7000,
        'budget-exceeded': 7008,
    };
    for (const reason of REASONS) assert.equal(reason.code, expected[reason.id], reason.id);
    assert.equal(reasonDef('symbol-halted').codeName, 'SYMBOL_HALTED');
    assert.equal(reasonDef('account-frozen').codeName, 'ACCOUNT_NOT_ELIGIBLE');
    assert.equal(reasonDef('kyc-too-old').codeName, 'CREDENTIAL_INVALID');
});

test('the first failing check wins and later checks are not reached', () => {
    playDay((venue, id) => {
        if (id === 'jordan-first') {
            // Frozen account and no credential: the account is checked first.
            const verdict = judge(venue, { op: 'buy', signer: 'jordan', owner: 'jordan', amount: 25 });
            assert.equal(verdict.failed, 'account-thawed');
            assert.equal(verdict.trace.find((item) => item.id === 'credential')?.status, 'skip');
        }
        if (id === 'hana-halted') {
            const verdict = judge(venue, { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 });
            assert.equal(verdict.code, 7004);
            assert.equal(verdict.trace.find((item) => item.id === 'credential')?.status, 'skip');
        }
    });
});

test('exits stay open under a halt, a pause and for an expired credential, and are held for a revoked one', () => {
    playDay((venue, id) => {
        if (id === 'yuki-exit') {
            const verdict = judge(venue, { op: 'withdraw', signer: 'yuki', owner: 'yuki', amount: 2 });
            assert.equal(verdict.outcome, 'fill');
            assert.equal(verdict.trace.find((item) => item.id === 'halt')?.status, 'open');
            // A swap by the same wallet is refused at the same moment.
            assert.equal(judge(venue, { op: 'sell', signer: 'yuki', owner: 'yuki', amount: 1 }).code, 7004);
        }
        if (id === 'ito-exit') {
            assert.equal(judge(venue, { op: 'withdraw', signer: 'ito', owner: 'ito', amount: 0.5 }).outcome, 'fill');
            assert.equal(
                judge(venue, { op: 'deposit', signer: 'ito', owner: 'ito', amount: 0.1 }).reason,
                'credential-expired',
            );
        }
        if (id === 'sora-exit') {
            assert.equal(
                judge(venue, { op: 'withdraw', signer: 'sora', owner: 'sora', amount: 1 }).reason,
                'credential-missing',
            );
        }
        if (id === 'ito-paused') {
            // The pause stops swaps only: an exit passes it, even on an expired credential.
            assert.equal(venue.swapsPaused, true);
            const verdict = judge(venue, { op: 'withdraw', signer: 'ito', owner: 'ito', amount: 0.5 });
            assert.equal(verdict.outcome, 'fill');
            assert.equal(verdict.trace.find((item) => item.id === 'venue-pause')?.status, 'open');
            assert.equal(judge(venue, { op: 'sell', signer: 'hana', owner: 'hana', amount: 1 }).reason, 'venue-paused');
        }
        if (id === 'yuki-short') {
            // Out of balance refuses every kind of move.
            for (const op of ['buy', 'sell', 'deposit', 'withdraw'] as const) {
                assert.equal(judge(venue, { op, signer: 'yuki', owner: 'yuki', amount: 1 }).code, 7009, op);
            }
        }
    });
});

test('rules that are not on main stay off until their chapter', () => {
    const venue = openingVenue();
    const seen = new Map<string, string[]>();
    for (const beat of DAY_BEATS) {
        applyBeat(venue, beat);
        if (beat.kind !== 'case') continue;
        const verdict = judge(venue, beat.case.request);
        seen.set(
            beat.case.id,
            verdict.trace.filter((item) => item.status === 'off').map((item) => item.id),
        );
        if (verdict.outcome === 'fill') settle(venue, beat.case.request, verdict.quote);
    }
    assert.deepEqual(seen.get('hana-buy'), ['venue-pause', 'halt', 'inputs-fresh', 'in-balance', 'budget']);
    assert.deepEqual(seen.get('hana-halted'), ['venue-pause', 'in-balance', 'budget']);
    assert.deepEqual(seen.get('hana-last'), []);
    assert.equal(citableReasons(openingVenue()).length, 7);
});

test('the day ends balanced, within budget and with every check used', () => {
    const venue = playDay();
    assert.equal(venue.now, at(16, 0));
    assert.ok(Math.abs(venue.pool.vaultTsa - venue.pool.tsa) < 1e-9);
    assert.ok(venue.budget.usedShares < venue.budget.dailyShares);
    const failed = new Set<string>();
    playDay((v, id) => {
        const beat = DAY_BEATS.find((item) => item.kind === 'case' && item.case.id === id);
        if (beat?.kind === 'case') {
            const verdict = judge(v, beat.case.request);
            if (verdict.failed) failed.add(verdict.failed);
        }
    });
    for (const check of CHECKS) {
        if (check.id === 'pool-open') continue;
        assert.ok(failed.has(check.id), `no visitor is refused by ${check.id}`);
    }
});

test('formats', () => {
    assert.equal(clock(at(9, 5)), '9:05');
    assert.equal(date(at(9, 0)), '10 Nov 2026');
    assert.equal(date(-1), '9 Nov 2026');
    assert.equal(date(1440 * 353), '29 Oct 2027');
    assert.equal(amount(0.79999), '0.80');
    assert.equal(amount(1240), '1,240');
});

test('the gate lights only the steps that ran', () => {
    const lamps = new Map<string, string>();
    playDay((venue, id) => {
        const beat = DAY_BEATS.find((item) => item.kind === 'case' && item.case.id === id);
        if (beat?.kind !== 'case') return;
        const verdict = judge(venue, beat.case.request);
        lamps.set(id, [1, 2, 3, 4, 5].map((step) => stepLamp(verdict, step)).join(' '));
    });
    // On main: restrictions (the pool is open), eligibility and pricing run; balance and settlement are not built.
    assert.equal(lamps.get('hana-buy'), 'pass off pass pass off');
    assert.equal(lamps.get('jordan-first'), 'pass off fail skip skip');
    // A halt refuses at step 1, before any credential is read.
    assert.equal(lamps.get('hana-halted'), 'fail skip skip skip skip');
    // A withdrawal under a halt, then under a pause: step 1 stays open for the exit, and it goes through.
    assert.equal(lamps.get('yuki-exit'), 'open off pass pass off');
    assert.equal(lamps.get('ito-paused'), 'open pass pass pass na');
    // Before halts and pauses exist, an exit's step 1 is the plain "the pool is open".
    assert.equal(lamps.get('ito-exit'), 'pass off pass pass off');
    // Her second withdrawal passes the restrictions the same way, then meets the vault that does not balance.
    assert.equal(lamps.get('yuki-short'), 'open fail skip skip skip');
    assert.equal(lamps.get('ben-budget'), 'pass pass pass pass fail');
    assert.equal(lamps.get('hana-last'), 'pass pass pass pass pass');
});

test('a withdrawal drops only the expiry and KYC-age tests', () => {
    playDay((venue, id) => {
        if (id !== 'ito-exit') return;
        const exit = { op: 'withdraw', signer: 'ito', owner: 'ito', amount: 0.5 } as const;
        assert.equal(judge(venue, exit).outcome, 'fill');
        // A frozen account still stops it: the stock leg has nowhere to land.
        venue.wallets.ito.account = 'frozen';
        assert.equal(judge(venue, exit).reason, 'account-frozen');
        venue.wallets.ito.account = 'thawed';
        // So does a jurisdiction off the policy's list.
        const credential = venue.wallets.ito.credential;
        assert.ok(credential);
        credential.jurisdiction = 'DE';
        assert.equal(judge(venue, exit).reason, 'jurisdiction');
        credential.jurisdiction = 'US';
        // A stale KYC check does not.
        credential.verifiedAt = venue.now - 400 * 1440;
        assert.equal(judge(venue, exit).outcome, 'fill');
    });
});

test('a KYC check exactly as old as the limit is already too old', () => {
    playDay((venue, id) => {
        if (id !== 'hana-buy') return;
        const credential = venue.wallets.hana.credential;
        assert.ok(credential);
        const buy = { op: 'buy', signer: 'hana', owner: 'hana', amount: 10 } as const;
        credential.verifiedAt = venue.now - 30 * 1440 + 1;
        assert.equal(judge(venue, buy).outcome, 'fill');
        credential.verifiedAt = venue.now - 30 * 1440;
        assert.equal(judge(venue, buy).reason, 'kyc-too-old');
        credential.verifiedAt = venue.now - 9 * 1440;
    });
});

test('a step whose rules do not apply to the trade stays dark', () => {
    playDay((venue, id) => {
        if (id !== 'hana-last') return;
        // The budget is in force but counts swaps only: a withdrawal lights nothing at step 5.
        const verdict = judge(venue, { op: 'withdraw', signer: 'yuki', owner: 'yuki', amount: 1 });
        assert.equal(verdict.outcome, 'fill');
        assert.equal(stepLamp(verdict, 5), 'na');
        assert.equal(stepLamp(verdict, 3), 'pass');
    });
});

test('no trade that reaches pricing would move the price more than five percent', () => {
    // The halts design adds a price band the game does not model. This keeps the script honest
    // about it: every swap that gets as far as pricing (a fill, or a refusal at settlement)
    // would stay inside a five percent band around the exchange's quote.
    const venue = openingVenue();
    for (const beat of DAY_BEATS) {
        applyBeat(venue, beat);
        if (beat.kind !== 'case') continue;
        const { request } = beat.case;
        const verdict = judge(venue, request);
        const priced = verdict.outcome === 'fill' || verdict.failed === 'budget';
        if (priced && (request.op === 'buy' || request.op === 'sell')) {
            const after = (venue.pool.usdc - verdict.quote.usdc) / (venue.pool.tsa - verdict.quote.tsa);
            assert.ok(
                Math.abs(after / venue.market.price - 1) < 0.05,
                `${beat.case.id}: ${after.toFixed(3)} against ${venue.market.price}`,
            );
        }
        if (verdict.outcome === 'fill') settle(venue, request, verdict.quote);
    }
});
