'use client';

/**
 * Manager mode's interface over the town: the briefing, the objectives on
 * the left, a building's menu in a small card beside the building, a trade
 * at the gate, and the result. On phones and short windows the objectives
 * and the menu are bottom sheets, one at a time.
 *
 * The director frames the town around them: it measures every element
 * marked `data-frame` (left, right, bottom, or beside a building).
 */
import { useEffect, useState, type CSSProperties } from 'react';

import { useGame, useGameState } from '../context.tsx';
import { Briefing, Debrief } from './Cards.tsx';
import { GoalsChip, GoalsPanel } from './Goals.tsx';
import { BuildingMenu } from './Menu.tsx';
import { useSheets } from './picker.ts';
import { ProbeCard } from './Probe.tsx';

/** How far down the top bar reaches, so no panel ever covers it. */
function useTopReach(active: boolean): number {
    const [reach, setReach] = useState(64);
    useEffect(() => {
        if (!active) return undefined;
        const bar = document.querySelector<HTMLElement>('.gk-top');
        if (!bar) return undefined;
        const measure = (): void => {
            const root = bar.closest('.gk-root')?.getBoundingClientRect().top ?? 0;
            setReach(Math.ceil(bar.getBoundingClientRect().bottom - root));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(bar);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [active]);
    return reach;
}

export function ManagerLayer() {
    const game = useGame();
    const state = useGameState();
    const sheets = useSheets();
    const m = state.mode === 'manager' ? state.manager : undefined;
    const managing = m !== undefined && state.phase === 'manage';
    /** The objectives panel on a wide screen: open unless the player folds it. */
    const [wideGoals, setWideGoals] = useState(true);
    /** The objectives sheet on a phone: folded unless the player opens it. */
    const [sheetGoals, setSheetGoals] = useState(false);
    const reach = useTopReach(managing);
    const menuOpen = m?.menu !== undefined;
    const goalsShown = sheets ? sheetGoals && !menuOpen : wideGoals;

    // On a phone the two sheets never share the screen: a building's menu folds the objectives.
    useEffect(() => {
        if (sheets && menuOpen) setSheetGoals(false);
    }, [sheets, menuOpen, m?.menu?.place]);

    // A new scenario starts with the objectives in view on a wide screen.
    const scenarioId = m?.scenario.id;
    useEffect(() => {
        setWideGoals(true);
        setSheetGoals(false);
    }, [scenarioId]);

    // When the panels change, the camera frames the town between them again (not while a trade or an
    // action has the camera).
    const busyCamera = !!m?.probe || !!m?.acting || !!m?.finishing;
    useEffect(() => {
        if (!managing || busyCamera) return undefined;
        const frame = requestAnimationFrame(() => game.manager.frame());
        return () => cancelAnimationFrame(frame);
    }, [game, managing, goalsShown, sheets, busyCamera]);

    if (!m) return null;
    const showGoals = (): void => {
        if (sheets) {
            if (menuOpen) game.manager.closeMenu();
            setSheetGoals(true);
        } else setWideGoals(true);
    };
    const hideGoals = (): void => (sheets ? setSheetGoals(false) : setWideGoals(false));
    return (
        <div
            className="gk-mlayer"
            data-sheets={sheets || undefined}
            data-goals={goalsShown || undefined}
            data-menu={menuOpen || undefined}
            data-probe={m.probe ? true : undefined}
            style={{ '--gk-top-reach': `${reach}px` } as CSSProperties}
        >
            {state.phase === 'briefing' && <Briefing m={m} />}
            {managing && (
                <>
                    {goalsShown ? (
                        <GoalsPanel state={state} m={m} sheet={sheets} onHide={hideGoals} />
                    ) : (
                        <GoalsChip m={m} onShow={showGoals} />
                    )}
                    {m.menu && (
                        <BuildingMenu
                            key={m.menu.place === 'pool' ? `pool:${m.menu.stock ?? 'TSA'}` : m.menu.place}
                            state={state}
                            m={m}
                            sheet={sheets}
                        />
                    )}
                    {m.probe && (
                        <div className="gk-probedock">
                            <ProbeCard m={m} />
                        </div>
                    )}
                </>
            )}
            {state.phase === 'debrief' && m.result && <Debrief m={m} />}
        </div>
    );
}
