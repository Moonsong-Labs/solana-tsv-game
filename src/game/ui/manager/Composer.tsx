'use client';

/**
 * A trade's last step in a menu: who signed is already chosen; here the trade itself (what, how much,
 * and for whom when a broker signs), what the pool would decide right now, and off through the gate.
 */
import { useState } from 'react';

import type { ManagerState } from '../../core/state.ts';
import { amount } from '../../sim/format.ts';
import { MAX_MOVE, judgeOn, priceMove, type Park, type StockId } from '../../sim/park.ts';
import type { Operation, Quote, TradeRequest, WalletId } from '../../sim/types.ts';
import { useGame } from '../context.tsx';
import { Icon } from '../icons.tsx';
import { Choice, Field, StockChip } from './kit.tsx';
import { fillWords, isSwap, refusalText } from './words.ts';

const OPS: ReadonlyArray<{ value: Operation; text: string }> = [
    { value: 'buy', text: 'Buy' },
    { value: 'sell', text: 'Sell' },
    { value: 'deposit', text: 'Deposit' },
    { value: 'withdraw', text: 'Withdraw' },
];

/** Small on purpose: every composed trade stays well inside a price band the game does not model. */
const AMOUNTS: Record<Operation, readonly number[]> = {
    buy: [5, 10, 25],
    sell: [0.5, 1, 2],
    deposit: [0.1, 0.5, 1],
    withdraw: [0.1, 0.5, 1],
};

function unit(op: Operation, stock: StockId): string {
    return op === 'buy' ? 'USDC' : op === 'sell' ? stock : 'LP';
}

/** What the owner lacks for the fill to settle, if anything. The pool's checks come first; the token program after. */
function shortfall(park: Park, stock: StockId, request: TradeRequest, fill: Quote): string | undefined {
    const owner = park.people[request.owner];
    const holding = owner.holdings[stock];
    const need = (have: number, want: number, what: string): string | undefined =>
        have + 1e-9 < want ? `${owner.name} holds ${amount(have)} ${what}, not ${amount(want)}` : undefined;
    switch (request.op) {
        case 'buy':
            return need(owner.usdc, request.amount, 'USDC');
        case 'sell':
            return need(holding.shares, request.amount, stock);
        case 'deposit':
            return need(holding.shares, -fill.tsa, stock) ?? need(owner.usdc, -fill.usdc, 'USDC');
        case 'withdraw':
            return need(holding.lp, request.amount, `LP of ${stock}`);
    }
}

export function TradeForm({
    m,
    stock,
    signer,
    busy,
}: {
    m: ManagerState;
    stock: StockId;
    signer: WalletId;
    busy: boolean;
}) {
    const game = useGame();
    const park = m.park;
    const people = Object.values(park.people);
    const [owner, setOwner] = useState<WalletId | 'self'>('self');
    const [op, setOp] = useState<Operation>('buy');
    const [pick, setPick] = useState(1);
    if (!park.listings[stock]) return <p className="gk-mempty">{stock} is not on this venue.</p>;

    // On main only the owner signs a deposit or a withdrawal: a broker trades swaps.
    const brokered = isSwap(op) && owner !== 'self' && owner !== signer;
    const sizes = AMOUNTS[op];
    const size = sizes[Math.min(pick, sizes.length - 1)] as number;
    const request: TradeRequest = { op, signer, owner: brokered ? (owner as WalletId) : signer, amount: size };
    const delegated = request.owner !== request.signer;
    const moves = sizes.map((value) => priceMove(park, stock, { ...request, amount: value }));
    const tooBig = (moves[Math.min(pick, sizes.length - 1)] ?? 0) >= MAX_MOVE;
    const verdict = judgeOn(park, stock, request);
    const lacking = verdict.outcome === 'fill' ? shortfall(park, stock, request, verdict.quote) : undefined;
    const signerName = park.people[signer].name;
    const ownerName = park.people[request.owner].name;

    return (
        <div className="gk-composer">
            <Field label="Trade">
                <Choice label="Operation" value={op} options={OPS} onPick={setOp} />
            </Field>
            <Field label="Amount">
                <Choice
                    label="Amount"
                    value={pick}
                    options={sizes.map((value, index) => ({
                        value: index,
                        text: `${amount(value, value < 1 ? 1 : 0)} ${unit(op, stock)}`,
                        off: (moves[index] ?? 0) >= MAX_MOVE,
                        title:
                            (moves[index] ?? 0) >= MAX_MOVE
                                ? `It would move the ${stock} price more than ${MAX_MOVE * 100}%.`
                                : undefined,
                    }))}
                    onPick={setPick}
                />
            </Field>
            <Field label="For">
                <select
                    aria-label="Whose accounts the trade moves"
                    value={brokered ? owner : 'self'}
                    disabled={!isSwap(op)}
                    title={isSwap(op) ? undefined : 'Only the owner signs a deposit or a withdrawal.'}
                    onChange={(event) => setOwner(event.target.value as WalletId | 'self')}
                >
                    <option value="self">{signerName}&apos;s own</option>
                    {people
                        .filter((person) => person.id !== signer)
                        .map((person) => (
                            <option key={person.id} value={person.id}>
                                {person.name}&apos;s, as a broker
                            </option>
                        ))}
                </select>
            </Field>
            {!isSwap(op) && owner !== 'self' && owner !== signer && (
                <p className="gk-composer__note">
                    Only the owner signs a deposit or a withdrawal on main, so {signerName} moves their own
                    liquidity here.
                </p>
            )}
            {delegated && (
                <p className="gk-composer__note">
                    {signerName} signs for {ownerName}: the pool reads {ownerName}&apos;s approval, the policy&apos;s
                    broker list and both credentials.
                </p>
            )}
            <div className="gk-preview" data-outcome={tooBig || lacking ? 'blocked' : verdict.outcome} role="status">
                <span className="gk-preview__kicker">
                    The {stock} pool, right now <StockChip stock={stock} />
                </span>
                {verdict.outcome === 'fill' ? (
                    <b>
                        {isSwap(op) ? 'would fill' : 'would go through'}: {fillWords(request, stock, verdict.quote)}
                    </b>
                ) : (
                    <b>would be refused: {refusalText(verdict.reason)}</b>
                )}
                {tooBig && (
                    <span className="gk-preview__note">
                        Too big for this pool: it would move the price more than {MAX_MOVE * 100}%. Pick a smaller
                        amount.
                    </span>
                )}
                {lacking && !tooBig && (
                    <span className="gk-preview__note">
                        The pool would agree, but {lacking}: the token transfer would fail.
                    </span>
                )}
            </div>
            <button
                type="button"
                className="gk-btn gk-btn--primary gk-go"
                disabled={busy || tooBig || lacking !== undefined}
                onClick={() => game.manager.sendTrade(stock, request)}
                data-send
            >
                {Icon.send(16)} Send through the gate
            </button>
        </div>
    );
}
