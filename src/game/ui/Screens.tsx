'use client';

/** The title screen and the end-of-day summary. */
import type { LedgerEntry } from '../core/state.ts';
import { CASE_COUNT, CHAPTER_LIST } from '../sim/campaign.ts';
import { clock } from '../sim/format.ts';
import { reasonDef, settledWord } from '../sim/rules.ts';
import type { Availability } from '../sim/types.ts';
import { useGame, useGameState } from './context.tsx';
import { Tag } from './Hud.tsx';
import { Icon } from './icons.tsx';
import { MISSIONS, openPicker } from './manager/picker.ts';

export function Title() {
    const game = useGame();
    const state = useGameState();
    if (state.phase !== 'title') return null;
    return (
        <div className="gk-title">
            <div className="gk-title__card">
                <div className="gk-title__brand">
                    <div className="gk-title__mark">{Icon.gate(40)}</div>
                    <h1>Gatekeeper</h1>
                </div>
                <p className="gk-title__tagline">You are the pool&apos;s checks. Nobody trades without passing you.</p>
                <p className="gk-title__blurb">
                    One town, one tokenized stock, one venue day. Meet everyone who makes the venue work, then stand at
                    the gate: ask for papers, read them against the rulebook, and stamp.
                </p>
                <div className="gk-title__actions">
                    <button
                        type="button"
                        className="gk-btn gk-btn--primary gk-btn--big"
                        onClick={() => game.begin({ autoplay: false })}
                        data-start="play"
                    >
                        {Icon.play(18)} Start the day
                    </button>
                    <button
                        type="button"
                        className="gk-btn gk-btn--big"
                        onClick={() => game.begin({ autoplay: true })}
                        data-start="watch"
                    >
                        Watch it play
                    </button>
                </div>
                <div className="gk-title__chapters">
                    <span>Or start at a chapter</span>
                    <div>
                        {CHAPTER_LIST.map((chapter) => (
                            <button
                                key={chapter.id}
                                type="button"
                                onClick={() => game.begin({ chapter: chapter.id, tour: false, autoplay: false })}
                                data-chapter={chapter.id}
                            >
                                <b>{chapter.number}</b>
                                <span>{chapter.title}</span>
                                <i className="gk-dot" data-tone={chapter.availability} />
                            </button>
                        ))}
                    </div>
                </div>
                {/* The second way in: the player runs the whole venue instead of standing at its gate. */}
                <button type="button" className="gk-title__venue" onClick={openPicker} data-start="manager">
                    <span className="gk-title__venuemark">{Icon.key(22)}</span>
                    <span className="gk-title__venuetext">
                        <b>Run the venue</b>
                        <span>
                            {MISSIONS.length} missions and free play: hold every key, from the KYC bureau to the
                            council.
                        </span>
                    </span>
                    <i>{Icon.arrow(18)}</i>
                </button>
                <div className="gk-title__legend">
                    <Tag availability="live" />
                    <Tag availability="review" />
                    <Tag availability="planned" />
                    <Tag availability="mock" />
                </div>
                <p className="gk-title__foot">
                    A playable explainer for the Solana TSV reference implementation. Everything runs in your browser:
                    no wallet, no chain, no real market data. Each rule says whether it is live on the main branch, in
                    review or planned. Not legal advice.
                </p>
            </div>
            <p className="gk-title__hint">Point at a building to see its name. Click it to see what it is.</p>
        </div>
    );
}

const RANKS: ReadonlyArray<{ min: number; letter: string; title: string }> = [
    { min: 0.97, letter: 'S', title: 'The pool could not have done it better' },
    { min: 0.85, letter: 'A', title: 'A gatekeeper the venue can trust' },
    { min: 0.65, letter: 'B', title: 'Solid, with a few slips' },
    { min: 0, letter: 'C', title: 'The pool caught what you missed' },
];

/** The day's rules, one line each, with where each stands in the real system. */
const ENFORCED: ReadonlyArray<{ availability: Availability; rule: string }> = [
    {
        availability: 'live',
        rule: 'Accounts start frozen and a credential thaws them, yet the pool reads the credential on every trade.',
    },
    {
        availability: 'live',
        rule: 'The issuer decides who may hold the stock; the venue’s policy decides who may trade it here.',
    },
    {
        availability: 'live',
        rule: 'Leaving stays possible: an expired credential may still withdraw; a revoked one is held.',
    },
    {
        availability: 'review',
        rule: 'If the primary market halts, or its evidence goes stale, the pool stops trading. Withdrawals pass.',
    },
    {
        availability: 'planned',
        rule: 'The venue’s own brakes: a pause held by role multisigs, honest reserves and a daily share budget.',
    },
];

/** A finding's title inside a sentence. */
function inline(title: string): string {
    return title.charAt(0).toLowerCase() + title.slice(1);
}

/** What the player stamped against what the pool decided, for one visitor they got wrong or half right. */
function slipLine(entry: LedgerEntry): string {
    const pool =
        entry.outcome === 'fill'
            ? `the pool ${entry.request.op === 'buy' || entry.request.op === 'sell' ? 'filled it' : 'let it through'}`
            : `the pool: ${entry.reason ? inline(reasonDef(entry.reason).title) : 'refused'}`;
    if (!entry.stamp) return pool;
    if (entry.stamp.approved) return `You approved; ${pool}.`;
    const cited = entry.stamp.cited ? inline(reasonDef(entry.stamp.cited).title) : undefined;
    if (entry.outcome === 'fill') return `You refused${cited ? ` (${cited})` : ''}; ${pool}.`;
    return `You cited: ${cited ?? 'nothing'}; ${pool}.`;
}

export function Summary() {
    const game = useGame();
    const state = useGameState();
    if (state.phase !== 'summary') return null;
    const { score, ledger } = state;
    const judged = score.correct + score.partial + score.wrong;
    const whole = judged >= CASE_COUNT;
    const ratio = judged === 0 ? 1 : (score.correct + score.partial * 0.4) / judged;
    const rank = RANKS.find((item) => ratio >= item.min) ?? (RANKS[RANKS.length - 1] as (typeof RANKS)[number]);
    const settled = ledger.filter((entry) => entry.outcome === 'fill');
    // Only a swap that settles is a fill; deposits and withdrawals are liquidity moves.
    const fills = settled.filter((entry) => entry.request.op === 'buy' || entry.request.op === 'sell').length;
    const moves = settled.length - fills;
    const refusals = ledger.length - settled.length;
    const codes = [
        ...new Set(
            ledger
                .filter((entry) => entry.outcome === 'refuse')
                .map((entry) => (entry.code ? String(entry.code) : 'no code yet')),
        ),
    ].sort();
    const slips = ledger.filter((entry) => entry.grade === 'wrong' || entry.grade === 'partial');
    // A letter is for a whole day at the gate; part of a day gets its count, not a grade.
    const title =
        judged === 0
            ? 'The day is done'
            : whole
              ? rank.title
              : slips.length === 0
                ? `${judged} visitors, ${judged} right calls`
                : `${score.correct} of ${judged} matched the pool`;
    return (
        <div className="gk-veil gk-veil--summary">
            <div className="gk-summary">
                <div className="gk-summary__head">
                    <div className="gk-summary__rank" data-rank={whole ? rank.letter : 'none'}>
                        {whole ? rank.letter : Icon.gate(54)}
                    </div>
                    <div>
                        <div className="gk-chapter__kicker">Closing bell</div>
                        <h2>{title}</h2>
                        <p>
                            {!whole &&
                                (judged === 0
                                    ? 'You watched the pool decide. '
                                    : `You judged ${judged} of the ${CASE_COUNT} visitors: play the whole day for a grade. `)}
                            {ledger.length} decisions on chain: {fills} fills, {moves} liquidity moves and {refusals}{' '}
                            refusals. In the real system the indexer and the archive record each one with the state it
                            read.
                        </p>
                    </div>
                </div>
                <div className="gk-summary__stats">
                    <div>
                        <b>{score.points}</b>
                        <span>points</span>
                    </div>
                    <div>
                        <b>
                            {score.correct}/{judged}
                        </b>
                        <span>{judged === 0 ? 'none judged by you' : 'of yours matched the pool'}</span>
                    </div>
                    <div>
                        <b>{score.partial}</b>
                        <span>right call, wrong finding</span>
                    </div>
                    <div>
                        <b>{score.wrong}</b>
                        <span>overruled by the pool</span>
                    </div>
                    <div>
                        <b>{score.best}</b>
                        <span>best streak</span>
                    </div>
                </div>

                <h3 className="gk-summary__title">What the gate enforced today</h3>
                <ul className="gk-summary__rules">
                    {ENFORCED.map((item) => (
                        <li key={item.rule}>
                            <Tag availability={item.availability} />
                            <span>{item.rule}</span>
                        </li>
                    ))}
                </ul>

                {judged > 0 && (
                    <>
                        <h3 className="gk-summary__title">
                            {slips.length === 0 ? 'Nothing slipped past you' : 'Where the pool corrected you'}
                        </h3>
                        {slips.length > 0 && (
                            <ul className="gk-summary__slips">
                                {slips.map((entry) => (
                                    <li key={`${entry.id}-${entry.time}`} data-grade={entry.grade}>
                                        <i>{entry.grade === 'wrong' ? Icon.cross(14) : Icon.info(14)}</i>
                                        <span className="gk-mono">{clock(entry.time)}</span>
                                        <b>{entry.who}</b>
                                        <span>{slipLine(entry)}</span>
                                        {entry.chapter && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    game.begin({
                                                        chapter: entry.chapter?.id,
                                                        tour: false,
                                                        autoplay: false,
                                                    })
                                                }
                                            >
                                                Replay chapter {entry.chapter.number}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}

                <details className="gk-summary__record">
                    <summary>
                        The day’s record: {ledger.length} decisions
                        <span className="gk-summary__codes">
                            {codes.map((code) => (
                                <code key={code}>{code}</code>
                            ))}
                        </span>
                    </summary>
                    <ul className="gk-summary__ledger">
                        {ledger.map((entry) => (
                            <li
                                key={`${entry.id}-${entry.time}`}
                                data-outcome={entry.outcome}
                                data-grade={entry.grade ?? 'auto'}
                            >
                                <span className="gk-mono">{clock(entry.time)}</span>
                                <b>{entry.who}</b>
                                <span>{entry.summary}</span>
                                {entry.outcome === 'refuse' ? (
                                    <code>{entry.code ?? 'no code'}</code>
                                ) : (
                                    <code data-fill>{settledWord(entry.request.op).toLowerCase()}</code>
                                )}
                                <i>
                                    {entry.grade === 'correct'
                                        ? Icon.check(14)
                                        : entry.grade === 'wrong'
                                          ? Icon.cross(14)
                                          : entry.grade === 'partial'
                                            ? Icon.info(14)
                                            : null}
                                </i>
                            </li>
                        ))}
                    </ul>
                </details>
                <div className="gk-summary__actions">
                    <button
                        type="button"
                        className="gk-btn gk-btn--primary gk-btn--big"
                        onClick={() => game.begin({ tour: false, autoplay: false })}
                    >
                        Play again
                    </button>
                    <button type="button" className="gk-btn gk-btn--big" onClick={() => game.quit()}>
                        Back to the title
                    </button>
                </div>
            </div>
        </div>
    );
}
