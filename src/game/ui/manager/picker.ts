/**
 * Manager mode's bits of interface state that are not the game's: whether
 * the scenario picker is open, the viewer's best stars, and whether the
 * screen is small enough for bottom sheets. The director never reads them.
 */
import { useSyncExternalStore } from 'react';

import { SCENARIO_LIST, type ScenarioDef, type ScenarioId } from '../../sim/scenarios.ts';

// ----- The scenario picker -----

let pickerOpen = false;
const pickerListeners = new Set<() => void>();

function setPicker(open: boolean): void {
    if (pickerOpen === open) return;
    pickerOpen = open;
    for (const listener of pickerListeners) listener();
}

export function openPicker(): void {
    setPicker(true);
}

export function closePicker(): void {
    setPicker(false);
}

function subscribePicker(listener: () => void): () => void {
    pickerListeners.add(listener);
    return () => pickerListeners.delete(listener);
}

/** Whether the scenario picker is on screen. */
export function usePickerOpen(): boolean {
    return useSyncExternalStore(
        subscribePicker,
        () => pickerOpen,
        () => false,
    );
}

// ----- Best stars, per viewer -----

const BEST_KEY = 'gk-manager-best';

/** The viewer's best stars per scenario. Storage can be missing or blocked: then nothing is remembered. */
export function readBest(): Partial<Record<ScenarioId, number>> {
    try {
        const raw = window.localStorage.getItem(BEST_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const best: Partial<Record<ScenarioId, number>> = {};
        for (const [id, stars] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof stars === 'number' && stars >= 1 && stars <= 3) best[id as ScenarioId] = Math.floor(stars);
        }
        return best;
    } catch {
        return {};
    }
}

/** Keeps the better of the stored and the new stars. */
export function saveBest(id: ScenarioId, stars: number): void {
    try {
        const best = readBest();
        if ((best[id] ?? 0) >= stars) return;
        best[id] = stars;
        window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {
        // Private windows and blocked storage: the stars are simply not remembered.
    }
}

// ----- Scenarios -----

/** The missions in order, free play left out. */
export const MISSIONS: readonly ScenarioDef[] = SCENARIO_LIST.filter((scenario) => !scenario.sandbox);

/** The mission after this one, for the result card. */
export function nextMission(id: ScenarioId): ScenarioDef | undefined {
    const index = MISSIONS.findIndex((scenario) => scenario.id === id);
    return index >= 0 ? MISSIONS[index + 1] : undefined;
}

// ----- Layout -----

/** Phones and short windows: the side panels become bottom sheets. Kept in step with manager.css. */
export const SHEET_QUERY = '(max-width: 900px), (max-height: 520px)';

function subscribeSheets(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const query = window.matchMedia(SHEET_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
}

/** True when the side panels are bottom sheets. */
export function useSheets(): boolean {
    return useSyncExternalStore(
        subscribeSheets,
        () => window.matchMedia(SHEET_QUERY).matches,
        () => false,
    );
}

/**
 * Short, wide windows (a phone on its side): a building's menu docks on the right, where the bottom
 * sheet would leave neither its buttons nor the building room. Kept in step with manager.css.
 */
export const DOCK_QUERY = '(max-height: 520px) and (min-width: 600px)';

function subscribeDock(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const query = window.matchMedia(DOCK_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
}

/** True when a building's menu docks on the right instead of rising as a bottom sheet. */
export function useDock(): boolean {
    return useSyncExternalStore(
        subscribeDock,
        () => window.matchMedia(DOCK_QUERY).matches,
        () => false,
    );
}
