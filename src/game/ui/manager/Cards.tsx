'use client';

/** Manager mode's big cards: the scenario picker, the briefing and the result. */
import { useEffect, useMemo } from 'react';

import type { ManagerState } from '../../core/state.ts';
import { SCENARIO_LIST, type ScenarioDef, type ScenarioId } from '../../sim/scenarios.ts';
import { useGame } from '../context.tsx';
import { Tag } from '../Hud.tsx';
import { Icon } from '../icons.tsx';
import { StockChip, showMeOf } from './kit.tsx';
import { fromWords, standingLine } from './words.ts';
import { MISSIONS, closePicker, nextMission, openPicker, readBest, saveBest, usePickerOpen } from './picker.ts';

const DIFFICULTY = ['', 'Easy', 'Medium', 'Hard'] as const;

function Pips({ level }: { level: 1 | 2 | 3 }) {
    return (
        <span className="gk-pips" role="img" aria-label={`Difficulty: ${DIFFICULTY[level]}`} title={DIFFICULTY[level]}>
            {[1, 2, 3].map((pip) => (
                <i key={pip} data-on={pip <= level || undefined} />
            ))}
        </span>
    );
}

function Stars({ count, size = 16, label }: { count: number; size?: number; label?: string }) {
    return (
        <span className="gk-stars" role="img" aria-label={label ?? `${count} of 3 stars`}>
            {[1, 2, 3].map((star) => (
                <i key={star} data-on={star <= count || undefined}>
                    {Icon.star(size)}
                </i>
            ))}
        </span>
    );
}

function counts(scenario: ScenarioDef): string {
    const rails = scenario.objectives.filter((objective) => objective.keep).length;
    const goals = scenario.objectives.length - rails;
    const parts = [`${goals} goal${goals === 1 ? '' : 's'}`];
    if (rails > 0) parts.push(`${rails} guard rail${rails === 1 ? '' : 's'}`);
    parts.push(`par ${scenario.par}`);
    return parts.join(' · ');
}

/** Every scenario, in order, with the viewer's best stars. */
export function ScenarioPicker() {
    const game = useGame();
    const open = usePickerOpen();
    // Read when the picker opens: a result card may have just stored new stars.
    const best = useMemo(() => (open ? readBest() : {}), [open]);
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') closePicker();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    if (!open) return null;
    const free = SCENARIO_LIST.find((scenario) => scenario.sandbox);
    const start = (id: ScenarioId): void => {
        closePicker();
        game.beginManager(id);
    };
    return (
        <div
            className="gk-veil"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) closePicker();
            }}
        >
            <div className="gk-picker" role="dialog" aria-modal="true" aria-labelledby="gk-picker-title">
                <header className="gk-picker__head">
                    <div>
                        <div className="gk-chapter__kicker">Run the venue</div>
                        <h2 id="gk-picker-title">Choose a scenario</h2>
                        <p>
                            You hold the keys to the whole venue, from the KYC bureau to the council. Each scenario sets
                            it in a state and gives you an order; the pool&apos;s own checks judge every objective.
                        </p>
                    </div>
                    <button type="button" className="gk-place__close" onClick={closePicker} aria-label="Close">
                        {Icon.cross(16)}
                    </button>
                </header>
                <ol className="gk-picker__list">
                    {MISSIONS.map((scenario, index) => (
                        <li key={scenario.id}>
                            <button
                                type="button"
                                onClick={() => start(scenario.id)}
                                data-scenario={scenario.id}
                                autoFocus={index === 0}
                            >
                                <b className="gk-picker__num">{scenario.number}</b>
                                <span className="gk-picker__main">
                                    <b>{scenario.title}</b>
                                    <span className="gk-picker__from">{fromWords(scenario.from)}</span>
                                </span>
                                <span className="gk-picker__meta">
                                    <span className="gk-picker__tags">
                                        <Pips level={scenario.difficulty} />
                                        <Tag availability={scenario.availability} />
                                    </span>
                                    <span>{counts(scenario)}</span>
                                </span>
                                <Stars
                                    count={best[scenario.id] ?? 0}
                                    label={
                                        best[scenario.id]
                                            ? `Your best: ${best[scenario.id]} of 3 stars`
                                            : 'Not solved yet'
                                    }
                                />
                            </button>
                        </li>
                    ))}
                </ol>
                {free && (
                    <button
                        type="button"
                        className="gk-picker__free"
                        onClick={() => start(free.id)}
                        data-scenario={free.id}
                    >
                        <span className="gk-picker__num">{Icon.key(18)}</span>
                        <span className="gk-picker__main">
                            <b>{free.title}</b>
                            <span>{free.brief}</span>
                        </span>
                        <span className="gk-picker__meta">
                            <span className="gk-picker__tags">
                                <Tag availability="live" label="Live" />
                                <Tag availability="review" label="In review" />
                                <Tag availability="planned" label="Planned" />
                            </span>
                            <span>every rule · no objectives</span>
                        </span>
                        <i className="gk-picker__go">{Icon.arrow(18)}</i>
                    </button>
                )}
            </div>
        </div>
    );
}

/** The scenario's card: the order, where its rules stand, and what must hold. */
export function Briefing({ m }: { m: ManagerState }) {
    const game = useGame();
    const showMe = m.scenario.sandbox ? undefined : showMeOf(game);
    const { scenario } = m;
    const goals = m.objectives.filter((objective) => !objective.keep);
    const rails = m.objectives.filter((objective) => objective.keep);
    return (
        <div className="gk-veil">
            <div className="gk-chapter gk-briefing" key={scenario.id} role="dialog" aria-labelledby="gk-briefing-title">
                <div className="gk-chapter__kicker">
                    {scenario.number ? `Scenario ${scenario.number}` : 'Free play'} · {fromWords(scenario.from)}
                </div>
                <h2 id="gk-briefing-title">{scenario.title}</h2>
                <p className="gk-chapter__question">{scenario.brief}</p>
                <div className="gk-chapter__standing">
                    <Tag availability={scenario.availability} />
                    <span>{standingLine(scenario.availability, scenario.standing)}</span>
                </div>
                {m.objectives.length > 0 && (
                    <div className="gk-chapter__rules gk-briefing__goals">
                        <h3>{Icon.target(13)} Goals</h3>
                        <ul>
                            {goals.map((objective) => (
                                <li key={objective.id}>
                                    <span>{objective.label}</span>
                                    {objective.stock && <StockChip stock={objective.stock} />}
                                </li>
                            ))}
                        </ul>
                        {rails.length > 0 && (
                            <>
                                <h3>
                                    {Icon.shield(13)} Guard rails <em>they hold now: keep them holding</em>
                                </h3>
                                <ul>
                                    {rails.map((objective) => (
                                        <li key={objective.id}>
                                            <span>{objective.label}</span>
                                            {objective.stock && <StockChip stock={objective.stock} />}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
                <p className="gk-briefing__par">
                    {scenario.sandbox ? (
                        'No objectives and no par: every action is yours.'
                    ) : (
                        <>
                            Par <b>{scenario.par}</b> {scenario.par === 1 ? 'move' : 'moves'} ·{' '}
                            <Pips level={scenario.difficulty} /> {DIFFICULTY[scenario.difficulty]}
                        </>
                    )}
                </p>
                <button
                    type="button"
                    className="gk-btn gk-btn--primary gk-btn--big"
                    onClick={() => game.next()}
                    data-continue
                    autoFocus
                >
                    Take charge {Icon.arrow(18)}
                </button>
                {showMe && (
                    <button type="button" className="gk-btn gk-btn--ghost gk-briefing__watch" onClick={showMe}>
                        {Icon.play(13)} Or watch one way through (not scored)
                    </button>
                )}
            </div>
        </div>
    );
}

/** The scenario is solved: the stars, how they were earned, and what it teaches. */
export function Debrief({ m }: { m: ManagerState }) {
    const game = useGame();
    const { scenario, result } = m;
    useEffect(() => {
        if (result && !result.watched) saveBest(scenario.id, result.stars);
    }, [scenario.id, result]);
    if (!result) return null;
    const watched = result.watched === true;
    // After the last mission, the way on is free play.
    const next = nextMission(scenario.id) ?? SCENARIO_LIST.find((item) => item.sandbox);
    const within = result.actions <= result.par;
    const lines: ReadonlyArray<{ ok: boolean; text: string }> = [
        { ok: true, text: 'Solved: every objective held at the gate.' },
        {
            ok: within,
            text: within
                ? `Within par: ${result.actions} ${result.actions === 1 ? 'move' : 'moves'}, par ${result.par}.`
                : `Over par: ${result.actions} moves, par ${result.par}.`,
        },
        {
            ok: !result.slipped,
            text: result.slipped
                ? 'A guard rail broke on the way, even if you put it right.'
                : 'No guard rail ever broke.',
        },
    ];
    return (
        <div className="gk-veil gk-veil--summary">
            <div className="gk-chapter gk-result" role="dialog" aria-labelledby="gk-result-title">
                <div className="gk-chapter__kicker">
                    {scenario.number ? `Scenario ${scenario.number}` : 'Free play'} · {watched ? 'watched' : 'done'}
                </div>
                <h2 id="gk-result-title">{scenario.title}</h2>
                {watched ? (
                    <p className="gk-result__watched">
                        {Icon.play(14)} You watched one way through, in {result.actions}{' '}
                        {result.actions === 1 ? 'move' : 'moves'} (par {result.par}). A watched run earns no stars: play
                        it yourself for those.
                    </p>
                ) : (
                    <>
                        <Stars count={result.stars} size={40} />
                        <ul className="gk-result__lines">
                            {lines.map((line) => (
                                <li key={line.text} data-ok={line.ok}>
                                    {line.ok ? Icon.check(16) : Icon.cross(16)}
                                    <span>{line.text}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {!watched && (
                    <p className="gk-result__hints">
                        {result.hints === 0
                            ? 'No hints used.'
                            : `${result.hints} of ${scenario.hints.length} hint${scenario.hints.length === 1 ? '' : 's'} used.`}
                    </p>
                )}
                <div className="gk-result__lesson">
                    <span>What it shows</span>
                    <p>{scenario.lesson}</p>
                    <div className="gk-chapter__standing">
                        <Tag availability={scenario.availability} />
                        <span>{standingLine(scenario.availability, scenario.standing)}</span>
                    </div>
                </div>
                <div className="gk-result__actions">
                    {watched && (
                        <button
                            type="button"
                            className="gk-btn gk-btn--primary gk-btn--big"
                            onClick={() => game.manager.restart()}
                            autoFocus
                        >
                            {Icon.restart(18)} Now you try
                        </button>
                    )}
                    {next && (
                        <button
                            type="button"
                            className={watched ? 'gk-btn' : 'gk-btn gk-btn--primary gk-btn--big'}
                            onClick={() => game.beginManager(next.id)}
                            autoFocus={!watched}
                        >
                            Next: {next.title} {Icon.arrow(watched ? 16 : 18)}
                        </button>
                    )}
                    {!watched && (
                        <button type="button" className="gk-btn" onClick={() => game.manager.restart()}>
                            {Icon.restart(16)} Play again
                        </button>
                    )}
                    <button type="button" className="gk-btn" onClick={openPicker}>
                        {Icon.grid(16)} All scenarios
                    </button>
                    <button type="button" className="gk-btn gk-btn--ghost" onClick={() => game.quit()}>
                        Back to the title
                    </button>
                </div>
            </div>
        </div>
    );
}
