'use client';

/**
 * The gatekeeper's desk: the visitor's portrait, their papers, the rulebook
 * and the two stamps. After the stamp it shows the pool's own decision,
 * step by step, next to the player's.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { GameState, InspectState, Paper, VerdictState } from '../core/state.ts';
import { portraitStudio } from '../scene/portrait.ts';
import { CASE_COUNT, CAST } from '../sim/campaign.ts';
import { amount, clock, date, jurisdictionName } from '../sim/format.ts';
import {
    DAY,
    STEPS,
    citableReasons,
    checkDef,
    credentialFinding,
    kycAgeDays,
    quote,
    reasonDef,
    settledWord,
    type ReasonDef,
} from '../sim/rules.ts';
import type { ReasonId, TradeRequest, Venue, Wallet, WalletId } from '../sim/types.ts';
import { LOOKS, type LookId } from '../world/character.ts';
import type { LampState } from '../world/gate.ts';
import { useGame, useGameState } from './context.tsx';
import { Icon } from './icons.tsx';
import { controlOwnsKey } from './keys.ts';

const OP_TITLE: Record<TradeRequest['op'], string> = {
    buy: 'Buy TSA',
    sell: 'Sell TSA',
    deposit: 'Add liquidity',
    withdraw: 'Withdraw liquidity',
};
const OP_KIND: Record<TradeRequest['op'], string> = {
    buy: 'Swap',
    sell: 'Swap',
    deposit: 'Deposit',
    withdraw: 'Withdrawal · an exit',
};

/** The line of a paper that the pool's refusal turns on: ringed in red once the gate has decided. */
interface Culprit {
    paper: 'slip' | 'account' | 'kyc' | 'approval';
    /** Whose credential, when two are on the desk. */
    wallet?: WalletId;
    row: string;
}

function culpritOf(venue: Venue, request: TradeRequest, reason: ReasonId): Culprit | undefined {
    const owner = venue.wallets[request.owner];
    const signer = venue.wallets[request.signer];
    const wallets = request.signer !== request.owner ? [owner, signer] : [owner];
    const policy = venue.policy;
    switch (reason) {
        case 'account-frozen':
            return { paper: 'account', row: 'state' };
        case 'delegate-not-listed':
            return { paper: 'slip', row: 'signer' };
        case 'delegate-not-approved':
            return { paper: 'approval', row: 'signed' };
        case 'credential-missing':
        case 'credential-expired':
        case 'kyc-too-old': {
            const exit = request.op === 'withdraw';
            const who = wallets.find(
                (wallet) => !policy || credentialFinding(wallet, policy, venue.now, exit) === reason,
            );
            if (!who) return undefined;
            const row = reason === 'credential-missing' ? 'void' : reason === 'credential-expired' ? 'until' : 'kyc';
            return { paper: 'kyc', wallet: who.id, row };
        }
        case 'jurisdiction': {
            const who = wallets.find(
                (wallet) => !wallet.credential || !policy?.jurisdictions.includes(wallet.credential.jurisdiction),
            );
            return who ? { paper: 'kyc', wallet: who.id, row: 'jurisdiction' } : undefined;
        }
        case 'budget-exceeded':
            return { paper: 'slip', row: 'receive' };
        default:
            // Halts, pauses and the balance are notices in the rulebook, not lines on a paper.
            return undefined;
    }
}

function Portrait({ who }: { who: keyof typeof CAST }) {
    const game = useGame();
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const host = ref.current;
        if (!host) return undefined;
        const studio = portraitStudio();
        host.append(studio.canvas);
        studio.setSubject(LOOKS[CAST[who].look as LookId], game.world.find(who));
        studio.start();
        return () => {
            studio.stop();
            studio.setSubject(undefined);
            studio.canvas.remove();
        };
    }, [game, who]);
    return <div ref={ref} className="gk-portrait__stage" />;
}

function Row({ label, children, ring }: { label: string; children: ReactNode; ring?: boolean }) {
    return (
        <div className={ring ? 'gk-row gk-row--ring' : 'gk-row'}>
            <span className="gk-row__label">{label}</span>
            <span className="gk-row__value">{children}</span>
        </div>
    );
}

function Slip({
    venue,
    request,
    stamp,
    ring,
}: {
    venue: Venue;
    request: TradeRequest;
    stamp?: VerdictState;
    ring?: string;
}) {
    const signer = venue.wallets[request.signer];
    const owner = venue.wallets[request.owner];
    // Once the pool has decided, keep the quote it decided on: the reserves have moved since.
    const fill = stamp?.truth.quote ?? quote(venue, request);
    const delegated = request.signer !== request.owner;
    let asks: string;
    let gets: string;
    if (request.op === 'buy') {
        asks = `Pay ${amount(request.amount)} USDC`;
        gets = `about ${amount(fill.tsa)} TSA`;
    } else if (request.op === 'sell') {
        asks = `Sell ${amount(request.amount)} TSA`;
        gets = `about ${amount(fill.usdc)} USDC`;
    } else if (request.op === 'deposit') {
        asks = `Add ${amount(-fill.tsa)} TSA + ${amount(-fill.usdc)} USDC`;
        gets = `${amount(request.amount)} LP`;
    } else {
        // Short on purpose: this paper carries the longest lines of the day, and "LP" keeps it to one.
        asks = `Return ${amount(request.amount)} LP`;
        gets = `${amount(fill.tsa)} TSA + ${amount(fill.usdc)} USDC`;
    }
    // When the pool disagrees with the stamp, the stamp is struck and the pool's own lands over it.
    const overruled = stamp !== undefined && stamp.revealed && !stamp.automatic && stamp.grade === 'wrong';
    const poolCode = stamp?.truth.reason ? reasonDef(stamp.truth.reason).code : undefined;
    return (
        <article className="gk-paper gk-paper--slip">
            <header className="gk-paper__head">
                <span>Trade request</span>
                <span className="gk-mono">{clock(venue.now)}</span>
            </header>
            <h3 className="gk-paper__title">{OP_TITLE[request.op]}</h3>
            <p className="gk-paper__kind" data-exit={request.op === 'withdraw'}>
                {OP_KIND[request.op]}
            </p>
            <Row label="Asks to">{asks}</Row>
            <Row label="To receive" ring={ring === 'receive'}>
                {gets}
            </Row>
            <Row label="Signed by" ring={ring === 'signer'}>
                {signer.name} <i className="gk-mono">{signer.address}</i>
            </Row>
            <Row label="Accounts of">
                {delegated ? <b className="gk-flag">{owner.name}, not the signer</b> : 'the signer'}
            </Row>
            {stamp && (
                <div
                    className={`gk-stamp gk-stamp--${stamp.approved ? 'approve' : 'refuse'}`}
                    data-struck={overruled || undefined}
                >
                    <b>{stamp.approved ? 'APPROVED' : 'REFUSED'}</b>
                    {!stamp.approved && stamp.cited && <span>{reasonDef(stamp.cited).code ?? 'no code'}</span>}
                </div>
            )}
            {stamp && overruled && (
                <div
                    className={`gk-stamp gk-stamp--pool gk-stamp--${stamp.truth.outcome === 'fill' ? 'approve' : 'refuse'}`}
                >
                    <i>the pool</i>
                    <b>{stamp.truth.outcome === 'fill' ? settledWord(request.op).toUpperCase() : 'REFUSED'}</b>
                    {stamp.truth.outcome === 'refuse' && poolCode && <span>{poolCode}</span>}
                </div>
            )}
        </article>
    );
}

function AccountCard({ owner, ring }: { owner: Wallet; ring?: string }) {
    const frozen = owner.account !== 'thawed';
    return (
        <article className="gk-paper gk-paper--account">
            <header className="gk-paper__head">
                <span>Stock account</span>
                <span className="gk-paper__source">Test Stock A</span>
            </header>
            <div
                className={`gk-state ${frozen ? 'gk-state--frozen' : 'gk-state--thawed'}${ring === 'state' ? ' gk-row--ring' : ''}`}
            >
                {frozen ? Icon.snow(20) : Icon.check(20)}
                <b>{frozen ? 'Frozen' : 'Thawed'}</b>
            </div>
            <Row label="Owner">
                {owner.name} <i className="gk-mono">{owner.address}</i>
            </Row>
            <Row label="Holds">{amount(owner.tsa)} TSA</Row>
            <Row label="Opened">{owner.account === 'none' ? 'not yet: this trade would create it' : 'earlier'}</Row>
        </article>
    );
}

/** "today, 12:00" on the venue day, else the date: short enough for the narrowest paper. */
function until(expiresAt: number, now: number): string {
    return Math.floor(expiresAt / DAY) === Math.floor(now / DAY) ? `today, ${clock(expiresAt)}` : date(expiresAt);
}

function CredentialCard({
    wallet,
    now,
    role,
    compact,
    ring,
}: {
    wallet: Wallet;
    now: number;
    role?: string;
    compact?: boolean;
    ring?: string;
}) {
    const credential = wallet.credential;
    if (!credential) {
        return (
            <article className="gk-paper gk-paper--credential gk-paper--void">
                <header className="gk-paper__head">
                    <span>Credential{role ? ` · ${role}` : ''}</span>
                    <span className="gk-paper__source" title="Solana Attestation Service">
                        attestation
                    </span>
                </header>
                <div className={ring === 'void' ? 'gk-void gk-row--ring' : 'gk-void'}>No credential found</div>
                <Row label="Wallet">
                    {wallet.name} <i className="gk-mono">{wallet.address}</i>
                </Row>
                <Row label="On file">
                    {wallet.revoked ? 'Revoked today. The attestation was closed.' : 'This wallet never had one.'}
                </Row>
            </article>
        );
    }
    const age = kycAgeDays(credential, now);
    const ago = age === 0 ? 'today' : age === 1 ? '1 day ago' : `${age} days ago`;
    return (
        <article className="gk-paper gk-paper--credential">
            <header className="gk-paper__head">
                <span>Credential{role ? ` · ${role}` : ''}</span>
                <span className="gk-paper__source" title="Solana Attestation Service">
                    attestation
                </span>
            </header>
            <h3 className="gk-paper__title gk-paper__title--small">{credential.name}</h3>
            {compact ? (
                // Two credentials share one slot: the value that is checked comes first, so it is never the part cut off.
                <>
                    <Row label="Holder">{wallet.name}</Row>
                    <Row label="Juris." ring={ring === 'jurisdiction'}>
                        {credential.jurisdiction} <i>{jurisdictionName(credential.jurisdiction)}</i>
                    </Row>
                    <Row label="KYC" ring={ring === 'kyc'}>
                        {ago} <i>{date(credential.verifiedAt)}</i>
                    </Row>
                    <Row label="Until" ring={ring === 'until'}>
                        {until(credential.expiresAt, now)}
                    </Row>
                </>
            ) : (
                <>
                    <Row label="Holder">
                        {wallet.name} <i className="gk-mono">{wallet.address}</i>
                    </Row>
                    <Row label="Jurisdiction" ring={ring === 'jurisdiction'}>
                        {credential.jurisdiction} · {jurisdictionName(credential.jurisdiction)}
                    </Row>
                    <Row label="KYC checked" ring={ring === 'kyc'}>
                        {ago} <i>{date(credential.verifiedAt)}</i>
                    </Row>
                    <Row label="Valid until" ring={ring === 'until'}>
                        {until(credential.expiresAt, now)}
                    </Row>
                </>
            )}
            <div className="gk-seal" aria-hidden="true">
                {Icon.shield(26)}
            </div>
        </article>
    );
}

function ApprovalSlip({ owner, signer, ring }: { owner: Wallet; signer: Wallet; ring?: string }) {
    const approved = owner.approves === signer.id;
    return (
        <article className="gk-paper gk-paper--approval">
            <header className="gk-paper__head">
                <span>Broker approval</span>
                <span className="gk-paper__source" title="An SPL token delegate approval">
                    token delegate
                </span>
            </header>
            <p className="gk-paper__note">
                {approved ? (
                    <>
                        <b>{owner.name}</b> lets <b>{signer.name}</b> move her tokens.
                    </>
                ) : (
                    <>
                        No approval from <b>{owner.name}</b> on file.
                    </>
                )}
            </p>
            <Row label="Signed by" ring={ring === 'signed'}>
                {approved ? owner.name : 'nobody'}
            </Row>
        </article>
    );
}

function Slot({
    shown,
    title,
    ask,
    hotkey,
    nudge,
    onAsk,
    children,
}: {
    shown: boolean;
    title: string;
    ask: string;
    hotkey: string;
    /** Counts the times the player tried to approve without this paper: each one shakes the button. */
    nudge: number;
    onAsk: () => void;
    children: ReactNode;
}) {
    if (shown) return <div className="gk-slot gk-slot--shown">{children}</div>;
    return (
        <div className="gk-slot">
            <div className="gk-slot__empty">
                <span>{title}</span>
                <button
                    key={nudge}
                    type="button"
                    className="gk-ask"
                    onClick={onAsk}
                    data-ask={title}
                    data-nudged={nudge > 0 || undefined}
                >
                    <kbd>{hotkey}</kbd>
                    {ask}
                </button>
            </div>
        </div>
    );
}

/** One line of the rulebook: the lantern step that checks it, what it is about, and what it says today. */
function Rule({
    step,
    label,
    exits,
    children,
}: {
    step?: number;
    label: string;
    /** For a notice: whether a withdrawal passes it. */
    exits?: 'pass' | 'stop';
    children: ReactNode;
}) {
    return (
        <div className="gk-rule">
            <span className="gk-rule__step" title={step ? `Checked at step ${step}` : undefined}>
                {step ?? ''}
            </span>
            <span className="gk-rule__label">{label}</span>
            <span className="gk-rule__value">{children}</span>
            {exits && (
                <span
                    className="gk-rule__exits"
                    data-exits={exits}
                    title={
                        exits === 'pass'
                            ? 'A withdrawal is not stopped by this.'
                            : 'This stops withdrawals too, until the vault is whole again.'
                    }
                >
                    {exits === 'pass' ? 'exits pass' : 'stops exits'}
                </span>
            )}
        </div>
    );
}

function Rulebook({ state }: { state: GameState }) {
    const venue = state.venue;
    const policy = venue.policy;
    const f = venue.features;
    const short = venue.pool.flagged || venue.pool.vaultTsa < venue.pool.tsa - 1e-9;
    return (
        <div className="gk-rules">
            <div className="gk-rules__today">
                {Icon.clock(16)}
                <b>{date(venue.now)}</b>
                <span className="gk-mono">{clock(venue.now)}</span>
            </div>
            {/* The notices are read before any paper, so they come first. */}
            {(f.halts || f.governance || f.reserves || f.metering) && (
                <div className="gk-rules__block">
                    <h4>
                        Notices <span>read before any paper</span>
                    </h4>
                    {f.halts && (
                        <Rule step={1} label="Halt board" exits="pass">
                            <b data-tone={venue.market.record === 'halted' ? 'bad' : 'good'}>
                                {venue.market.record === 'halted' ? 'HALTED' : 'TRADING'}
                            </b>
                            <i data-tone={venue.market.evidenceFresh ? 'good' : 'bad'}>
                                {venue.market.evidenceFresh ? 'fresh' : 'evidence expired'}
                            </i>
                        </Rule>
                    )}
                    {f.governance && (
                        <Rule step={1} label="Venue" exits="pass">
                            <b data-tone={venue.swapsPaused ? 'bad' : 'good'}>
                                {venue.swapsPaused ? 'swaps PAUSED' : 'no pause'}
                            </b>
                        </Rule>
                    )}
                    {f.reserves && (
                        <Rule step={2} label="Stock vault" exits="stop">
                            <b data-tone={short ? 'bad' : 'good'}>{amount(venue.pool.vaultTsa, 1)}</b>
                            <i>books {amount(venue.pool.tsa, 1)}</i>
                        </Rule>
                    )}
                    {f.metering && (
                        <Rule step={5} label="Day budget" exits="pass">
                            <b>{amount(venue.budget.usedShares, 2)} used</b>
                            <i>of {venue.budget.dailyShares} shares</i>
                        </Rule>
                    )}
                </div>
            )}
            {policy && (
                <div className="gk-rules__block">
                    <h4>
                        Trade policy <em>v{policy.version}</em>
                    </h4>
                    <Rule step={3} label="Account">
                        thawed
                    </Rule>
                    <Rule step={3} label="Signer">
                        {policy.delegates.length === 0
                            ? 'the owner only'
                            : `owner, or broker ${policy.delegates.map((id) => venue.wallets[id].name).join(', ')}`}
                    </Rule>
                    <Rule step={3} label="Credential">
                        {policy.credential} <i>not expired</i>
                    </Rule>
                    <Rule step={3} label="KYC age">
                        under {policy.maxKycAgeDays} days
                    </Rule>
                    <Rule step={3} label="Jurisdiction">
                        {policy.jurisdictions.map((code) => `${code} · ${jurisdictionName(code)}`).join(', ')}
                    </Rule>
                    <p className="gk-rules__note">
                        <b>Exits:</b> expired may withdraw; revoked is held.
                    </p>
                </div>
            )}
            <p className="gk-rules__order">The first check that fails decides.</p>
        </div>
    );
}

/** The findings to cite, by step: the long eligibility list on its own side when other steps are in force. */
function Reasons({
    venue,
    onPick,
    onClose,
}: {
    venue: Venue;
    onPick: (reason: ReasonId) => void;
    onClose: () => void;
}) {
    const reasons = citableReasons(venue);
    const group = (step: number): ReasonDef[] => reasons.filter((reason) => checkDef(reason.check).step === step);
    const side = STEPS.filter((step) => step.step !== 3 && group(step.step).length > 0);
    const block = (step: (typeof STEPS)[number]): ReactNode => (
        <div key={step.step} className="gk-reasons__step">
            <span className="gk-reasons__stepname">
                Step {step.step} · {step.title}
            </span>
            {group(step.step).map((reason) => (
                <button
                    key={reason.id}
                    type="button"
                    role="menuitem"
                    data-reason={reason.id}
                    onClick={() => onPick(reason.id)}
                >
                    <span>{reason.title}</span>
                    <code>{reason.code ?? 'no code'}</code>
                </button>
            ))}
        </div>
    );
    const eligibility = STEPS.find((step) => step.step === 3) as (typeof STEPS)[number];
    return (
        <div className="gk-reasons" role="menu" data-columns={side.length > 0 ? 2 : 1}>
            <header>
                <b>Refuse: cite the first check that fails</b>
                <button type="button" onClick={onClose} aria-label="Close">
                    {Icon.cross(16)}
                </button>
            </header>
            <div className="gk-reasons__list">
                {side.length > 0 && <div className="gk-reasons__col">{side.map(block)}</div>}
                <div className="gk-reasons__col">{block(eligibility)}</div>
            </div>
        </div>
    );
}

const LAMP_TEXT: Record<LampState, string> = {
    idle: '',
    run: 'checking…',
    pass: 'passed',
    fail: 'refused here',
    open: 'stays open for exits',
    skip: 'not reached',
    off: 'not in force yet',
    na: 'nothing to check',
};

/** A finding's title inside a sentence: "the credential has expired". */
function inline(title: string): string {
    return title.charAt(0).toLowerCase() + title.slice(1);
}

function PoolDecision({ verdict }: { verdict: VerdictState }) {
    const truth = verdict.truth;
    const reason = truth.reason ? reasonDef(truth.reason) : undefined;
    const failedStep = truth.failed ? checkDef(truth.failed).step : undefined;
    const headline = verdict.automatic
        ? 'Autoplay stamped this one'
        : { correct: 'You and the pool agree', partial: 'Right call, wrong finding', wrong: 'The pool disagrees' }[
              verdict.grade
          ];
    const failedTitle = STEPS.find((step) => step.step === failedStep)?.title;
    // One line that says in words what the lanterns say in colour; short screens show it instead of the list's text.
    const summary = !verdict.revealed
        ? 'The gate is checking…'
        : failedStep !== undefined
          ? `Step ${failedStep} · ${failedTitle}: ${reason?.title ?? 'refused'}`
          : 'Every step that applies passed.';
    const cited = verdict.cited ? reasonDef(verdict.cited) : undefined;
    return (
        <div
            className="gk-decision"
            data-grade={!verdict.revealed ? 'pending' : verdict.automatic ? 'auto' : verdict.grade}
        >
            <h4>The pool decides</h4>
            <ol className="gk-pipeline">
                {STEPS.map((step, i) => {
                    const lamp = verdict.lamps[i] ?? 'idle';
                    const text = lamp === 'fail' && failedStep === step.step && reason ? reason.title : LAMP_TEXT[lamp];
                    return (
                        <li
                            key={step.step}
                            data-lamp={lamp}
                            title={`Step ${step.step} · ${step.title}${text ? `: ${text}` : ''}`}
                        >
                            <span className="gk-pipeline__lamp">
                                {lamp === 'pass' ? Icon.check(13) : lamp === 'fail' ? Icon.cross(13) : step.step}
                            </span>
                            <span className="gk-pipeline__name">{step.title}</span>
                            <span className="gk-pipeline__state">{text}</span>
                        </li>
                    );
                })}
            </ol>
            <p className="gk-pipeline__summary">{summary}</p>
            {verdict.revealed && (
                <div className="gk-outcome">
                    <div className={`gk-outcome__result gk-outcome__result--${truth.outcome}`}>
                        {truth.outcome === 'fill' ? (
                            <b>{settledWord(verdict.case.request.op)}</b>
                        ) : (
                            <>
                                <b>Refused</b>
                                <code>
                                    {reason?.code
                                        ? `${reason.code} · ${reason.codeName}`
                                        : (reason?.codeNote ?? 'no code')}
                                </code>
                            </>
                        )}
                    </div>
                    <p className="gk-outcome__grade">
                        {verdict.automatic
                            ? Icon.play(16)
                            : verdict.grade === 'correct'
                              ? Icon.check(18)
                              : verdict.grade === 'wrong'
                                ? Icon.cross(18)
                                : Icon.info(18)}
                        <b>{headline}</b>
                        {verdict.points > 0 && <span>+{verdict.points}</span>}
                    </p>
                    {verdict.grade !== 'correct' && !verdict.automatic && (
                        <p className="gk-outcome__yours">
                            {verdict.approved ? (
                                <>
                                    You stamped <b>approved</b>.
                                </>
                            ) : verdict.grade === 'partial' && cited && reason ? (
                                // Two findings can share a code, so the words tell them apart.
                                <>
                                    You cited: <b>{inline(cited.title)}</b>. The pool: <b>{inline(reason.title)}</b>.
                                </>
                            ) : (
                                <>
                                    You refused{cited ? ', citing: ' : ''}
                                    {cited && <b>{inline(cited.title)}</b>}.
                                </>
                            )}
                        </p>
                    )}
                    <p className="gk-outcome__lesson">{verdict.case.lesson}</p>
                </div>
            )}
        </div>
    );
}

/** The strip under the papers: the stamps while inspecting, then the way on. */
function Actions({
    state,
    inspect,
    papers,
    refusing,
    onRefuse,
    onNudge,
}: {
    state: GameState;
    inspect: InspectState;
    papers: Paper[];
    refusing: boolean;
    onRefuse: () => void;
    onNudge: () => void;
}) {
    const game = useGame();
    const verdict = state.verdict;
    if (verdict) {
        const last = verdict.number >= CASE_COUNT;
        return (
            <div className="gk-actions" data-phase="verdict">
                <span
                    className="gk-actions__stamped"
                    data-stamp={verdict.approved ? 'approve' : 'refuse'}
                    data-auto={verdict.automatic || undefined}
                >
                    {verdict.approved ? Icon.check(16) : Icon.cross(16)}
                    {verdict.automatic ? 'Autoplay stamped' : 'You stamped'}{' '}
                    <b>{verdict.approved ? 'approved' : 'refused'}</b>
                </span>
                {verdict.revealed ? (
                    <button type="button" className="gk-btn gk-btn--primary" onClick={() => game.next()} data-continue>
                        {last ? 'Close the gate' : 'Next visitor'} {Icon.arrow(16)}
                        <kbd>Space</kbd>
                    </button>
                ) : (
                    <button
                        type="button"
                        className="gk-btn gk-btn--ghost"
                        onClick={() => game.skip()}
                        disabled={state.skipping}
                    >
                        The gate is checking… skip {Icon.skip(14)}
                    </button>
                )}
            </div>
        );
    }
    const missing = papers.filter((paper) => !inspect.shown[paper]);
    const ready = missing.length === 0;
    return (
        <div className="gk-actions" data-phase="inspect">
            <div className="gk-actions__left">
                {!ready && !inspect.tutorial && (
                    <button type="button" className="gk-askall" onClick={() => game.askAll()} data-askall>
                        <span>
                            Papers<i>, please</i>
                        </span>
                        <kbd>Space</kbd>
                    </button>
                )}
            </div>
            <div className="gk-stamps">
                <button
                    type="button"
                    className="gk-stampbtn gk-stampbtn--approve"
                    // Refusing early can be right (a halt needs no papers); approving unread papers never is.
                    aria-disabled={!ready}
                    title={ready ? undefined : 'Ask for every paper before you approve.'}
                    onClick={() => (ready ? game.decide(true) : onNudge())}
                    data-decide="approve"
                >
                    {Icon.check(22)}
                    <span>
                        Approve<kbd>A</kbd>
                    </span>
                </button>
                <button
                    type="button"
                    className="gk-stampbtn gk-stampbtn--refuse"
                    onClick={onRefuse}
                    data-decide="refuse"
                    aria-expanded={refusing}
                >
                    {Icon.cross(22)}
                    <span>
                        Refuse<kbd>R</kbd>
                    </span>
                </button>
            </div>
            <div className="gk-actions__right">
                {!inspect.hint && !inspect.tutorial && (
                    <button type="button" className="gk-hintbtn" onClick={() => game.showHint()}>
                        {Icon.bulb(15)} <span>Hint</span> <kbd>H</kbd>
                    </button>
                )}
            </div>
        </div>
    );
}

function tutorialLine(inspect: InspectState, papers: Paper[]): string {
    const missing = papers.filter((paper) => !inspect.shown[paper]);
    if (missing.length === papers.length)
        return 'She brought a trade request. Ask for her papers: press the two buttons on the empty slots.';
    if (missing.length > 0) return 'One more paper to ask for.';
    return 'Compare each line with the rulebook on the right: account thawed, credential not expired, jurisdiction accepted. All good? Stamp Approve.';
}

export function Desk() {
    const game = useGame();
    const state = useGameState();
    const inspect = state.inspect;
    const verdict = state.verdict;
    const [refusing, setRefusing] = useState(false);
    const [nudged, setNudged] = useState(0);
    const stamped = verdict !== undefined;
    const visitor = inspect?.number;

    // The list of findings closes with the stamp and never carries over to the next visitor.
    useEffect(() => setRefusing(false), [stamped, visitor]);
    useEffect(() => setNudged(0), [visitor]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            const key = event.key.toLowerCase();
            if (key === '1') game.ask('account');
            else if (key === '2') game.ask('kyc');
            else if (key === '3') game.ask('authority');
            else if (key === 'h') game.showHint();
            else if (key === 'a') {
                if (!game.decide(true)) setNudged((value) => value + 1);
            } else if (key === 'r') setRefusing((value) => !value);
            else if (key === 'escape') setRefusing(false);
            else if (key === ' ') {
                // A button reached with Tab keeps Space; one that only kept the focus from a click gives it up.
                if (controlOwnsKey(event)) return;
                if (game.askAll()) event.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [game]);

    if (!inspect) return null;
    const venue = state.venue;
    const request = inspect.case.request;
    const signer = venue.wallets[request.signer];
    const owner = venue.wallets[request.owner];
    const delegated = request.signer !== request.owner;
    const papers: Paper[] = delegated ? ['account', 'kyc', 'authority'] : ['account', 'kyc'];
    const coach =
        inspect.tutorial && !verdict
            ? tutorialLine(inspect, papers)
            : inspect.hint && !verdict
              ? inspect.case.hint
              : undefined;
    // Once the gate has refused, ring the line the refusal turns on.
    const culprit =
        verdict?.revealed && verdict.truth.reason ? culpritOf(venue, request, verdict.truth.reason) : undefined;
    const ringFor = (paper: Culprit['paper'], wallet?: WalletId): string | undefined =>
        culprit && culprit.paper === paper && (wallet === undefined || culprit.wallet === wallet)
            ? culprit.row
            : undefined;

    return (
        <section
            className="gk-desk"
            data-phase={state.phase}
            data-papers={delegated ? 4 : 3}
            data-refusing={(refusing && !verdict) || undefined}
            aria-label="The gatekeeper's desk"
        >
            <div className="gk-desk__who">
                <div className="gk-portrait">
                    <Portrait who={request.signer} />
                </div>
                <div className="gk-who">
                    <b>{signer.name}</b>
                    <span>{signer.role}</span>
                    <i className="gk-mono">{signer.address}</i>
                </div>
                <div className="gk-desk__count">
                    Visitor {inspect.number} of {CASE_COUNT}
                </div>
            </div>

            <div className="gk-desk__papers">
                {coach && (
                    <div className="gk-coach" role="status">
                        {Icon.bulb(18)}
                        <span>{coach}</span>
                    </div>
                )}
                <div className="gk-papers">
                    <div className="gk-slot gk-slot--shown">
                        <Slip venue={venue} request={request} stamp={verdict} ring={ringFor('slip')} />
                    </div>
                    <Slot
                        shown={inspect.shown.account}
                        title="Stock account"
                        ask="Your stock account, please."
                        hotkey="1"
                        nudge={nudged}
                        onAsk={() => game.ask('account')}
                    >
                        <AccountCard owner={owner} ring={ringFor('account')} />
                    </Slot>
                    <Slot
                        shown={inspect.shown.kyc}
                        title="KYC credential"
                        ask="Show me your KYC."
                        hotkey="2"
                        nudge={nudged}
                        onAsk={() => game.ask('kyc')}
                    >
                        <div className={delegated ? 'gk-stack gk-stack--pair' : 'gk-stack'}>
                            <CredentialCard
                                wallet={owner}
                                now={venue.now}
                                role={delegated ? 'owner' : undefined}
                                compact={delegated}
                                ring={ringFor('kyc', owner.id)}
                            />
                            {delegated && (
                                <CredentialCard
                                    wallet={signer}
                                    now={venue.now}
                                    role="broker"
                                    compact
                                    ring={ringFor('kyc', signer.id)}
                                />
                            )}
                        </div>
                    </Slot>
                    {delegated && (
                        <Slot
                            shown={inspect.shown.authority}
                            title="Approval"
                            ask="Show me the owner's approval."
                            hotkey="3"
                            nudge={nudged}
                            onAsk={() => game.ask('authority')}
                        >
                            <ApprovalSlip owner={owner} signer={signer} ring={ringFor('approval')} />
                        </Slot>
                    )}
                    {/* On a phone the rulebook has no column of its own: it is the last card to swipe to. */}
                    <div className="gk-slot gk-slot--rules">
                        <Rulebook state={state} />
                    </div>
                </div>
                <Actions
                    state={state}
                    inspect={inspect}
                    papers={papers}
                    refusing={refusing}
                    onRefuse={() => setRefusing((value) => !value)}
                    onNudge={() => setNudged((value) => value + 1)}
                />
            </div>

            <div className="gk-desk__side">
                {verdict ? <PoolDecision verdict={verdict} /> : <Rulebook state={state} />}
            </div>

            {refusing && !verdict && (
                <Reasons
                    venue={venue}
                    onPick={(reason) => {
                        setRefusing(false);
                        game.decide(false, reason);
                    }}
                    onClose={() => setRefusing(false)}
                />
            )}
        </section>
    );
}
