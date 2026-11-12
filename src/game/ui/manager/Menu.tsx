'use client';

/**
 * A building's menu, the way a tower game has one: a small card beside the
 * building with a few big buttons. A button leads, one short step at a time
 * (whose account, which reason), to the action's last step: who really does
 * it, how long it takes, where it stands in solana-tsv, and one button that
 * sets it in motion. A refused action stays on that step with the system's
 * answer; one that goes through brings the card back to its first step. On
 * phones and short windows the card is a small bottom sheet.
 *
 * Keys: 1–9 pick the numbered choice, Enter does the last step's action,
 * Backspace goes back, Escape goes back or closes. A click on open ground
 * closes the card.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as THREE from 'three';

import { PLACES } from '../../content/places.ts';
import type { GameState, ManagerState } from '../../core/state.ts';
import {
    JURISDICTIONS,
    TIME_LOCK,
    actionDef,
    draftOf,
    type ActionArgs,
    type ActionId,
    type PolicyDraft,
} from '../../sim/actions.ts';
import { amount, money } from '../../sim/format.ts';
import { HOLD_LABEL, STOCKS, listed, priceOf, type HoldReason, type Person, type StockId } from '../../sim/park.ts';
import type { Availability, WalletId } from '../../sim/types.ts';
import type { PlaceId } from '../../world/world.ts';
import { useGame } from '../context.tsx';
import { Row } from '../Desk.tsx';
import { Tag } from '../Hud.tsx';
import { Icon } from '../icons.tsx';
import { controlOwnsKey } from '../keys.ts';
import { TradeForm } from './Composer.tsx';
import { RecordList } from './Goals.tsx';
import { Status, StockChip, StockTabs, isBusy, isOffered } from './kit.tsx';
import { useDock, usePickerOpen } from './picker.ts';
import { afterTag, argsKey, credentialLine, minutesText, possessive, stockState, standingNote, type Tone } from './words.ts';

const KIND = { actor: 'Actor', service: 'Service', contract: 'Contract', chain: 'Chain' } as const;

const COUNTRY: Record<string, string> = { US: 'United States', DE: 'Germany', GB: 'United Kingdom', JP: 'Japan' };

const KYC_AGES = [15, 30, 45, 60, 90];

/** The places whose menus show one stock at a time. */
const PER_POOL = new Set<PlaceId>(['issuer', 'gate', 'council', 'pool']);

/** Each action's button: a short name and an icon. */
const TILE: Record<ActionId, { short: string; icon: (size?: number) => ReactNode }> = {
    verify: { short: 'Verify', icon: Icon.shield },
    revoke: { short: 'Revoke', icon: Icon.cross },
    'holder-thaw': { short: 'Thaw with credential', icon: Icon.key },
    'issuer-thaw': { short: 'Thaw by hand', icon: Icon.unlock },
    'create-stock': { short: 'Create the stock', icon: Icon.plus },
    'thaw-vault': { short: 'Thaw the vault', icon: Icon.flame },
    recover: { short: 'Recover shares', icon: Icon.undo },
    'return-stock': { short: 'Return shares', icon: Icon.back },
    'create-pool': { short: 'Create the pool', icon: Icon.plus },
    'fund-pool': { short: 'Fund the pool', icon: Icon.coins },
    reconcile: { short: 'Reconcile', icon: Icon.scale },
    'set-policy': { short: 'Trade policy', icon: Icon.scroll },
    approve: { short: 'Broker approval', icon: Icon.user },
    'pause-swaps': { short: 'Pause swaps', icon: Icon.pause },
    'lift-pause': { short: 'Lift the pause', icon: Icon.play },
    hold: { short: 'Venue hold', icon: Icon.hand },
    'lift-hold': { short: 'Lift a hold', icon: Icon.unlock },
    'lift-flag': { short: 'Lift the flag', icon: Icon.flag },
    'restart-poster': { short: 'Restore the poster', icon: Icon.antenna },
    'sim-halt': { short: 'Halt or resume', icon: Icon.pause },
    'sim-resume': { short: 'Halt or resume', icon: Icon.play },
    'sim-poster-down': { short: 'Poster goes quiet', icon: Icon.mute },
    'sim-clock': { short: 'An hour passes', icon: Icon.clock },
    'sim-shortfall': { short: 'Recovery hits the vault', icon: Icon.target },
};

type PersonAction = 'verify' | 'revoke' | 'holder-thaw' | 'issuer-thaw' | 'recover' | 'approve';
type Term = 'jurisdictions' | 'age' | 'brokers';

/** Where the card is: its first step, or one step on the way to an action. */
type Step =
    | { kind: 'root' }
    /** Whose credential or account; for an approval, the owner who signs it. */
    | { kind: 'person'; action: PersonAction }
    | { kind: 'broker'; owner: WalletId }
    | { kind: 'reason' }
    | { kind: 'lift' }
    | { kind: 'market' }
    | { kind: 'policy' }
    | { kind: 'term'; term: Term }
    | { kind: 'signer' }
    | { kind: 'trade'; signer: WalletId }
    | { kind: 'confirm'; action: ActionId; args: ActionArgs }
    | { kind: 'details' };

interface TileSpec {
    key: string;
    icon: ReactNode;
    label: string;
    /** Under the label: the time it takes, or what it opens. */
    meta: string;
    availability?: Availability | 'mock';
    /** The line the card's foot shows while the button is pointed at. */
    detail: string;
    go: () => void;
}

interface TileGroup {
    /** Who the group's buttons belong to, and on what terms. */
    label?: { name: string; terms: ReactNode };
    tiles: TileSpec[];
}

interface ChoiceRow {
    key: string;
    title: ReactNode;
    sub?: ReactNode;
    status?: { tone: Tone; text: string };
    /** A toggle's state, for rows that switch something on and off. */
    on?: boolean;
    go: () => void;
}

/** One step as the card shows it. */
interface View {
    /** The step's question; the first step shows the building instead. */
    title?: ReactNode;
    body: ReactNode;
    /** What the number keys pick, in order. */
    keys: Array<() => void>;
    /** What Enter does. */
    enter?: () => void;
}

function people(m: ManagerState): Person[] {
    return Object.values(m.park.people);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function toggled<T>(list: readonly T[], item: T): T[] {
    return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

/** The time on a button: "20 min", "1 h", "at once". The last step says the rest (a time lock). */
function shortMinutes(minutes: number): string {
    if (minutes === 0) return 'at once';
    return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

// ----- The parts of a step -----

function Key({ n }: { n: number }) {
    return n <= 9 ? (
        <kbd className="gk-key" aria-hidden="true">
            {n}
        </kbd>
    ) : null;
}

/** The big buttons of a card's first step, in groups. */
function Tiles({
    groups,
    disabled,
    onPoint,
}: {
    groups: TileGroup[];
    disabled: boolean;
    onPoint: (detail: string | undefined) => void;
}) {
    let n = 0;
    return (
        <div className="gk-tilegroups">
            {groups.map((group, index) => (
                <div
                    key={index}
                    className="gk-tilegroup"
                    style={{ '--span': Math.min(group.tiles.length, 3) } as CSSProperties}
                >
                    {group.label && (
                        <div className="gk-tilegroup__label">
                            <b>{group.label.name}</b>
                            <span>{group.label.terms}</span>
                        </div>
                    )}
                    <div className="gk-tiles">
                        {group.tiles.map((tile) => {
                            n += 1;
                            return (
                                <button
                                    key={tile.key}
                                    type="button"
                                    className="gk-tile"
                                    disabled={disabled}
                                    data-tile={tile.key}
                                    onClick={tile.go}
                                    onPointerEnter={() => onPoint(tile.detail)}
                                    onPointerLeave={() => onPoint(undefined)}
                                    onFocus={() => onPoint(tile.detail)}
                                    onBlur={() => onPoint(undefined)}
                                >
                                    <Key n={n} />
                                    <i className="gk-tile__icon" aria-hidden="true">
                                        {tile.icon}
                                    </i>
                                    <span className="gk-tile__label">{tile.label}</span>
                                    <span className="gk-tile__meta">
                                        {tile.availability && (
                                            <i
                                                className="gk-tile__dot"
                                                data-tone={tile.availability}
                                                title={tile.availability}
                                            />
                                        )}
                                        {tile.meta}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** A short list to pick from: people, reasons, stocks. */
function Rows({ rows, disabled }: { rows: ChoiceRow[]; disabled: boolean }) {
    return (
        <ul className="gk-rows">
            {rows.map((row, index) => (
                <li key={row.key}>
                    <button
                        type="button"
                        className="gk-rowbtn"
                        disabled={disabled}
                        aria-pressed={row.on}
                        data-row={row.key}
                        onClick={row.go}
                    >
                        <Key n={index + 1} />
                        {row.on !== undefined && (
                            <i className="gk-rowbtn__box" aria-hidden="true">
                                {row.on && Icon.check(13)}
                            </i>
                        )}
                        <span className="gk-rowbtn__who">
                            <b>{row.title}</b>
                            {row.sub && <span>{row.sub}</span>}
                        </span>
                        {row.status && <Status tone={row.status.tone}>{row.status.text}</Status>}
                        {row.on === undefined && (
                            <i className="gk-rowbtn__go" aria-hidden="true">
                                {Icon.arrow(14)}
                            </i>
                        )}
                    </button>
                </li>
            ))}
        </ul>
    );
}

// ----- What each building shows -----

interface Root {
    stats: Array<{ tone: Tone; text: string; title?: string }>;
    groups: TileGroup[];
    /** Said when the building has nothing to set in motion here. */
    empty?: string;
}

function accountTone(account: Person['holdings'][StockId]['account']): Tone {
    return account === 'thawed' ? 'good' : account === 'frozen' ? 'ice' : 'idle';
}

/** The building's details: its state in full, and what it is in the real system. */
function Details({ state, m, place, stock }: { state: GameState; m: ManagerState; place: PlaceId; stock: StockId }) {
    const info = PLACES[place];
    const park = m.park;
    const f = park.features;
    const listing = park.listings[stock];
    const name = (id: WalletId): string => park.people[id].name;
    let facts: ReactNode = null;
    switch (place) {
        case 'bureau':
            facts = (
                <div className="gk-facts">
                    {people(m).map((person) => {
                        const line = credentialLine(person, park.now);
                        return (
                            <Row key={person.id} label={person.name}>
                                <Status tone={line.tone}>{line.text}</Status>
                            </Row>
                        );
                    })}
                </div>
            );
            break;
        case 'issuer': {
            if (!listing) break;
            const pool = listing.pool;
            const short = pool.vaultTsa < pool.tsa - 1e-9;
            facts = (
                <>
                    <div className="gk-facts">
                        <Row label="Stock">
                            {listing.created ? 'created' : 'not created yet'}
                            <i>opens at {money(STOCKS[stock].opening)} USDC</i>
                        </Row>
                        <Row label="Pool vault">
                            {pool.status === 'none'
                                ? 'no pool yet'
                                : pool.vaultThawed
                                  ? 'thawed'
                                  : 'frozen: only the issuer can thaw it'}
                        </Row>
                        {f.reserves && pool.status === 'open' && (
                            <Row label="Vault" ring={short}>
                                {amount(pool.vaultTsa, 1)} {stock}
                                <i>books say {amount(pool.tsa, 1)}</i>
                            </Row>
                        )}
                    </div>
                    <h5 className="gk-pop__sub">Every wallet&apos;s {stock} account</h5>
                    <div className="gk-facts">
                        {people(m).map((person) => {
                            const holding = person.holdings[stock];
                            return (
                                <Row key={person.id} label={person.name}>
                                    <Status tone={accountTone(holding.account)}>
                                        {holding.account === 'none' ? 'no account' : holding.account}
                                    </Status>
                                    <i>
                                        {amount(holding.shares)} {stock}
                                        {holding.lp > 0 && ` · ${amount(holding.lp)} LP`}
                                    </i>
                                </Row>
                            );
                        })}
                    </div>
                </>
            );
            break;
        }
        case 'pool': {
            if (!listing) break;
            const pool = listing.pool;
            const short = pool.vaultTsa < pool.tsa - 1e-9;
            facts = (
                <div className="gk-facts">
                    <Row label="Status">
                        {pool.status === 'none'
                            ? listing.created
                                ? 'not created yet'
                                : `not created: ${stock} does not exist yet`
                            : pool.status === 'created'
                              ? 'created, waiting for its funds'
                              : 'open'}
                    </Row>
                    {pool.status === 'open' && (
                        <>
                            <Row label="Reserves">
                                {amount(pool.tsa, 1)} {stock} <i>{amount(pool.usdc, 0)} USDC</i>
                            </Row>
                            <Row label="Price">
                                1 {stock} = {money(priceOf(park, stock))} USDC
                            </Row>
                            <Row label="LP supply">{amount(pool.lpSupply)}</Row>
                        </>
                    )}
                    {pool.status !== 'none' && (
                        <Row label="Stock vault" ring={f.reserves && short}>
                            {pool.vaultThawed ? 'thawed' : 'frozen'} · {amount(pool.vaultTsa, 1)} {stock}
                            <i>books {amount(pool.tsa, 1)}</i>
                        </Row>
                    )}
                    {f.reserves && (
                        <Row label="Flag">
                            {pool.flagged ? 'flagged: refused until operations lifts it' : 'not flagged'}
                        </Row>
                    )}
                    {f.metering && (
                        <Row label="Day budget">
                            {amount(listing.budget.usedShares, 2)} used <i>of {listing.budget.dailyShares} shares</i>
                        </Row>
                    )}
                    {f.halts && (
                        <Row label="Venue holds">
                            {listing.holds.length > 0 ? listing.holds.map((hold) => HOLD_LABEL[hold]).join(', ') : 'none'}
                        </Row>
                    )}
                    {f.governance && <Row label="Swaps">{listing.swapsPaused ? 'paused by emergency' : 'open'}</Row>}
                    <Row label="Policy">{listing.policy ? `version ${listing.policy.version}` : 'none yet'}</Row>
                </div>
            );
            break;
        }
        case 'gate': {
            const policy = listing?.policy;
            facts = (
                <>
                    {policy ? (
                        <div className="gk-facts">
                            <Row label="Policy">version {policy.version}</Row>
                            <Row label="Credential">
                                {policy.credential} <i>schema {policy.schemaVersion}</i>
                            </Row>
                            <Row label="Jurisdictions">
                                {policy.jurisdictions.map((code) => `${code} · ${COUNTRY[code] ?? code}`).join(', ')}
                            </Row>
                            <Row label="KYC age">under {policy.maxKycAgeDays} days</Row>
                            <Row label="Brokers">
                                {policy.delegates.length > 0
                                    ? policy.delegates.map(name).join(', ')
                                    : 'none: owners sign for themselves'}
                            </Row>
                        </div>
                    ) : (
                        <p className="gk-mempty">
                            {listing && listing.pool.status !== 'none'
                                ? `The ${stock} pool has no trade policy yet: nobody can trade in it.`
                                : `There is no ${stock} pool yet: a policy belongs to a pool.`}
                        </p>
                    )}
                    <h5 className="gk-pop__sub">Owner approvals · each owner signs their own</h5>
                    <div className="gk-facts">
                        {people(m).map((person) => (
                            <Row key={person.id} label={person.name}>
                                {person.approves ? `approves ${name(person.approves)}` : 'no broker'}
                            </Row>
                        ))}
                    </div>
                </>
            );
            break;
        }
        case 'council': {
            if (!listing) break;
            const market = listing.market;
            facts = (
                <>
                    <div className="gk-facts">
                        {f.governance && <Row label="Swaps">{listing.swapsPaused ? 'paused by emergency' : 'open'}</Row>}
                        {f.halts && (
                            <>
                                <Row label="Venue holds">
                                    {listing.holds.length > 0
                                        ? listing.holds.map((hold) => HOLD_LABEL[hold]).join(', ')
                                        : 'none'}
                                </Row>
                                <Row label="Exchange">
                                    {market.status === 'halted' ? `HALTED · ${market.haltCode ?? 'trading pause'}` : 'TRADING'}
                                    <i>record says {market.record}</i>
                                </Row>
                            </>
                        )}
                        {f.reserves && (
                            <Row label="Flag" ring={listing.pool.flagged}>
                                {listing.pool.flagged ? 'flagged: out of balance' : 'not flagged'}
                            </Row>
                        )}
                        {!f.governance && !f.halts && !f.reserves && (
                            <Row label="Rules">the council&apos;s rules are not part of this scenario</Row>
                        )}
                    </div>
                    <p className="gk-mnote gk-mnote--box">
                        {Icon.info(15)}
                        <span>
                            Live today: one admin key can switch a pool&apos;s swap, deposit and withdraw bits (pool
                            error 6000), withdrawals included. The role multisigs are planned; thresholds and time locks
                            here are demo values.
                        </span>
                    </p>
                </>
            );
            break;
        }
        case 'haltBoard':
            facts = (
                <>
                    {!f.halts && (
                        <p className="gk-mnote gk-mnote--box">
                            {Icon.info(15)}
                            <span>
                                Halts and fresh evidence are in review (pull request #101) and not part of this scenario:
                                the pools here do not read the board.
                            </span>
                        </p>
                    )}
                    <div className="gk-facts">
                        <Row label="Poster" ring={f.halts && !park.poster}>
                            {park.poster ? 'running: every record follows the exchange' : 'silent: no fresh evidence reaches the chain'}
                        </Row>
                    </div>
                    <table className="gk-records">
                        <thead>
                            <tr>
                                <th scope="col">Stock</th>
                                <th scope="col">Exchange</th>
                                <th scope="col">On chain</th>
                                <th scope="col">Evidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {listed(park).map((id) => {
                                const row = park.listings[id];
                                if (!row) return null;
                                const market = row.market;
                                const halted = market.record === 'halted' || row.holds.length > 0;
                                return (
                                    <tr key={id}>
                                        <th scope="row">
                                            <StockChip stock={id} />
                                        </th>
                                        <td data-tone={market.status === 'halted' ? 'bad' : 'good'}>
                                            {market.status === 'halted'
                                                ? `HALTED${market.haltCode ? ` · ${market.haltCode}` : ''}`
                                                : 'TRADING'}
                                        </td>
                                        <td data-tone={halted ? 'bad' : 'good'}>
                                            {row.holds.length > 0
                                                ? `HOLD · ${row.holds.map((hold) => HOLD_LABEL[hold].toLowerCase()).join(', ')}`
                                                : market.record === 'halted'
                                                  ? 'HALTED'
                                                  : 'trading'}
                                        </td>
                                        <td data-tone={market.evidenceFresh ? 'good' : 'bad'}>
                                            {market.evidenceFresh ? 'fresh' : 'stale'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            );
            break;
        case 'exchange':
            facts = (
                <>
                    <table className="gk-records">
                        <thead>
                            <tr>
                                <th scope="col">Stock</th>
                                <th scope="col">Market</th>
                                <th scope="col">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {listed(park).map((id) => {
                                const market = park.listings[id]?.market;
                                if (!market) return null;
                                return (
                                    <tr key={id}>
                                        <th scope="row">
                                            <StockChip stock={id} />
                                        </th>
                                        <td data-tone={market.status === 'halted' ? 'bad' : 'good'}>
                                            {market.status === 'halted'
                                                ? `HALTED · ${market.haltCode === 'SEC' ? 'SEC suspension' : (market.haltCode ?? 'trading pause')}`
                                                : 'TRADING'}
                                        </td>
                                        <td className="gk-mono">{money(market.price)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="gk-mnote">The primary market is simulated: no real market data.</p>
                </>
            );
            break;
        case 'archive':
        case 'indexer':
            facts = <RecordList state={state} />;
            break;
        case 'chain':
            facts = (
                <div className="gk-facts">
                    <Row label="Slot">
                        <span className="gk-mono">{String(state.slot).padStart(4, '0')}</span>
                        <i>slowed down: real slots take about 0.4 s</i>
                    </Row>
                </div>
            );
            break;
        default:
            break;
    }
    return (
        <div className="gk-details">
            {facts}
            <div className="gk-real">
                <h5 className="gk-pop__sub">In the real system</h5>
                <div className="gk-place__standing">
                    <Tag availability={info.availability} />
                    <span>{afterTag(info.availability, info.standing)}</span>
                </div>
                <p>{info.real}</p>
                <ul>
                    {info.does.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// ----- Where the card stands -----

/** The part of the stage the card may use: right of the objectives, below the top bar. */
function measureBounds(width: number, height: number): { left: number; top: number; right: number; bottom: number } {
    const root = document.querySelector('.gk-root')?.getBoundingClientRect();
    const ox = root?.left ?? 0;
    const oy = root?.top ?? 0;
    let left = 12;
    for (const element of document.querySelectorAll<HTMLElement>('[data-frame="left"]')) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0) left = Math.max(left, rect.right - ox + 12);
    }
    const bar = document.querySelector('.gk-top')?.getBoundingClientRect();
    const top = bar && bar.height > 0 ? bar.bottom - oy + 10 : 12;
    return { left, top, right: width - 12, bottom: height - 12 };
}

/** How far the card stands from its building's edge on screen. */
const GAP = 16;

/**
 * What the card's foot shows while a button is pointed at: the detail's whole sentences that fit its three
 * lines (about 150 characters), at least the first. The last step shows the detail in full.
 */
function lead(text: string, budget = 150): string {
    const sentences = text.match(/[^.]*\.(\s|$)|[^.]+$/g) ?? [text];
    let out = '';
    for (const sentence of sentences) {
        if (out && (out + sentence).trim().length > budget) break;
        out += sentence;
    }
    return out.trim();
}

// ----- The menu -----

export function BuildingMenu({ state, m, sheet }: { state: GameState; m: ManagerState; sheet: boolean }) {
    const game = useGame();
    const picker = usePickerOpen();
    const dock = useDock() && sheet;
    const menu = m.menu;
    const place: PlaceId = menu?.place ?? 'gate';
    const stock: StockId = place === 'pool' ? (menu?.stock ?? 'TSA') : m.stock;
    const listing = m.park.listings[stock];
    const policy = listing?.policy;

    const [stack, setStack] = useState<Step[]>([{ kind: 'root' }]);
    const [lastKey, setLastKey] = useState<string>();
    const [pointed, setPointed] = useState<string>();
    const [done, setDone] = useState<string>();
    const [draft, setDraft] = useState<PolicyDraft>(() => draftOf(policy));
    const step = stack[stack.length - 1] ?? { kind: 'root' };

    const outer = useRef<HTMLDivElement>(null);
    const card = useRef<HTMLElement>(null);
    const mark = useRef<HTMLDivElement>(null);

    const push = (next: Step): void => {
        setStack((current) => [...current, next]);
        setDone(undefined);
        setPointed(undefined);
    };
    const back = (): void => {
        setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
        setPointed(undefined);
    };

    // Another stock is another set of accounts, pools and policies: the card starts over. A trade being
    // composed at the gate keeps its steps: the gate's stock tabs pick the trade's pool.
    useEffect(() => {
        setStack((current) =>
            place === 'gate' && current.some((entry) => entry.kind === 'signer' || entry.kind === 'trade')
                ? current
                : [{ kind: 'root' }],
        );
    }, [place, stock]);
    // A new policy version (or another stock's) is a new starting point for the draft.
    const version = policy?.version ?? 0;
    useEffect(() => {
        setDraft(draftOf(listing?.policy));
    }, [stock, version]);
    // "Show me" opens the card on the action it is about to play; "Compose a trade" on a new trade.
    const focus = menu?.focus;
    useEffect(() => {
        if (!focus) return;
        if ('trade' in focus) {
            setStack([{ kind: 'root' }, { kind: 'signer' }]);
            return;
        }
        if (focus.action === 'set-policy' && focus.args.policy) setDraft(focus.args.policy);
        setStack([{ kind: 'root' }, { kind: 'confirm', action: focus.action, args: focus.args }]);
    }, [focus]);
    // An action that went through brings the card back to its first step, with what it did. A card opened
    // while another building's action was already playing ('before') is left as it is.
    const wasActing = useRef<boolean | 'before'>(m.acting ? 'before' : false);
    useEffect(() => {
        if (m.acting) {
            if (wasActing.current !== 'before') wasActing.current = true;
            return;
        }
        const was = wasActing.current;
        wasActing.current = false;
        if (was !== true) return;
        const last = [...m.log].reverse().find((entry) => entry.tone === 'action');
        setStack([{ kind: 'root' }]);
        setDone(last?.text);
    }, [m.acting, m.log]);
    useEffect(() => {
        if (!done) return undefined;
        const timer = window.setTimeout(() => setDone(undefined), 9000);
        return () => window.clearTimeout(timer);
    }, [done]);

    // The card takes the focus when it opens, so the keyboard lands in it; it gives the focus back to
    // whatever had it (a name tag, a button) when it closes.
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        card.current?.focus({ preventScroll: true });
        return () => {
            if (before && before.isConnected && before !== document.body) before.focus({ preventScroll: true });
        };
    }, []);
    // A step's buttons replace the last one's: the focus stays in the card.
    useEffect(() => {
        const element = card.current;
        if (element && !element.contains(document.activeElement)) element.focus({ preventScroll: true });
    }, [stack]);

    // The tag of the open building gives way to its card.
    const tagId = place === 'pool' ? (stock === 'TSA' ? 'pool' : `pool:${stock}`) : place;
    useEffect(() => {
        game.overlay.selectTag(tagId);
        return () => game.overlay.selectTag(undefined);
    }, [game, tagId]);

    // Beside its building, every frame, after the camera moves: right of the building's extent on screen
    // when it fits, else left of it, else over it. It stays inside the town left between the panels; when
    // the building is off that part of the screen (panned away), the card has no notch and no marker.
    useEffect(() => {
        if (sheet) return undefined;
        const target = place === 'pool' ? game.world.pools[stock] : game.world.places[place];
        const anchor = target?.anchors.label;
        // Places stand still: their box is measured once, and its eight corners projected every frame.
        const box = target ? new THREE.Box3().setFromObject(target.hitbox) : undefined;
        const corners =
            box && !box.isEmpty()
                ? [0, 1, 2, 3, 4, 5, 6, 7].map(
                      (i) =>
                          new THREE.Vector3(
                              i & 1 ? box.max.x : box.min.x,
                              i & 2 ? box.max.y : box.min.y,
                              i & 4 ? box.max.z : box.min.z,
                          ),
                  )
                : [];
        let size = { w: card.current?.offsetWidth ?? 300, h: card.current?.offsetHeight ?? 240 };
        const observer = new ResizeObserver(() => {
            if (card.current) size = { w: card.current.offsetWidth, h: card.current.offsetHeight };
        });
        if (card.current) observer.observe(card.current);
        let stage = game.stage.size();
        let bounds = measureBounds(stage.width, stage.height);
        let frames = 0;
        const stop = game.stage.follow(
            () => anchor,
            (point) => {
                const element = outer.current;
                if (!element) return;
                if (!point) {
                    element.style.visibility = 'hidden';
                    if (mark.current) mark.current.style.visibility = 'hidden';
                    return;
                }
                element.style.visibility = '';
                frames += 1;
                if (frames % 30 === 0) {
                    stage = game.stage.size();
                    bounds = measureBounds(stage.width, stage.height);
                }
                let minX = point.x;
                let maxX = point.x;
                let minY = point.y;
                let maxY = point.y;
                for (const corner of corners) {
                    const p = game.stage.project(corner);
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                }
                const middle = (minY + maxY) / 2;
                const { w, h } = size;
                let side: 'right' | 'left' | 'over' = 'right';
                let x = maxX + GAP;
                if (x + w > bounds.right) {
                    if (minX - GAP - w >= bounds.left) {
                        x = minX - GAP - w;
                        side = 'left';
                    } else {
                        x = point.x - w / 2;
                        side = 'over';
                    }
                }
                const kept = clamp(x, bounds.left, Math.max(bounds.left, bounds.right - w));
                const inside =
                    point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
                if (kept !== x || !inside) side = 'over';
                const y = clamp(middle - Math.min(h * 0.3, 80), bounds.top, Math.max(bounds.top, bounds.bottom - h));
                element.style.transform = `translate3d(${kept.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
                element.dataset.side = side;
                element.style.setProperty('--tip', `${clamp(middle - y, 22, h - 22).toFixed(1)}px`);
                if (mark.current) {
                    mark.current.style.visibility = inside ? '' : 'hidden';
                    mark.current.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
                }
            },
        );
        return () => {
            stop();
            observer.disconnect();
        };
    }, [game, sheet, place, stock]);

    const busy = isBusy(state);
    const watched = m.watched === true;
    const run = (action: ActionId, args: ActionArgs): void => {
        setLastKey(argsKey(action, args));
        game.manager.act(action, args);
    };
    const confirm = (action: ActionId, args: ActionArgs): void => push({ kind: 'confirm', action, args });
    const name = (id: WalletId): string => m.park.people[id].name;
    const f = m.park.features;

    // ----- The first step: the building's state and its buttons -----

    const tile = (action: ActionId, args: ActionArgs, go?: () => void): TileSpec => {
        const def = actionDef(action);
        return {
            key: action,
            icon: TILE[action].icon(22),
            label: TILE[action].short,
            meta: shortMinutes(def.minutes),
            availability: def.availability,
            detail: lead(def.detail),
            go: go ?? (() => confirm(action, args)),
        };
    };
    const details: TileSpec = {
        key: 'details',
        icon: Icon.info(22),
        label: place === 'archive' || place === 'indexer' ? 'The record' : 'Details',
        meta: 'look',
        detail: 'Everything this place holds right now, and what it is in the real system.',
        go: () => push({ kind: 'details' }),
    };
    const tradeTile: TileSpec = {
        key: 'trade',
        icon: Icon.send(22),
        label: 'Send a trade',
        meta: 'test it',
        detail: `Anyone, any trade, through the gate to the ${stock} pool: the pool's own checks decide it.`,
        go: () => push({ kind: 'signer' }),
    };

    const rootOf = (): Root => {
        const pool = listing?.pool;
        switch (place) {
            case 'bureau': {
                const everyone = people(m);
                const valid = everyone.filter((person) => credentialLine(person, m.park.now).tone === 'good').length;
                return {
                    stats: [{ tone: valid === everyone.length ? 'good' : 'warn', text: `${valid} of ${everyone.length} hold a valid credential` }],
                    groups: [
                        {
                            tiles: [
                                tile('verify', {}, () => push({ kind: 'person', action: 'verify' })),
                                tile('revoke', {}, () => push({ kind: 'person', action: 'revoke' })),
                                details,
                            ],
                        },
                    ],
                };
            }
            case 'issuer': {
                if (!listing || !pool) return { stats: [], groups: [{ tiles: [details] }] };
                const short = pool.vaultTsa < pool.tsa - 1e-9;
                const stats: Root['stats'] = [
                    { tone: listing.created ? 'good' : 'idle', text: listing.created ? `${stock} created` : `${stock} not created` },
                ];
                if (pool.status !== 'none')
                    stats.push({ tone: pool.vaultThawed ? 'good' : 'ice', text: pool.vaultThawed ? 'vault thawed' : 'vault frozen' });
                if (f.reserves && pool.status === 'open' && short)
                    stats.push({ tone: 'bad', text: `vault short ${amount(pool.tsa - pool.vaultTsa, 1)}` });
                const tiles: TileSpec[] = [];
                if (!listing.created) tiles.push(tile('create-stock', { stock }));
                if (pool.status !== 'none' && !pool.vaultThawed) tiles.push(tile('thaw-vault', { stock }));
                tiles.push(tile('holder-thaw', {}, () => push({ kind: 'person', action: 'holder-thaw' })));
                tiles.push(tile('issuer-thaw', {}, () => push({ kind: 'person', action: 'issuer-thaw' })));
                if (isOffered(m, 'recover')) tiles.push(tile('recover', {}, () => push({ kind: 'person', action: 'recover' })));
                if (isOffered(m, 'return-stock')) tiles.push(tile('return-stock', { stock }));
                if (isOffered(m, 'sim-shortfall') && pool.status === 'open') tiles.push(tile('sim-shortfall', { stock }));
                tiles.push(details);
                return { stats, groups: [{ tiles }] };
            }
            case 'pool': {
                if (!listing || !pool) return { stats: [], groups: [{ tiles: [details] }] };
                const now = stockState(m.park, stock);
                const stats: Root['stats'] = [
                    { tone: now.tone, text: pool.status === 'open' && now.tone === 'good' ? `1 ${stock} = ${now.text}` : now.text, title: now.title },
                ];
                if (pool.status !== 'none' && !pool.vaultThawed) stats.push({ tone: 'ice', text: 'vault frozen' });
                if (!listing.policy && pool.status !== 'none') stats.push({ tone: 'warn', text: 'no policy' });
                if (f.metering && pool.status === 'open')
                    stats.push({
                        tone: listing.budget.usedShares >= listing.budget.dailyShares - 1e-9 ? 'bad' : 'idle',
                        text: `budget ${amount(listing.budget.usedShares, 1)}/${listing.budget.dailyShares}`,
                    });
                const tiles: TileSpec[] = [];
                if (pool.status === 'none') tiles.push(tile('create-pool', { stock }));
                if (pool.status !== 'open') tiles.push(tile('fund-pool', { stock }));
                if (isOffered(m, 'reconcile')) tiles.push(tile('reconcile', { stock }));
                tiles.push(tradeTile, details);
                return { stats, groups: [{ tiles }] };
            }
            case 'gate': {
                const stats: Root['stats'] = policy
                    ? [
                          { tone: 'good', text: `policy v${policy.version}` },
                          { tone: 'idle', text: policy.jurisdictions.join(' + ') },
                          { tone: 'idle', text: `KYC < ${policy.maxKycAgeDays} d` },
                          {
                              tone: 'idle',
                              text: policy.delegates.length > 0 ? `brokers: ${policy.delegates.map(name).join(', ')}` : 'no brokers',
                          },
                      ]
                    : [{ tone: 'warn', text: `no ${stock} policy` }];
                return {
                    stats,
                    groups: [
                        {
                            tiles: [
                                tile('set-policy', { stock }, () => push({ kind: 'policy' })),
                                tile('approve', {}, () => push({ kind: 'person', action: 'approve' })),
                                tradeTile,
                                details,
                            ],
                        },
                    ],
                };
            }
            case 'council': {
                if (!listing || !pool) return { stats: [], groups: [{ tiles: [details] }] };
                const stats: Root['stats'] = [];
                if (f.governance) stats.push({ tone: listing.swapsPaused ? 'bad' : 'good', text: listing.swapsPaused ? 'swaps paused' : 'swaps open' });
                if (f.halts)
                    stats.push({
                        tone: listing.holds.length > 0 ? 'bad' : 'good',
                        text: listing.holds.length > 0 ? `hold: ${listing.holds.map((hold) => HOLD_LABEL[hold].toLowerCase()).join(', ')}` : 'no holds',
                    });
                if (f.reserves) stats.push({ tone: pool.flagged ? 'bad' : 'good', text: pool.flagged ? 'flagged' : 'not flagged' });
                const emergency: TileSpec[] = [];
                if (isOffered(m, 'pause-swaps')) emergency.push(tile('pause-swaps', { stock }));
                if (isOffered(m, 'hold')) emergency.push(tile('hold', { stock }, () => push({ kind: 'reason' })));
                const operations: TileSpec[] = [];
                if (isOffered(m, 'lift-pause')) operations.push(tile('lift-pause', { stock }));
                if (isOffered(m, 'lift-hold'))
                    operations.push(
                        tile('lift-hold', { stock }, () => {
                            if (listing.holds.length > 1) push({ kind: 'lift' });
                            else confirm('lift-hold', listing.holds[0] ? { stock, hold: listing.holds[0] } : { stock });
                        }),
                    );
                if (isOffered(m, 'lift-flag')) operations.push(tile('lift-flag', { stock }));
                const groups: TileGroup[] = [];
                if (emergency.length > 0)
                    groups.push({ label: { name: 'Emergency', terms: '2 of 3 · at once' }, tiles: emergency });
                if (operations.length > 0)
                    groups.push({
                        label: { name: 'Operations', terms: `2 of 3 · ${TIME_LOCK} min lock` },
                        tiles: operations,
                    });
                groups.push({ tiles: [details] });
                return {
                    stats,
                    groups,
                    empty:
                        emergency.length + operations.length === 0
                            ? 'Nothing for the council here: the role multisigs, venue holds and honest reserves are not part of this scenario.'
                            : undefined,
                };
            }
            case 'haltBoard': {
                const stale = listed(m.park).filter((id) => !m.park.listings[id]?.market.evidenceFresh).length;
                const stats: Root['stats'] = [
                    { tone: m.park.poster ? 'good' : 'bad', text: m.park.poster ? 'poster running' : 'poster silent' },
                    { tone: stale > 0 ? 'bad' : 'good', text: stale > 0 ? `evidence stale · ${stale}` : 'evidence fresh' },
                ];
                const tiles: TileSpec[] = [];
                if (isOffered(m, 'restart-poster')) tiles.push(tile('restart-poster', {}));
                tiles.push(details);
                return {
                    stats,
                    groups: [{ tiles }],
                    empty: f.halts ? undefined : 'Halts are in review (pull request #101) and not part of this scenario: the pools here do not read the board.',
                };
            }
            case 'exchange': {
                const stats: Root['stats'] = listed(m.park).map((id) => {
                    const market = m.park.listings[id]?.market;
                    const halted = market?.status === 'halted';
                    return { tone: halted ? 'bad' : 'good', text: `${id} ${halted ? 'halted' : 'trading'}` };
                });
                const sandbox = m.scenario.sandbox === true;
                const events: TileSpec[] = [];
                if (sandbox && isOffered(m, 'sim-halt')) events.push(tile('sim-halt', {}, () => push({ kind: 'market' })));
                if (sandbox && isOffered(m, 'sim-poster-down')) events.push(tile('sim-poster-down', {}));
                if (sandbox && isOffered(m, 'sim-clock')) events.push(tile('sim-clock', {}));
                const groups: TileGroup[] = [];
                if (events.length > 0)
                    groups.push({ label: { name: 'Simulated events', terms: <Tag availability="mock" /> }, tiles: events });
                groups.push({ tiles: [details] });
                return {
                    stats,
                    groups,
                    empty: events.length === 0 ? 'In a scenario the exchange follows the story. Free play lets you halt and resume it.' : undefined,
                };
            }
            case 'archive':
            case 'indexer':
                return { stats: [{ tone: 'idle', text: `${state.ledger.length} decisions recorded` }], groups: [{ tiles: [details] }] };
            default:
                return { stats: [{ tone: 'idle', text: `slot ${String(state.slot).padStart(4, '0')}` }], groups: [{ tiles: [details] }] };
        }
    };

    // ----- Each step -----

    const personRow = (person: Person, action: PersonAction | 'signer' | 'broker'): Omit<ChoiceRow, 'go'> => {
        let status: ChoiceRow['status'];
        if (action === 'holder-thaw' || action === 'issuer-thaw' || action === 'recover') {
            const holding = person.holdings[stock];
            status = {
                tone: accountTone(holding.account),
                text: `${holding.account === 'none' ? 'no account' : holding.account} · ${amount(holding.shares)} ${stock}`,
            };
        } else if (action === 'approve') {
            status = person.approves
                ? { tone: 'good', text: `approves ${name(person.approves)}` }
                : { tone: 'idle', text: 'no broker' };
        } else {
            status = credentialLine(person, m.park.now);
        }
        return { key: person.id, title: person.name, sub: person.role, status };
    };

    const viewOf = (): View => {
        switch (step.kind) {
            case 'root': {
                const root = rootOf();
                const keys = root.groups.flatMap((group) => group.tiles.map((spec) => spec.go));
                return {
                    body: (
                        <>
                            {done && (
                                <p className="gk-pop__done" role="status">
                                    {Icon.check(14)}
                                    <span>{done}</span>
                                </p>
                            )}
                            {root.stats.length > 0 && (
                                <div className="gk-pop__stats">
                                    {root.stats.map((stat) => (
                                        <span key={stat.text} title={stat.title}>
                                            <Status tone={stat.tone}>{stat.text}</Status>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {root.empty && <p className="gk-mnote">{root.empty}</p>}
                            <Tiles groups={root.groups} disabled={watched} onPoint={setPointed} />
                        </>
                    ),
                    keys,
                };
            }
            case 'person': {
                const action = step.action;
                const rows = people(m).map((person) => ({
                    ...personRow(person, action),
                    go: () => {
                        if (action === 'approve') push({ kind: 'broker', owner: person.id });
                        else if (action === 'verify' || action === 'revoke') confirm(action, { who: person.id });
                        else confirm(action, { who: person.id, stock });
                    },
                }));
                const title =
                    action === 'approve'
                        ? 'Which owner approves a broker?'
                        : action === 'verify' || action === 'revoke'
                          ? 'Whose credential?'
                          : `Whose ${stock} account?`;
                return {
                    title,
                    body: <Rows rows={rows} disabled={watched} />,
                    keys: rows.map((row) => row.go),
                };
            }
            case 'broker': {
                const owner = step.owner;
                const rows = people(m)
                    .filter((person) => person.id !== owner)
                    .map((person) => ({
                        ...personRow(person, 'broker'),
                        sub: person.role === 'Broker' ? 'Broker' : person.role,
                        go: () => confirm('approve', { who: owner, broker: person.id }),
                    }));
                return {
                    title: `${name(owner)} approves…`,
                    body: <Rows rows={rows} disabled={watched} />,
                    keys: rows.map((row) => row.go),
                };
            }
            case 'reason': {
                const rows = (Object.keys(HOLD_LABEL) as HoldReason[]).map((hold) => ({
                    key: hold,
                    title: HOLD_LABEL[hold],
                    go: () => confirm('hold', { stock, hold }),
                }));
                return {
                    title: `Why hold ${stock}?`,
                    body: (
                        <>
                            <Rows rows={rows} disabled={watched} />
                            <p className="gk-pop__note">The reason goes on record with the hold.</p>
                        </>
                    ),
                    keys: rows.map((row) => row.go),
                };
            }
            case 'lift': {
                const rows = (listing?.holds ?? []).map((hold) => ({
                    key: hold,
                    title: `${HOLD_LABEL[hold]} hold`,
                    go: () => confirm('lift-hold', { stock, hold }),
                }));
                return { title: `Which hold on ${stock}?`, body: <Rows rows={rows} disabled={watched} />, keys: rows.map((row) => row.go) };
            }
            case 'market': {
                const rows = listed(m.park).map((id) => {
                    const halted = m.park.listings[id]?.market.status === 'halted';
                    return {
                        key: id,
                        title: <StockChip stock={id} />,
                        sub: halted ? 'resume it' : 'halt it',
                        status: { tone: (halted ? 'bad' : 'good') as Tone, text: halted ? 'HALTED' : 'TRADING' },
                        go: () => confirm(halted ? 'sim-resume' : 'sim-halt', { stock: id }),
                    };
                });
                return { title: 'Which stock?', body: <Rows rows={rows} disabled={watched} />, keys: rows.map((row) => row.go) };
            }
            case 'policy': {
                const base = draftOf(policy);
                const changed = {
                    jurisdictions: !sameList(base.jurisdictions, draft.jurisdictions),
                    age: base.maxKycAgeDays !== draft.maxKycAgeDays,
                    brokers: !sameList(base.delegates, draft.delegates),
                };
                const changes = Object.values(changed).filter(Boolean).length;
                const rows: ChoiceRow[] = [
                    {
                        key: 'jurisdictions',
                        title: 'Jurisdictions',
                        sub: draft.jurisdictions.length > 0 ? draft.jurisdictions.join(' + ') : 'none',
                        status: changed.jurisdictions ? { tone: 'warn', text: 'changed' } : undefined,
                        go: () => push({ kind: 'term', term: 'jurisdictions' }),
                    },
                    {
                        key: 'age',
                        title: 'KYC under',
                        sub: `${draft.maxKycAgeDays} days`,
                        status: changed.age ? { tone: 'warn', text: 'changed' } : undefined,
                        go: () => push({ kind: 'term', term: 'age' }),
                    },
                    {
                        key: 'brokers',
                        title: 'Brokers',
                        sub: draft.delegates.length > 0 ? draft.delegates.map(name).join(', ') : 'none: owners sign for themselves',
                        status: changed.brokers ? { tone: 'warn', text: 'changed' } : undefined,
                        go: () => push({ kind: 'term', term: 'brokers' }),
                    },
                ];
                const ready = changes > 0 || !policy;
                const review = (): void => confirm('set-policy', { stock, policy: draft });
                return {
                    title: `${stock} policy · draft v${(policy?.version ?? 0) + 1}`,
                    body: (
                        <>
                            <Rows rows={rows} disabled={watched} />
                            <p className="gk-pop__note">
                                {changes === 0
                                    ? policy
                                        ? `Same as version ${policy.version}: change a term first.`
                                        : 'The first policy: the one credential, US only, KYC under 30 days, no brokers.'
                                    : `${changes} change${changes > 1 ? 's' : ''} from version ${policy?.version ?? 0}. Every change is a new version; old ones never come back.`}
                            </p>
                            <div className="gk-pop__actions">
                                {changes > 0 && (
                                    <button type="button" className="gk-linkbtn" onClick={() => setDraft(base)}>
                                        Start over
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="gk-btn gk-btn--primary gk-go"
                                    disabled={!ready || watched}
                                    onClick={review}
                                >
                                    Next {Icon.arrow(15)}
                                </button>
                            </div>
                        </>
                    ),
                    keys: rows.map((row) => row.go),
                    enter: ready ? review : undefined,
                };
            }
            case 'term': {
                const term = step.term;
                let rows: ChoiceRow[];
                let title: string;
                if (term === 'jurisdictions') {
                    title = 'Accepted jurisdictions';
                    rows = JURISDICTIONS.map((code) => ({
                        key: code,
                        title: code,
                        sub: COUNTRY[code],
                        on: draft.jurisdictions.includes(code),
                        go: () => setDraft((current) => ({ ...current, jurisdictions: toggled(current.jurisdictions, code) })),
                    }));
                } else if (term === 'brokers') {
                    title = 'Brokers the policy lists';
                    rows = people(m).map((person) => ({
                        key: person.id,
                        title: person.name,
                        sub: person.role,
                        on: draft.delegates.includes(person.id),
                        go: () => setDraft((current) => ({ ...current, delegates: toggled(current.delegates, person.id) })),
                    }));
                } else {
                    title = 'KYC checked within';
                    const ages = [...new Set([...KYC_AGES, draftOf(policy).maxKycAgeDays])].sort((a, b) => a - b);
                    rows = ages.map((days) => ({
                        key: String(days),
                        title: `${days} days`,
                        on: draft.maxKycAgeDays === days,
                        go: () => {
                            setDraft((current) => ({ ...current, maxKycAgeDays: days }));
                            back();
                        },
                    }));
                }
                return {
                    title,
                    body: (
                        <>
                            <Rows rows={rows} disabled={watched} />
                            {term !== 'age' && (
                                <div className="gk-pop__actions">
                                    <button type="button" className="gk-btn gk-go" onClick={back}>
                                        {Icon.check(15)} Done
                                    </button>
                                </div>
                            )}
                        </>
                    ),
                    keys: rows.map((row) => row.go),
                    enter: back,
                };
            }
            case 'signer': {
                const rows = people(m).map((person) => ({
                    ...personRow(person, 'signer'),
                    go: () => push({ kind: 'trade', signer: person.id }),
                }));
                return { title: 'Who signs the trade?', body: <Rows rows={rows} disabled={watched} />, keys: rows.map((row) => row.go) };
            }
            case 'trade':
                return {
                    title: `${name(step.signer)} trades ${stock}`,
                    body: <TradeForm key={`${step.signer}:${stock}`} m={m} stock={stock} signer={step.signer} busy={busy} />,
                    keys: [],
                };
            case 'confirm': {
                const { action, args } = step;
                const def = actionDef(action);
                const acting = m.acting !== undefined && argsKey(m.acting.action, m.acting.args) === argsKey(action, args);
                const label = acting && m.acting ? m.acting.label : (def.label?.(m.park, args) ?? def.title);
                const error =
                    m.error && m.error.action === action && lastKey === argsKey(action, args) ? m.error.text : undefined;
                const actor =
                    action === 'holder-thaw' && args.who
                        ? `${name(args.who)}, with ${possessive(args.who)} credential (anyone may send it)`
                        : action === 'approve' && args.who
                          ? `${name(args.who)}, from ${possessive(args.who)} own wallet`
                          : def.actor;
                const note = standingNote(def);
                const person = args.who ? m.park.people[args.who] : undefined;
                const go = (): void => run(action, args);
                return {
                    title: label,
                    body: (
                        <div className="gk-confirm" data-error={error ? true : undefined}>
                            {(person || args.stock || args.policy) && (
                                <div className="gk-confirm__target">
                                    {args.stock && <StockChip stock={args.stock} />}
                                    {person && (
                                        <>
                                            <b>{person.name}</b>
                                            {action === 'verify' || action === 'revoke' ? (
                                                <Status tone={credentialLine(person, m.park.now).tone}>
                                                    {credentialLine(person, m.park.now).text}
                                                </Status>
                                            ) : action === 'approve' ? (
                                                args.broker && <span>approves {name(args.broker)}</span>
                                            ) : (
                                                args.stock && (
                                                    <Status tone={accountTone(person.holdings[args.stock].account)}>
                                                        {person.holdings[args.stock].account === 'none'
                                                            ? 'no account'
                                                            : person.holdings[args.stock].account}
                                                    </Status>
                                                )
                                            )}
                                        </>
                                    )}
                                    {args.policy && (
                                        <span>
                                            {args.policy.jurisdictions.join(' + ') || 'no jurisdictions'} · KYC &lt;{' '}
                                            {args.policy.maxKycAgeDays} d ·{' '}
                                            {args.policy.delegates.length > 0
                                                ? `brokers: ${args.policy.delegates.map(name).join(', ')}`
                                                : 'no brokers'}
                                        </span>
                                    )}
                                </div>
                            )}
                            <dl className="gk-confirm__facts">
                                <div>
                                    <dt>Who acts</dt>
                                    <dd>{actor}</dd>
                                </div>
                                <div>
                                    <dt>Takes</dt>
                                    <dd>{minutesText(def)}</dd>
                                </div>
                            </dl>
                            <div className="gk-confirm__standing">
                                <Tag availability={def.availability} />
                                {note && <span>{note}</span>}
                            </div>
                            <p className="gk-confirm__detail">{def.detail}</p>
                            {error && (
                                <p className="gk-act__error" role="alert">
                                    {Icon.cross(14)}
                                    <span>{error}</span>
                                </p>
                            )}
                            <button
                                type="button"
                                className="gk-btn gk-btn--primary gk-go"
                                disabled={busy}
                                data-action={action}
                                data-acting={acting || undefined}
                                onClick={go}
                            >
                                {acting ? (
                                    `${label}…`
                                ) : (
                                    <>
                                        {Icon.check(16)} {error ? 'Try again' : 'Do it'}
                                        <kbd className="gk-key gk-key--enter" aria-hidden="true">
                                            ↵
                                        </kbd>
                                    </>
                                )}
                            </button>
                        </div>
                    ),
                    keys: [],
                    enter: busy ? undefined : go,
                };
            }
            case 'details':
                return {
                    title: details.label === 'The record' ? 'The record' : 'Details',
                    body: <Details state={state} m={m} place={place} stock={stock} />,
                    keys: [],
                };
        }
    };

    const view = viewOf();
    const hidden = !!m.acting || !!m.probe || m.finishing;

    // The keys act on the step on screen, and not while the card steps aside for an action or a trade.
    const keys = useRef({ view, back, stack, watched, hidden });
    keys.current = { view, back, stack, watched, hidden };
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (picker || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as Element | null;
            if (target?.closest('input, select, textarea')) return;
            const current = keys.current;
            // The top bar's own menu takes its Escape first; while the card steps aside, keys leave it be.
            if (current.hidden || document.querySelector('.gk-menu')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                if (current.stack.length > 1 && !current.watched) current.back();
                else game.manager.closeMenu();
                return;
            }
            if (current.watched || event.repeat) return;
            if (event.key === 'Backspace') {
                event.preventDefault();
                current.back();
            } else if (/^[1-9]$/.test(event.key)) {
                const pick = current.view.keys[Number(event.key) - 1];
                if (!pick) return;
                event.preventDefault();
                pick();
            } else if (event.key === 'Enter' && !controlOwnsKey(event)) {
                const enter = current.view.enter;
                if (!enter) return;
                event.preventDefault();
                enter();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [game, picker]);

    if (!menu) return null;
    const info = PLACES[place];
    const title = place === 'pool' ? `Pool ${stock}` : info.title;
    const sub = place === 'pool' ? `${stock} / USDC` : info.sub;
    const atRoot = step.kind === 'root';
    // The card's foot: what the pointed button does, or what the place is.
    const blurb = info.what.replace(/^You\. /, '').replace('Test Stock A', STOCKS[stock].name);
    const foot = atRoot ? (pointed ?? blurb) : undefined;

    const cardEl = (
        <section
            ref={card}
            tabIndex={-1}
            className="gk-pop__card"
            data-frame={dock ? 'right' : sheet ? 'bottom' : 'beside'}
            data-place={place}
            data-step={step.kind}
            role="dialog"
            aria-label={`${title}: what you can do here`}
        >
            <header className="gk-pop__head">
                {atRoot ? (
                    <div className="gk-pop__name">
                        <span className="gk-pop__kind">
                            {KIND[info.kind]} · {sub}
                        </span>
                        <h3>{title}</h3>
                    </div>
                ) : (
                    <>
                        <button type="button" className="gk-pop__back" onClick={back} aria-label="Back" title="Back (Backspace)">
                            {Icon.back(16)}
                        </button>
                        <div className="gk-pop__name">
                            <span className="gk-pop__kind">
                                {title}
                                {PER_POOL.has(place) && place !== 'pool' && <> · {stock}</>}
                            </span>
                            <h3>{view.title}</h3>
                        </div>
                    </>
                )}
                <button
                    type="button"
                    className="gk-pop__close"
                    onClick={() => game.manager.closeMenu()}
                    aria-label="Close the menu"
                    title="Close (Esc)"
                >
                    {Icon.cross(15)}
                </button>
            </header>
            {(atRoot || (place === 'gate' && (step.kind === 'signer' || step.kind === 'trade'))) &&
                PER_POOL.has(place) &&
                place !== 'pool' && (
                <StockTabs m={m} value={stock} onPick={(next) => game.manager.selectStock(next)} />
            )}
            <div className="gk-pop__body">{view.body}</div>
            {foot && <p className="gk-pop__foot">{foot}</p>}
        </section>
    );

    if (sheet)
        return (
            <div className={dock ? 'gk-pop gk-pop--sheet gk-pop--dock' : 'gk-pop gk-pop--sheet'} data-hidden={hidden || undefined}>
                {cardEl}
            </div>
        );
    return (
        <>
            <div ref={mark} className="gk-pop__mark" data-hidden={hidden || undefined} aria-hidden="true" />
            <div ref={outer} className="gk-pop" data-hidden={hidden || undefined}>
                <i className="gk-pop__tip" aria-hidden="true" />
                {cardEl}
            </div>
        </>
    );
}
