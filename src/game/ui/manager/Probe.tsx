'use client';

/** A trade walking through the gate: its five lanterns as they light, then what the pool decided. */
import type { ManagerState } from '../../core/state.ts';
import { STEPS, checkDef, reasonDef, settledWord } from '../../sim/rules.ts';
import { LAMP_TEXT } from '../Desk.tsx';
import { Icon } from '../icons.tsx';
import { StockChip } from './kit.tsx';
import { mustWords, passWord } from './words.ts';

export function ProbeCard({ m }: { m: ManagerState }) {
    const probe = m.probe;
    if (!probe) return null;
    const truth = probe.truth;
    const reason = truth.reason ? reasonDef(truth.reason) : undefined;
    const failedStep = truth.failed ? checkDef(truth.failed).step : undefined;
    const failedTitle = STEPS.find((step) => step.step === failedStep)?.title;
    const summary = !probe.revealed
        ? 'The gate is checking…'
        : failedStep !== undefined
          ? `Step ${failedStep} · ${failedTitle}: ${reason?.title ?? 'refused'}`
          : 'Every step that applies passed.';
    const kicker = m.finishing ? 'Final run' : probe.objective ? 'Objective' : 'Trade';
    return (
        <div
            className="gk-probe"
            data-frame="bottom"
            role="status"
            aria-live="polite"
            data-outcome={probe.revealed ? truth.outcome : 'pending'}
            data-met={probe.revealed && probe.met !== undefined ? probe.met : undefined}
        >
            <div className="gk-probe__head">
                <span className="gk-probe__kicker">{kicker} · through the gate</span>
                <StockChip stock={probe.stock} />
            </div>
            <b className="gk-probe__label">{probe.label}</b>
            <ol className="gk-pipeline gk-pipeline--row">
                {STEPS.map((step, i) => {
                    const lamp = probe.lamps[i] ?? 'idle';
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
                        </li>
                    );
                })}
            </ol>
            <p className="gk-probe__summary">{summary}</p>
            {probe.revealed && (
                <div className="gk-probe__outcome">
                    <div className={`gk-outcome__result gk-outcome__result--${truth.outcome}`}>
                        {truth.outcome === 'fill' ? (
                            <b>{settledWord(probe.request.op)}</b>
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
                    {probe.expect && probe.met !== undefined && (
                        <p className="gk-probe__verdict" data-met={probe.met}>
                            {probe.met ? Icon.check(16) : Icon.cross(16)}
                            {probe.met
                                ? `As it must: it ${probe.expect === 'fill' ? passWord(probe.request.op) : 'is refused'}.`
                                : `Not yet: it ${mustWords(probe.request.op, probe.expect)}.`}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
