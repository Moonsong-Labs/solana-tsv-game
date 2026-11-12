'use client';

/**
 * The objectives panel: the order, what the pool says about each objective
 * right now, hints, moves against par, the way to finish, and what happened.
 */
import { useState } from 'react';

import type { GameState, ManagerLogEntry, ManagerState, ObjectiveView } from '../../core/state.ts';
import { actionDef } from '../../sim/actions.ts';
import { clock } from '../../sim/format.ts';
import { useGame } from '../context.tsx';
import { Tag } from '../Hud.tsx';
import { Icon } from '../icons.tsx';
import { StockChip, isBusy, showMeOf } from './kit.tsx';
import { fromWords, mustWords, passWord, refusalText, standingLine } from './words.ts';

const SHORT_TAG = { live: 'Live', review: 'In review', planned: 'Planned', mock: 'Simulated' } as const;

function Objective({ objective, busy }: { objective: ObjectiveView; busy: boolean }) {
    const game = useGame();
    const op = objective.request?.op;
    const broken = objective.keep && !objective.met;
    const now =
        objective.kind === 'state'
            ? objective.met
                ? 'holds'
                : 'not yet'
            : objective.outcome === 'fill'
              ? passWord(op)
              : objective.outcome === 'refuse'
                ? `refused · ${refusalText(objective.reason)}`
                : '…';
    return (
        <li className="gk-obj" data-met={objective.met} data-broken={broken || undefined}>
            <span
                className="gk-obj__mark"
                role="img"
                aria-label={objective.met ? 'Holds' : broken ? 'Broken' : 'Not yet'}
            >
                {objective.met ? Icon.check(13) : broken ? Icon.cross(13) : Icon.circle(13)}
            </span>
            <div className="gk-obj__body">
                <span className="gk-obj__label">{objective.label}</span>
                <span className="gk-obj__meta">
                    {objective.stock && <StockChip stock={objective.stock} />}
                    <span className="gk-obj__must">
                        {objective.kind === 'trade' && objective.expect ? mustWords(op, objective.expect) : 'must hold'}
                    </span>
                    {objective.kind === 'trade' && (
                        <button
                            type="button"
                            className="gk-try"
                            disabled={busy}
                            onClick={() => game.manager.probe(objective.id)}
                            title="Send this trade through the gate"
                            data-probe={objective.id}
                        >
                            Try it
                        </button>
                    )}
                </span>
                <span className="gk-obj__now" data-outcome={objective.outcome}>
                    {objective.kind === 'trade' ? 'Pool now: ' : 'Now: '}
                    <b>{now}</b>
                </span>
            </div>
        </li>
    );
}

function LogList({ log, limit }: { log: readonly ManagerLogEntry[]; limit?: number }) {
    const entries = [...log].reverse().slice(0, limit);
    if (entries.length === 0) return <p className="gk-mempty">Nothing has happened yet.</p>;
    return (
        <ol className="gk-log">
            {entries.map((entry) => (
                <li key={entry.id} data-tone={entry.tone}>
                    <span className="gk-mono">{clock(entry.time)}</span>
                    <span className="gk-log__text">{entry.text}</span>
                    {entry.availability && entry.tone !== 'hint' && (
                        <Tag availability={entry.availability} label={SHORT_TAG[entry.availability]} />
                    )}
                </li>
            ))}
        </ol>
    );
}

/** What the indexer recorded: every trade that reached the chain, filled or refused. */
export function RecordList({ state }: { state: GameState }) {
    const entries = [...state.ledger].reverse();
    if (entries.length === 0)
        return (
            <p className="gk-mempty">
                No trade has reached the chain yet. Try an objective, or send one from the gate.
            </p>
        );
    return (
        <>
            <p className="gk-mnote">
                What the indexer recorded: fills, liquidity moves and refusals, each with its code.
            </p>
            <ul className="gk-record">
                {entries.map((entry) => (
                    <li key={`${entry.id}-${entry.time}`} data-outcome={entry.outcome}>
                        <span className="gk-mono">{clock(entry.time)}</span>
                        <b>{entry.who}</b>
                        {entry.stock && <StockChip stock={entry.stock} />}
                        <span>{entry.summary}</span>
                        {entry.outcome === 'refuse' && <code>{entry.code ?? 'no code'}</code>}
                    </li>
                ))}
            </ul>
        </>
    );
}

export function GoalsPanel({
    state,
    m,
    sheet,
    onHide,
}: {
    state: GameState;
    m: ManagerState;
    sheet: boolean;
    onHide: () => void;
}) {
    const game = useGame();
    const [tab, setTab] = useState<'goals' | 'record'>('goals');
    const busy = isBusy(state);
    const { scenario } = m;
    const sandbox = scenario.sandbox === true;
    const goals = m.objectives.filter((objective) => !objective.keep);
    const rails = m.objectives.filter((objective) => objective.keep);
    const met = m.objectives.filter((objective) => objective.met).length;
    const hintsLeft = m.hints < scenario.hints.length;
    const over = !sandbox && m.actions > scenario.par;
    const acting = m.acting ? actionDef(m.acting.action) : undefined;
    const showMe = showMeOf(game);
    const status = m.finishing
        ? 'The final run: every objective walks through the gate…'
        : m.watched && !acting && !m.probe
          ? 'Watching one way through. A watched run is not scored.'
          : acting
            ? `${acting.actor}: ${m.acting?.label ?? acting.title}…`
            : m.probe
              ? 'A trade is at the gate…'
              : undefined;

    return (
        <aside className="gk-mpanel gk-goals" data-frame={sheet ? 'bottom' : 'left'} aria-label="Objectives">
            <header className="gk-mpanel__head">
                <div className="gk-mpanel__kicker">
                    {scenario.number ? `Scenario ${scenario.number}` : 'Free play'} · {fromWords(scenario.from)}
                </div>
                <h3>{scenario.title}</h3>
                <button type="button" className="gk-mpanel__hide" onClick={onHide} aria-label="Hide the objectives">
                    {Icon.chevron(16)}
                </button>
                <details className="gk-brief">
                    <summary>The order</summary>
                    <p>{scenario.brief}</p>
                    <div className="gk-brief__standing">
                        <Tag availability={scenario.availability} />
                        <span>{standingLine(scenario.availability, scenario.standing)}</span>
                    </div>
                </details>
                <div className="gk-mtabs" role="tablist" aria-label="Panel">
                    <button type="button" role="tab" aria-selected={tab === 'goals'} onClick={() => setTab('goals')}>
                        {sandbox ? 'The venue' : 'Goals'}
                        {!sandbox && (
                            <b>
                                {met}/{m.objectives.length}
                            </b>
                        )}
                    </button>
                    <button type="button" role="tab" aria-selected={tab === 'record'} onClick={() => setTab('record')}>
                        Record <b>{state.ledger.length}</b>
                    </button>
                </div>
            </header>

            <div className="gk-mpanel__body">
                {tab === 'record' ? (
                    <RecordList state={state} />
                ) : (
                    <>
                        {sandbox ? (
                            <div className="gk-free">
                                <p>
                                    No objectives: every rule is in force and every building answers. Change the venue,
                                    then send trades through the gate and watch the pool decide.
                                </p>
                                <button
                                    type="button"
                                    className="gk-btn"
                                    disabled={busy}
                                    onClick={() => game.manager.openMenu('gate', undefined, { trade: true })}
                                >
                                    {Icon.send(15)} Compose a trade at the gate
                                </button>
                            </div>
                        ) : (
                            <>
                                <h4 className="gk-mhead">{Icon.target(14)} Goals</h4>
                                <ul className="gk-objs">
                                    {goals.map((objective) => (
                                        <Objective key={objective.id} objective={objective} busy={busy} />
                                    ))}
                                </ul>
                                {rails.length > 0 && (
                                    <>
                                        <h4 className="gk-mhead">
                                            {Icon.shield(14)} Guard rails <span>hold now; keep them holding</span>
                                        </h4>
                                        <ul className="gk-objs">
                                            {rails.map((objective) => (
                                                <Objective key={objective.id} objective={objective} busy={busy} />
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </>
                        )}
                        {m.hints > 0 && (
                            <ol className="gk-hints" aria-label="Hints">
                                {scenario.hints.slice(0, m.hints).map((hint) => (
                                    <li key={hint}>
                                        {Icon.bulb(15)}
                                        <span>{hint}</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                        <h4 className="gk-mhead">
                            {Icon.list(14)} What happened <span>newest first</span>
                        </h4>
                        <LogList log={m.log} limit={30} />
                    </>
                )}
            </div>

            <footer className="gk-mpanel__foot">
                {status && (
                    <p className="gk-busy" role="status">
                        <i aria-hidden="true" />
                        {status}
                    </p>
                )}
                <div className="gk-foot__row">
                    <span className="gk-movecount" data-over={over || undefined}>
                        {sandbox ? (
                            <>
                                Moves <b>{m.actions}</b>
                            </>
                        ) : (
                            <>
                                Moves <b>{m.actions}</b> <i>par {scenario.par}</i>
                            </>
                        )}
                    </span>
                    {hintsLeft && (
                        <button
                            type="button"
                            className="gk-hintbtn"
                            aria-label={`Hint ${m.hints + 1} of ${scenario.hints.length}`}
                            onClick={() => game.manager.hint()}
                            disabled={state.phase !== 'manage' || m.watched === true}
                        >
                            {Icon.bulb(15)}
                            <span>
                                Hint {m.hints + 1} of {scenario.hints.length}
                            </span>
                        </button>
                    )}
                    {showMe && !sandbox && !hintsLeft && (
                        <button
                            type="button"
                            className="gk-showme"
                            onClick={showMe}
                            disabled={busy}
                            title="The game plays one way through from the start. Not scored."
                        >
                            {Icon.play(13)} Show me
                        </button>
                    )}
                </div>
                {!sandbox && (
                    <button
                        type="button"
                        className={`gk-btn gk-finish${m.solved ? ' gk-btn--primary' : ''}`}
                        disabled={!m.solved || busy}
                        onClick={() => game.manager.finish()}
                        data-finish
                    >
                        {m.solved ? (
                            <>{Icon.flag(16)} Finish: send them through</>
                        ) : (
                            `Finish once every objective holds (${met}/${m.objectives.length})`
                        )}
                    </button>
                )}
            </footer>
        </aside>
    );
}

/** The objectives folded away: how many hold, and a way back. */
export function GoalsChip({ m, onShow }: { m: ManagerState; onShow: () => void }) {
    const sandbox = m.scenario.sandbox === true;
    const met = m.objectives.filter((objective) => objective.met).length;
    return (
        <button
            type="button"
            className="gk-goalchip"
            onClick={onShow}
            aria-label={sandbox ? 'Show the venue panel' : `Show the objectives: ${met} of ${m.objectives.length} hold`}
            data-solved={m.solved || undefined}
        >
            {Icon.target(16)}
            {sandbox ? (
                <span>Free play</span>
            ) : (
                <span>
                    Goals{' '}
                    <b>
                        {met}/{m.objectives.length}
                    </b>
                </span>
            )}
            {m.solved && <i>Finish</i>}
        </button>
    );
}
