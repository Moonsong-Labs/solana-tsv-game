'use client';

/** Manager mode's small parts: stock chips and tabs, status chips, choices and form fields. */
import type { CSSProperties, ReactNode } from 'react';

import type { Game } from '../../core/game.ts';
import type { GameState, ManagerState } from '../../core/state.ts';
import { actionDef, offered, type ActionId } from '../../sim/actions.ts';
import { STOCKS, listed, type StockId } from '../../sim/park.ts';
import type { Tone } from './words.ts';

/** Whether every action and trade button waits: something plays out, or the venue is not in the player's hands. */
export function isBusy(state: GameState): boolean {
    const m = state.manager;
    return !m || state.phase !== 'manage' || !!m.acting || !!m.probe || m.finishing || m.watched === true;
}

/** The director's "Show me": it plays the scenario's own solution, unscored. */
export function showMeOf(game: Game): () => void {
    return () => game.manager.showMe();
}

/** Whether an action belongs on this venue right now. */
export function isOffered(m: ManagerState, action: ActionId): boolean {
    return offered(m.park, actionDef(action), m.scenario.sandbox === true);
}

function toneStyle(stock: StockId): CSSProperties {
    return { '--stock': STOCKS[stock].tone } as CSSProperties;
}

/** A stock's symbol in its colour. */
export function StockChip({ stock }: { stock: StockId }) {
    return (
        <span className="gk-stock" style={toneStyle(stock)} title={STOCKS[stock].name}>
            {stock}
        </span>
    );
}

/** A short status in its tone: green, amber, red or grey. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
    return (
        <span className="gk-status" data-tone={tone}>
            {children}
        </span>
    );
}

/** The listed stocks, one tab each. */
export function StockTabs({
    m,
    value,
    onPick,
    label = 'Stock',
}: {
    m: ManagerState;
    value: StockId;
    onPick: (stock: StockId) => void;
    label?: string;
}) {
    const stocks = listed(m.park);
    if (stocks.length < 2) return null;
    return (
        <div className="gk-stocktabs" role="tablist" aria-label={label}>
            {stocks.map((stock) => (
                <button
                    key={stock}
                    type="button"
                    role="tab"
                    aria-selected={stock === value}
                    onClick={() => onPick(stock)}
                    style={toneStyle(stock)}
                >
                    <i aria-hidden="true" />
                    {stock}
                </button>
            ))}
        </div>
    );
}

/** A row of choices, one pressed. */
export function Choice<T extends string | number>({
    label,
    value,
    options,
    onPick,
    disabled,
}: {
    label: string;
    value: T;
    options: ReadonlyArray<{ value: T; text: ReactNode; title?: string; off?: boolean }>;
    onPick: (value: T) => void;
    disabled?: boolean;
}) {
    return (
        <div className="gk-choice" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={option.value === value}
                    disabled={disabled || option.off}
                    title={option.title}
                    onClick={() => onPick(option.value)}
                >
                    {option.text}
                </button>
            ))}
        </div>
    );
}

/** A labelled control in a form: the label on the left, the control on the right. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="gk-field">
            <span className="gk-field__label">{label}</span>
            <div className="gk-field__control">{children}</div>
        </div>
    );
}
