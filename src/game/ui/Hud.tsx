'use client';

/**
 * Everything on screen around the town except the desk: the top bar, the
 * narration, chapter cards, the place cards and the day's feed.
 */
import { useEffect, useState } from 'react';

import { AVAILABILITY_LABEL, PLACES } from '../content/places.ts';
import type { GameState } from '../core/state.ts';
import { CASE_COUNT, type ChapterDef } from '../sim/campaign.ts';
import { clock, date, money } from '../sim/format.ts';
import { CHECKS, REASONS, price } from '../sim/rules.ts';
import type { Availability } from '../sim/types.ts';
import { useGame, useGameState } from './context.tsx';
import { Icon } from './icons.tsx';

export function Tag({ availability, label }: { availability: Availability | 'mock'; label?: string }) {
    return (
        <span className="gk-tagchip" data-tone={availability}>
            {label ?? AVAILABILITY_LABEL[availability]}
        </span>
    );
}

function Bulletin({ state }: { state: GameState }) {
    const venue = state.venue;
    const f = venue.features;
    const poolOpen = venue.pool.status === 'open';
    const short = f.reserves && venue.pool.vaultTsa < venue.pool.tsa - 1e-9;
    // The exchange's regular session ends at four o'clock.
    const closed = venue.now >= 16 * 60;
    return (
        <div className="gk-bulletin">
            <div className="gk-chip gk-chip--clock">
                {Icon.clock(16)}
                <span>{date(venue.now)}</span>
                <b className="gk-mono">{clock(venue.now)}</b>
            </div>
            <div
                className="gk-chip"
                data-tone={
                    closed
                        ? 'idle'
                        : venue.market.status === 'trading'
                          ? 'good'
                          : venue.market.status === 'limit'
                            ? 'warn'
                            : 'bad'
                }
            >
                <i className="gk-dot" />
                <span>Exchange</span>
                <b>
                    {closed
                        ? 'CLOSED'
                        : venue.market.status === 'trading'
                          ? 'TRADING'
                          : venue.market.status === 'limit'
                            ? 'LIMIT STATE'
                            : 'HALTED'}
                </b>
            </div>
            <div className="gk-chip" data-tone={!poolOpen ? 'idle' : short || venue.swapsPaused ? 'bad' : 'good'}>
                <i className="gk-dot" />
                <span>Pool</span>
                <b>
                    {!poolOpen
                        ? 'not open'
                        : short
                          ? 'OUT OF BALANCE'
                          : venue.swapsPaused
                            ? 'PAUSED'
                            : `1 TSA = ${money(price(venue))}`}
                </b>
            </div>
            <div
                className="gk-chip gk-chip--slot"
                title="Blocks are slowed down here; real slots take about 0.4 seconds."
            >
                <span>Slot</span>
                <b className="gk-mono">{String(state.slot).padStart(4, '0')}</b>
            </div>
        </div>
    );
}

export function TopBar() {
    const game = useGame();
    const state = useGameState();
    const [menu, setMenu] = useState(false);
    const { settings, score } = state;
    // The menu closes on Escape and on a click anywhere outside it.
    useEffect(() => {
        if (!menu) return undefined;
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') setMenu(false);
        };
        const onDown = (event: PointerEvent): void => {
            if (!(event.target as HTMLElement | null)?.closest('.gk-menu, .gk-logo')) setMenu(false);
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', onDown);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('pointerdown', onDown);
        };
    }, [menu]);
    if (state.phase === 'title' || state.phase === 'loading') return null;
    return (
        <header className="gk-top">
            <div className="gk-top__left">
                <button
                    type="button"
                    className="gk-logo"
                    onClick={() => setMenu((value) => !value)}
                    aria-expanded={menu}
                    aria-label="Menu"
                >
                    {Icon.gate(22)}
                    <b>Gatekeeper</b>
                </button>
                {state.chapter && (
                    <div className="gk-chapterpill">
                        <span>{state.chapter.number === 0 ? 'Prologue' : `Chapter ${state.chapter.number}`}</span>
                        <b>{state.chapter.title}</b>
                        <Tag availability={state.chapter.availability} />
                    </div>
                )}
                {menu && (
                    <div className="gk-menu" role="menu">
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => (setMenu(false), game.begin({ tour: false }))}
                        >
                            Restart the day
                        </button>
                        <button type="button" role="menuitem" onClick={() => (setMenu(false), game.quit())}>
                            Back to the title
                        </button>
                        <div className="gk-menu__group">
                            <span>Graphics</span>
                            {(['low', 'medium', 'high'] as const).map((quality) => (
                                <button
                                    key={quality}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={settings.quality === quality}
                                    onClick={() => game.patchSettings({ quality })}
                                >
                                    {quality}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* The fly-over shows the finished town, not the venue's state: its bulletin waits for the day to start. */}
            {state.phase !== 'tour' && <Bulletin state={state} />}
            <div className="gk-top__right">
                <div className="gk-score" title="Points · decisions that match the pool's">
                    {Icon.star(16)}
                    <b key={score.points} className={score.points > 0 ? 'gk-score__points' : undefined}>
                        {score.points}
                    </b>
                    {score.streak > 1 && (
                        <span className="gk-score__streak">
                            {Icon.flame(14)}
                            {score.streak}
                        </span>
                    )}
                    <i>
                        {state.cases}/{CASE_COUNT}
                    </i>
                </div>
                <button
                    type="button"
                    className="gk-iconbtn"
                    data-on={settings.autoplay}
                    onClick={() => game.patchSettings({ autoplay: !settings.autoplay })}
                    title="Autoplay: the game plays itself (P)"
                    data-control="autoplay"
                >
                    {settings.autoplay ? Icon.pause(18) : Icon.play(18)}
                    <span>{settings.autoplay ? 'Auto on' : 'Auto'}</span>
                </button>
                <button
                    type="button"
                    className="gk-iconbtn"
                    onClick={() => game.cycleSpeed()}
                    title="Speed"
                    data-control="speed"
                >
                    <span className="gk-mono">{settings.speed}×</span>
                </button>
                <button
                    type="button"
                    className="gk-iconbtn"
                    data-on={!settings.muted}
                    onClick={() => game.patchSettings({ muted: !settings.muted })}
                    title="Sound (M)"
                    aria-label={settings.muted ? 'Unmute' : 'Mute'}
                >
                    {settings.muted ? Icon.mute(18) : Icon.sound(18)}
                </button>
            </div>
        </header>
    );
}

/** The story's voice: the tour, the setup prompts and the scripted scenes. */
export function Narration() {
    const game = useGame();
    const state = useGameState();
    const { phase, tour, setup, scene } = state;

    if (phase === 'tour' && tour) {
        return (
            <div className="gk-narration" key={`tour-${tour.index}`} role="status">
                <div className="gk-narration__kicker">
                    Welcome · {tour.index + 1} of {tour.total}
                </div>
                <p>{tour.caption}</p>
                <button
                    type="button"
                    className="gk-btn gk-btn--ghost"
                    onClick={() => game.skip()}
                    disabled={state.skipping}
                >
                    Skip {Icon.skip(14)}
                </button>
            </div>
        );
    }
    if (phase === 'setup' && setup) {
        return (
            <div
                className="gk-narration gk-narration--setup"
                key={`setup-${setup.step.id}-${setup.done}`}
                role="status"
            >
                <div className="gk-narration__kicker">
                    Step {setup.index + 1} of {setup.total} · {setup.step.actor}
                    <Tag availability="live" />
                </div>
                {setup.done ? (
                    <>
                        <p>
                            <b>{setup.step.done}</b>
                        </p>
                        <p className="gk-narration__detail">{setup.step.detail}</p>
                        <button
                            type="button"
                            className="gk-btn gk-btn--primary"
                            onClick={() => game.next()}
                            data-continue
                        >
                            Continue {Icon.arrow(16)}
                        </button>
                    </>
                ) : (
                    <>
                        <p>
                            <b>{setup.step.prompt}</b>
                        </p>
                        {setup.error ? (
                            <p className="gk-narration__error">{setup.error}</p>
                        ) : (
                            <p className="gk-narration__detail">
                                {setup.busy ? 'Working…' : 'Click the glowing button in the town.'}
                            </p>
                        )}
                    </>
                )}
            </div>
        );
    }
    if (phase === 'scene' && scene) {
        return (
            <div className="gk-narration" key={`scene-${scene.scene.id}-${scene.index}`} role="status">
                <div className="gk-narration__kicker">
                    {scene.scene.title}
                    <Tag availability={scene.scene.availability} />
                </div>
                <p>{scene.caption}</p>
                <button
                    type="button"
                    className="gk-btn gk-btn--ghost"
                    onClick={() => game.skip()}
                    disabled={state.skipping}
                >
                    Skip {Icon.skip(14)}
                </button>
            </div>
        );
    }
    return null;
}

export function ChapterCard() {
    const game = useGame();
    const state = useGameState();
    const card: ChapterDef | undefined = state.card;
    if (!card) return null;
    const rules = CHECKS.filter((check) => card.unlocks.includes(check.id));
    return (
        <div className="gk-veil">
            <div className="gk-chapter" key={card.id}>
                <div className="gk-chapter__kicker">{card.number === 0 ? 'Prologue' : `Chapter ${card.number}`}</div>
                <h2>{card.title}</h2>
                <p className="gk-chapter__question">{card.question}</p>
                <div className="gk-chapter__standing">
                    <Tag availability={card.availability} />
                    <span>{card.standing}</span>
                </div>
                {rules.length > 0 && (
                    <div className="gk-chapter__rules">
                        <h3>New in your rulebook</h3>
                        <ul>
                            {rules.map((check) => {
                                const codes = [
                                    ...new Set(
                                        REASONS.filter((reason) => reason.check === check.id).map(
                                            (reason) => reason.code ?? reason.codeNote ?? '',
                                        ),
                                    ),
                                ];
                                return (
                                    <li key={check.id}>
                                        <span>
                                            {check.rule}
                                            {check.exit && <em>{check.exit}</em>}
                                        </span>
                                        {codes.map((code) => (
                                            <code key={code}>{code}</code>
                                        ))}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                <button
                    type="button"
                    className="gk-btn gk-btn--primary gk-btn--big"
                    onClick={() => game.next()}
                    data-continue
                >
                    {card.number === 0 ? 'Build the venue' : 'Open the gate'} {Icon.arrow(18)}
                </button>
            </div>
        </div>
    );
}

export function PlaceCard() {
    const game = useGame();
    const state = useGameState();
    if (!state.info) return null;
    const info = PLACES[state.info];
    const kind = { actor: 'Actor', service: 'Service', contract: 'Contract', chain: 'Chain' }[info.kind];
    return (
        <aside className="gk-place" key={info.id}>
            <button type="button" className="gk-place__close" onClick={() => game.closeInfo()} aria-label="Close">
                {Icon.cross(16)}
            </button>
            <div className="gk-place__kind">{kind}</div>
            <h3>{info.title}</h3>
            <p>{info.what}</p>
            <ul>
                {info.does.map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>
            <div className="gk-place__real">
                <span>In the real system</span>
                <p>{info.real}</p>
            </div>
            <div className="gk-place__standing">
                <Tag availability={info.availability} />
                <span>{info.standing}</span>
            </div>
        </aside>
    );
}

/** The day's decisions so far: what the indexer recorded (fills, liquidity moves and refusals). */
export function Feed() {
    const state = useGameState();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (state.phase === 'title') setOpen(false);
    }, [state.phase]);
    if (state.phase === 'title' || state.phase === 'loading' || state.phase === 'summary' || state.ledger.length === 0)
        return null;
    const entries = [...state.ledger].reverse();
    return (
        <div className="gk-feed" data-open={open}>
            <button
                type="button"
                className="gk-feed__toggle"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
            >
                {Icon.list(16)}
                <span>Record</span>
                <b>{state.ledger.length}</b>
            </button>
            {open && (
                <div className="gk-feed__panel">
                    <h4>What the indexer recorded</h4>
                    <ul>
                        {entries.map((entry) => (
                            <li key={`${entry.id}-${entry.time}`} data-outcome={entry.outcome}>
                                <span className="gk-mono">{clock(entry.time)}</span>
                                <b>{entry.who}</b>
                                <span>{entry.summary}</span>
                                {entry.outcome === 'refuse' && <code>{entry.code ?? 'no code'}</code>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
