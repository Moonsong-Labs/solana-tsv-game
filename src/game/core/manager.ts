/**
 * Manager mode's director: runs a scenario on the multi-pool venue. The
 * player opens a building's menu and sets an action in motion; the town
 * plays it out, the venue changes, and every objective is judged again by
 * the pool's own checks. Trades walk through the gate like any visitor's
 * and settle at their stock's pool.
 *
 * The game's director (`game.ts`) owns the stage, the store and the town;
 * this class drives them while the mode is 'manager'.
 */
import * as THREE from 'three';

import { PLACES } from '../content/places.ts';
import type { V3 } from '../scene/kit.ts';
import { ACTIONS, actionDef, offered, perform, type ActionArgs, type ActionId } from '../sim/actions.ts';
import { CAST } from '../sim/campaign.ts';
import { amount, clock, money } from '../sim/format.ts';
import {
    HOLD_LABEL,
    STOCKS,
    STOCK_IDS,
    brokenGuards,
    judgeOn,
    lacks,
    listed,
    objectiveStatus,
    priceOf,
    settleOn,
    type Objective,
    type Park,
    type StockId,
} from '../sim/park.ts';
import { reasonDef, settledWord, stepLamp } from '../sim/rules.ts';
import { SCENARIO_LIST, scenarioDef, type ScenarioDef, type ScenarioId } from '../sim/scenarios.ts';
import type { TradeRequest, WalletId } from '../sim/types.ts';
import type { LookId } from '../world/character.ts';
import { stockToken } from '../world/fx.ts';
import type { LampState } from '../world/gate.ts';
import {
    PARK_POINTS,
    SPOTS,
    VIEWS,
    poolRim,
    poolView,
    routeFromPool,
    routeToPool,
    type ViewId,
} from '../world/layout.ts';
import type { PoolPlace } from '../world/pool.ts';
import type { PlaceId } from '../world/world.ts';
import type { Game } from './game.ts';
import { adminTx, sendCrane, vote } from './scenes.ts';
import type { ManagerLogEntry, ManagerResult, ManagerState, MenuFocus, ObjectiveView, ProbeState } from './state.ts';
import { run } from './timeline.ts';

/** The light for a time on the venue clock: dawn before nine, dusk after four. */
export function daytimeAt(now: number): number {
    const keys: ReadonlyArray<readonly [number, number]> = [
        [8 * 60, 0.02],
        [9 * 60, 0.1],
        [10 * 60, 0.22],
        [12 * 60, 0.42],
        [14 * 60, 0.6],
        [15 * 60, 0.72],
        [16 * 60, 0.84],
        [19 * 60, 1],
    ];
    const first = keys[0] as readonly [number, number];
    if (now <= first[0]) return first[1];
    for (let i = 1; i < keys.length; i += 1) {
        const [t1, v1] = keys[i] as readonly [number, number];
        const [t0, v0] = keys[i - 1] as readonly [number, number];
        if (now <= t1) return v0 + ((now - t0) / (t1 - t0)) * (v1 - v0);
    }
    return 1;
}

/** What one objective looks like right now, as the pool would decide it. */
export function objectiveView(park: Park, objective: Objective): ObjectiveView {
    const status = objectiveStatus(park, objective);
    const verdict = status.verdict;
    const reason = verdict?.reason ? reasonDef(verdict.reason) : undefined;
    return {
        id: objective.id,
        label: objective.label,
        keep: objective.keep === true,
        kind: objective.kind,
        stock: objective.kind === 'trade' ? objective.stock : undefined,
        request: objective.kind === 'trade' ? objective.request : undefined,
        expect: objective.kind === 'trade' ? objective.expect : undefined,
        met: status.met,
        outcome: verdict?.outcome,
        reason: verdict?.reason,
        code: verdict?.code,
        codeNote: reason?.codeNote,
    };
}

/** The scenario that follows this one, for the result card's "next" button. */
export function nextScenario(id: ScenarioId): ScenarioDef | undefined {
    const missions = SCENARIO_LIST.filter((scenario) => !scenario.sandbox);
    const index = missions.findIndex((scenario) => scenario.id === id);
    return index >= 0 ? missions[index + 1] : undefined;
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The main island's corners, at the foot of its slab and at roof height, for the town-only overview. */
const TOWN_POINTS: readonly V3[] = [
    [-12, -3.2, -12],
    [12, -3.2, -12],
    [12, -3.2, 12],
    [-12, -3.2, 12],
    [-12, 6, -12],
    [12, 6, -12],
    [12, 6, 12],
    [-12, 6, 12],
];

/** How a visitor stands at the barrier: facing the gate. */
const BARRIER_FACING = Math.PI / 2;

export class Manager {
    private logId = 0;
    private tagged = false;

    constructor(private readonly g: Game) {}

    /** The market quarter's pools get name tags of their own the first time manager mode runs. */
    private createTags(): void {
        if (this.tagged) return;
        this.tagged = true;
        const g = this.g;
        g.overlay.createTags(
            STOCK_IDS.filter((stock) => stock !== 'TSA').map((stock) => ({
                id: `pool:${stock}`,
                title: `Pool ${stock}`,
                sub: `${stock} / USDC`,
                tone: 'live',
                anchor: g.world.pools[stock].anchors.label ?? new THREE.Vector3(),
            })),
        );
    }

    /** The scenario's state, while manager mode runs. */
    get state(): ManagerState | undefined {
        return this.g.store.get().manager;
    }

    private patch(patch: Partial<ManagerState> | ((state: ManagerState) => Partial<ManagerState>)): void {
        this.g.store.set((game) => {
            const state = game.manager;
            if (!state) return {};
            const next = typeof patch === 'function' ? patch(state) : patch;
            return { manager: { ...state, ...next }, rev: game.rev + 1 };
        });
    }

    /** Whether the player can set something in motion right now. */
    get idle(): boolean {
        return this.free && !this.state?.watched;
    }

    /** Nothing is playing out: no action, no trade at the gate, no final run. */
    private get free(): boolean {
        const state = this.state;
        return !!state && !state.acting && !state.probe && !state.finishing && this.g.store.get().phase === 'manage';
    }

    // ----- Starting and leaving -----

    /** Sets up a scenario and shows its briefing. */
    begin(id: ScenarioId): void {
        const scenario = scenarioDef(id);
        if (!scenario) return;
        const g = this.g;
        this.createTags();
        g.cancelAll();
        g.resetDay();
        const park = scenario.start();
        this.logId = 0;
        g.store.set({
            mode: 'manager',
            phase: 'briefing',
            chapter: undefined,
            card: undefined,
            info: undefined,
            manager: {
                scenario,
                park,
                stock: scenario.stocks.find((stock) => stock !== 'TSA') ?? 'TSA',
                objectives: scenario.objectives.map((objective) => objectiveView(park, objective)),
                actions: 0,
                slipped: false,
                hints: 0,
                log: [],
                solved: false,
                finishing: false,
            },
        });
        g.world.setMarketQuarter(scenario.stocks.some((stock) => stock !== 'TSA'));
        // The quarter's pools the scenario does not use stay plots, and cannot be clicked.
        for (const stock of STOCK_IDS)
            if (stock !== 'TSA' && g.world.marketQuarter) g.stage.setPickable(`pool:${stock}`, scenario.stocks.includes(stock));
        this.populate(park);
        this.syncWorld(true);
        g.stage.setDaytime(daytimeAt(park.now), true);
        g.stage.setSway(0);
        g.audio.setMood(scenario.music);
        g.audio.play('chapter');
        g.overlay.showTags('none');
        this.lookPark(true);
    }

    /** Closes the briefing: the player takes charge. */
    start(): void {
        if (this.g.store.get().phase !== 'briefing') return;
        this.g.audio.play('click');
        this.g.store.set({ phase: 'manage' });
        this.showTags();
        this.addLog(`Scenario ${this.state?.scenario.title ?? ''}: you have the venue.`, 'event');
        this.frame();
    }

    /** Every building's name, and the market quarter's pools when they stand: the town is the menu. */
    private showTags(): void {
        const scenario = this.state?.scenario;
        if (!scenario) return;
        // On a phone a dozen tags only cover each other; a tap on a building opens its menu all the same.
        if (this.g.stage.size().width < 700) {
            this.g.overlay.showTags('none');
            return;
        }
        this.g.overlay.showTags([
            ...Object.keys(PLACES),
            ...scenario.stocks.filter((stock) => stock !== 'TSA').map((stock) => `pool:${stock}`),
        ]);
    }

    /** Starts the scenario again from its beginning. */
    restart(): void {
        const state = this.state;
        if (state) this.begin(state.scenario.id);
    }

    /** Puts the town back as the day knows it, when manager mode ends. */
    leave(): void {
        if (this.g.store.get().mode !== 'manager') return;
        this.g.world.setMarketQuarter(false);
        this.g.store.set({ mode: 'gate', manager: undefined });
    }

    /** The town's residents in their places: the ones whose stories the scenario tells wait near the gate. */
    private populate(park: Park): void {
        const g = this.g;
        const scenario = this.state?.scenario;
        const waiting: WalletId[] = [];
        for (const objective of scenario?.objectives ?? []) {
            if (objective.kind !== 'trade' || objective.keep) continue;
            const who = objective.request.signer;
            if (!waiting.includes(who)) waiting.push(who);
        }
        waiting.slice(0, 3).forEach((id, slot) => {
            const person = g.world.person(id, CAST[id].look as LookId, [-10.2 - slot * 1.15, 0, 4 + (slot % 2 === 0 ? 0.12 : -0.12)], Math.PI / 2);
            person.setMood('neutral').act('idle');
        });
        void park;
    }

    // ----- Camera -----

    /** How far the panels on each side cover the screen, read from the interface. */
    private insets(): { left: number; right: number; top: number; bottom: number } {
        if (typeof document === 'undefined') return { left: 0, right: 0, top: 0, bottom: 0 };
        const { width, height } = this.g.stage.size();
        let left = 0;
        let right = 0;
        let bottom = 0;
        // A building's menu steps aside while an action or a trade plays: it keeps its box, but the camera
        // need not keep room for it. Read from the state, since the camera moves before the card hides.
        const state = this.state;
        const aside = !!state && (!!state.acting || !!state.probe || state.finishing);
        for (const element of document.querySelectorAll<HTMLElement>('[data-frame]')) {
            if (aside && element.closest('.gk-pop')) continue;
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            // A building's menu stands beside its building, wherever that is on screen: the camera keeps
            // room for it on the right, so the building and its menu are framed together.
            if (element.dataset.frame === 'beside') right = Math.max(right, element.offsetWidth + 48);
            else if (element.dataset.frame === 'left') left = Math.max(left, rect.right);
            else if (element.dataset.frame === 'right') right = Math.max(right, width - rect.left);
            else if (element.dataset.frame === 'bottom') bottom = Math.max(bottom, height - rect.top);
        }
        // The top bar covers the town too; on a phone it wraps to two rows.
        const bar = document.querySelector<HTMLElement>('.gk-top')?.getBoundingClientRect();
        const top = bar && bar.height > 0 ? bar.bottom : 0;
        return { left, right, top, bottom };
    }

    /** The part of the screen the town shows through, between the panels and below the top bar. */
    private freeArea(): { width: number; height: number; left: number; right: number; top: number; bottom: number; freeW: number; freeH: number } {
        const { width, height } = this.g.stage.size();
        const insets = this.insets();
        return {
            width,
            height,
            ...insets,
            freeW: Math.max(width - insets.left - insets.right, width * 0.3),
            freeH: Math.max(height - insets.top - insets.bottom, height * 0.2),
        };
    }

    /**
     * Points the camera so `target` sits in the middle of the town left between the panels. `span`
     * is a view's height for the whole screen; it is widened so the place still fits the free area.
     * A span already fitted to the free area (`fitted`) only needs scaling back to the screen.
     */
    private lookAt(target: V3 | THREE.Vector3, span: number, snap = false, fitted = false): void {
        const { width, height, left, right, top, bottom, freeW, freeH } = this.freeArea();
        const full = fitted ? span * (height / freeH) : span * Math.max(1, (height / freeH) * 0.9, (width * 0.62) / freeW);
        this.g.stage.look(
            {
                target: target instanceof THREE.Vector3 ? target : [target[0], target[1], target[2]],
                span: full,
                shift: (left - right) / width,
                lift: (bottom - top) / height,
            },
            snap,
        );
    }

    private lookView(view: ViewId, snap = false): void {
        const spec = VIEWS[view];
        this.lookAt(spec.target, spec.span, snap);
    }

    /** The whole park: both islands when the market quarter is out, fitted to the free area. */
    lookPark(snap = false): void {
        const g = this.g;
        const { freeW, freeH } = this.freeArea();
        const points = g.world.marketQuarter ? PARK_POINTS : TOWN_POINTS;
        const { target, span } = g.stage.fitPoints(points, 0.03, freeW / freeH);
        this.lookAt(target, span, snap, true);
    }

    /** The view of a place, for its menu and its actions. */
    private lookPlace(place: PlaceId, stock?: StockId): void {
        if (place === 'pool') {
            const view = poolView(stock ?? 'TSA');
            this.lookAt(view.target, view.span);
            return;
        }
        const views: Partial<Record<PlaceId, ViewId>> = {
            issuer: 'issuer',
            bureau: 'bureau',
            gate: 'gate',
            council: 'council',
            exchange: 'exchange',
            haltBoard: 'board',
            chain: 'chain',
            archive: 'chain',
            indexer: 'chain',
        };
        const view = views[place];
        if (view) this.lookView(view);
    }

    /** Nothing has the camera: no action, no trade at the gate, no final run. */
    private get cameraFree(): boolean {
        const state = this.state;
        return !!state && !state.acting && !state.probe && !state.finishing;
    }

    /** Re-frames the current view after the panels change, unless a trade or an action has the camera. */
    frame(): void {
        if (!this.cameraFree) return;
        const menu = this.state?.menu;
        if (menu) this.lookPlace(menu.place, menu.stock);
        else this.lookPark();
    }

    // ----- Menus -----

    /**
     * Opens a building's menu. Pools are told apart by their stock; a stock not on this venue has none.
     * `focus` opens it further in: on one action's last step, or on a new trade.
     */
    openMenu(place: PlaceId, stock?: StockId, focus?: MenuFocus): void {
        const state = this.state;
        if (!state || this.g.store.get().phase !== 'manage') return;
        const pick = stock ?? (place === 'pool' ? 'TSA' : state.stock);
        if (!state.park.listings[pick]) return;
        this.g.audio.play('paper', { volume: 0.6 });
        this.patch({
            menu: { place, stock: place === 'pool' ? pick : undefined, focus },
            stock: pick,
            error: undefined,
        });
        // The panel lays itself out first; the camera then frames the place beside it.
        requestAnimationFrame(() => this.frame());
    }

    closeMenu(): void {
        if (!this.state?.menu || this.state.watched) return;
        this.patch({ menu: undefined, error: undefined });
        requestAnimationFrame(() => this.frame());
    }

    /** The stock that per-pool menus show. */
    selectStock(stock: StockId): void {
        const state = this.state;
        if (!state || !state.park.listings[stock] || state.watched) return;
        this.patch((current) => ({
            stock,
            menu: current.menu?.place === 'pool' ? { place: 'pool', stock } : current.menu,
            error: undefined,
        }));
        if (state.menu?.place === 'pool') requestAnimationFrame(() => this.frame());
    }

    /** A place was clicked in town, or its tag: its menu opens. Not while the game plays its own solution. */
    click(id: string): void {
        if (this.state?.watched) return;
        if (id.startsWith('pool:')) {
            const stock = id.slice(5) as StockId;
            if (STOCK_IDS.includes(stock)) this.openMenu('pool', stock);
            return;
        }
        if (id in PLACES) this.openMenu(id as PlaceId, id === 'pool' ? 'TSA' : undefined);
    }

    // ----- Actions -----

    /** Sets an action in motion. A refused one changes nothing and shows why. */
    act(action: ActionId, args: ActionArgs): void {
        if (!this.state || !this.idle) return;
        run(async () => {
            await this.doAction(action, args);
        });
    }

    /** Carries an action out and plays it in town. Resolves with whether it was done. */
    private async doAction(action: ActionId, args: ActionArgs): Promise<boolean> {
        const state = this.state;
        if (!state) return false;
        const def = actionDef(action);
        const sandbox = state.scenario.sandbox === true;
        const error = offered(state.park, def, sandbox)
            ? def.blocked(state.park, args)
            : 'That is not part of this scenario.';
        if (error) {
            this.g.audio.play('wrong', { volume: 0.7 });
            this.patch({ error: { action, text: error } });
            this.addLog(error, 'refused', def.availability);
            return false;
        }
        this.patch({ acting: { action, args, label: def.label?.(state.park, args) ?? def.title }, error: undefined });
        // The camera goes where the action lands, which is often not the building whose menu is open.
        this.lookPayoff(action, args);
        let line = '';
        const apply = (): void => {
            if (line) return;
            const outcome = perform(state.park, action, args, sandbox);
            line = outcome.ok ? outcome.line : outcome.error;
            this.syncWorld();
            this.g.stage.setDaytime(daytimeAt(state.park.now));
        };
        await this.play(action, args, apply);
        apply();
        this.addLog(line, 'action', def.availability);
        this.patch((current) => ({ acting: undefined, actions: current.actions + (def.sandbox ? 0 : 1) }));
        this.refresh(true);
        this.frame();
        return true;
    }

    /** Frames where an action plays out: the pool it changes, the halt board, the gate, or the building itself. */
    private lookPayoff(action: ActionId, args: ActionArgs): void {
        const stock = args.stock;
        switch (action) {
            case 'thaw-vault':
            case 'return-stock':
            case 'create-pool':
            case 'fund-pool':
            case 'reconcile':
            case 'pause-swaps':
            case 'lift-pause':
            case 'lift-flag':
            case 'sim-shortfall': {
                const view = poolView(stock ?? 'TSA');
                this.lookAt(view.target, view.span * 1.25);
                return;
            }
            case 'hold':
            case 'lift-hold':
            case 'restart-poster':
            case 'sim-halt':
            case 'sim-resume':
            case 'sim-poster-down':
                this.lookView('halt');
                return;
            case 'set-policy':
                this.lookView('venue');
                return;
            case 'holder-thaw':
            case 'approve':
                // The people a scenario is about wait on the entry road, by the gate.
                if (args.who && this.g.world.find(args.who)) this.lookView('gate');
                return;
            default:
                return;
        }
    }

    /**
     * Plays the scenario's reference solution from the start: every move, then the final run. For a
     * projector, or for a player who wants to see one way through. A watched run is not scored.
     */
    showMe(): void {
        const state = this.state;
        if (!state || state.scenario.sandbox || state.scenario.solution.length === 0) return;
        const scenario = state.scenario;
        this.begin(scenario.id);
        this.start();
        this.patch({ watched: true });
        run(async () => {
            await this.g.t.wait(0.8);
            for (const step of scenario.solution) {
                const place = actionDef(step.action).site;
                const menuPlace: PlaceId = place === 'pool' ? 'pool' : (place as PlaceId);
                this.openMenu(menuPlace, step.args.stock, { action: step.action, args: step.args });
                // The card opens on the action's last step: long enough to read who acts and where it stands.
                await this.g.t.wait(2.6);
                const done = await this.doAction(step.action, step.args);
                if (!done) return;
                await this.g.t.wait(0.7);
            }
            this.patch({ menu: undefined, error: undefined });
            await this.g.t.wait(0.6);
            this.finish();
        });
    }

    /** Reveals the next hint. */
    hint(): void {
        const state = this.state;
        if (!state) return;
        const text = state.scenario.hints[state.hints];
        if (text === undefined) return;
        this.g.audio.play('ping', { volume: 0.5 });
        this.patch({ hints: state.hints + 1 });
        this.addLog(text, 'hint');
    }

    /** Judges every objective again, notices broken guard rails and a solved scenario. */
    refresh(afterMove = false): void {
        const state = this.state;
        if (!state) return;
        const { park, scenario } = state;
        const objectives = scenario.objectives.map((objective) => objectiveView(park, objective));
        const solved = !scenario.sandbox && objectives.length > 0 && objectives.every((objective) => objective.met);
        const broken = afterMove ? brokenGuards(park, scenario.objectives) : [];
        if (broken.length > 0) {
            this.g.audio.play('wrong', { volume: 0.6 });
            for (const objective of broken) this.addLog(`Guard rail broken: ${objective.label}.`, 'refused');
        }
        if (solved && !state.solved) {
            this.g.audio.play('correct');
            this.addLog('Every objective holds. Send them through the gate to finish.', 'event');
        }
        this.patch((current) => ({ objectives, solved, slipped: current.slipped || broken.length > 0 }));
    }

    private addLog(text: string, tone: ManagerLogEntry['tone'], availability?: ManagerLogEntry['availability']): void {
        const state = this.state;
        if (!state) return;
        this.logId += 1;
        const entry: ManagerLogEntry = { id: this.logId, time: state.park.now, text, tone, availability };
        this.patch((current) => ({ log: [...current.log, entry].slice(-60) }));
    }

    // ----- Trades through the gate -----

    /** Sends one objective's trade through the gate. */
    probe(objective: string): void {
        const state = this.state;
        if (!state || !this.idle) return;
        const def = state.scenario.objectives.find((item) => item.id === objective);
        if (!def || def.kind !== 'trade') return;
        run(async () => {
            await this.runTrade(def.stock, def.request, def.label, def.id, def.expect);
            this.refresh(true);
        });
    }

    /** Sends any trade through the gate, to the stock's pool. */
    sendTrade(stock: StockId, request: TradeRequest): void {
        const state = this.state;
        if (!state || !this.idle || !state.park.listings[stock]) return;
        const who = state.park.people[request.signer].name;
        const owner = request.owner !== request.signer ? ` for ${state.park.people[request.owner].name}` : '';
        const label = `${who}${owner}: ${tradeWords(request, stock)}`;
        run(async () => {
            await this.runTrade(stock, request, label);
            this.refresh(true);
        });
    }

    /** The way out of town from a pool: across the market quarter when it stands, else the day's own exit. */
    private exitFrom(stock: StockId): V3[] {
        return this.g.world.marketQuarter ? routeFromPool(stock) : [SPOTS.exitStart, SPOTS.exitEnd];
    }

    /**
     * One trade, start to finish: the visitor walks to the barrier, the gate runs the pool's checks
     * with the camera on its lanterns, and a fill walks on to its stock's pool and settles there.
     */
    private async runTrade(
        stock: StockId,
        request: TradeRequest,
        label: string,
        objective?: string,
        expect?: 'fill' | 'refuse',
        fast = false,
    ): Promise<'fill' | 'refuse'> {
        const g = this.g;
        const state = this.state;
        if (!state) return 'refuse';
        const park = state.park;
        const { gate } = g.places;
        const pool = g.world.pools[stock];
        // The token program would refuse a transfer the owner cannot cover: such a trade never walks.
        const missing = lacks(park, stock, request);
        if (missing) {
            g.audio.play('wrong', { volume: 0.6 });
            this.addLog(`${label}: ${missing}`, 'refused');
            return 'refuse';
        }
        const truth = judgeOn(park, stock, request);
        const lamps: LampState[] = ['idle', 'idle', 'idle', 'idle', 'idle'];
        const probe: ProbeState = { objective, label, stock, request, truth, lamps: [...lamps], revealed: false, expect };
        this.patch({ probe });
        const setProbe = (patch: Partial<ProbeState>): void =>
            this.patch((current) => ({ probe: current.probe ? { ...current.probe, ...patch } : undefined }));

        const who = request.signer;
        const cast = CAST[who];
        // Someone waiting on the entry road walks on from there; anyone elsewhere in town comes in
        // again from the road, rather than cutting across the lawns.
        const there = g.world.find(who);
        if (there && !(there.position.x < -7.5 && Math.abs(there.position.z - SPOTS.spawn[2]) < 1.8)) g.world.dismiss(who);
        const person = g.visitor(who);
        person.setMood('neutral').act('idle').lookAt(undefined);
        for (let step = 1; step <= 5; step += 1) gate.setLamp(step, 'idle');
        gate.setBarrier(false);
        // The trade's card lays itself out first (a bottom sheet on a phone); the camera then frames the lanterns above it.
        await g.t.guard(new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
        this.lookView('lanterns');
        await g.t.guard(person.walkTo([SPOTS.barrier], fast ? 4.2 : 3.4));
        person.turn(BARRIER_FACING);

        for (let step = 1; step <= 5; step += 1) {
            const lamp = stepLamp(truth, step);
            if (lamp !== 'off' && lamp !== 'skip' && lamp !== 'na') {
                gate.setLamp(step, 'run');
                lamps[step - 1] = 'run';
                setProbe({ lamps: [...lamps] });
                g.audio.play('tick', { pitch: 0.9 + step * 0.06 });
                await g.t.wait(fast ? 0.2 : 0.34);
            }
            gate.setLamp(step, lamp);
            lamps[step - 1] = lamp;
            setProbe({ lamps: [...lamps] });
            if (lamp === 'pass' || lamp === 'open') g.audio.play('ping', { pitch: 0.9 + step * 0.08, volume: 0.6 });
            if (lamp === 'fail') break;
            await g.t.wait(lamp === 'off' || lamp === 'na' ? 0.06 : 0.14);
        }
        for (let step = 1; step <= 5; step += 1) {
            if (lamps[step - 1] === 'idle') {
                lamps[step - 1] = stepLamp(truth, step);
                gate.setLamp(step, lamps[step - 1] as LampState);
            }
        }
        const met = expect === undefined ? undefined : truth.outcome === expect;
        setProbe({ lamps: [...lamps], revealed: true, met });
        g.audio.play(met === false ? 'wrong' : truth.outcome === 'fill' ? 'correct' : 'stampRefuse', { volume: 0.7 });
        run(() => g.record(`manager-${objective ?? 'trade'}-${this.logId}`, request, truth, undefined, stock, park.now));

        if (truth.outcome === 'fill') {
            gate.showVerdict('fill', settledWord(request.op).toUpperCase());
            gate.setBarrier(true);
            g.audio.play('gate');
            person.setMood('happy').act('cheer');
            await g.t.wait(fast ? 0.2 : 0.45);
            const view = poolView(stock);
            this.lookAt(view.target, view.span);
            await g.t.guard(person.walkTo([SPOTS.pastGate, ...routeToPool(stock)], fast ? 4.4 : 3.6));
            person.face_(pool.anchors.water);
            await g.settleFx(request, truth.quote, person, pool);
            settleOn(park, stock, request, truth.quote);
            this.syncWorld();
            gate.setBarrier(false);
            g.sendOff(who, this.exitFrom(stock), 3);
            this.addLog(`${label}: ${settledWord(request.op).toLowerCase()} on ${stock}.`, 'fill');
        } else {
            const reason = truth.reason ? reasonDef(truth.reason) : undefined;
            const code = reason?.code ? String(reason.code) : reason?.codeNote ?? 'refused';
            gate.showVerdict('refuse', reason?.code ? String(reason.code) : 'REFUSED');
            person.setMood('sad').act('slump');
            g.overlay.float(person.headTop(), reason?.code ? `${reason.code}` : 'Refused', 'bad');
            run(() => g.speak(person, 'visitor', reason ? `${reason.title}?` : 'Refused?', cast.pitch, park.people[who].name, 0.8));
            await g.t.wait(fast ? 0.6 : 1.1);
            g.sendOff(who, [[-9, 0, 5.1], SPOTS.spawn], 2.8);
            this.addLog(`${label}: refused, ${reason?.title.toLowerCase() ?? 'refused'} (${code}).`, 'refuse');
        }
        await g.t.wait(fast ? 0.5 : 1.2);
        for (let step = 1; step <= 5; step += 1) gate.setLamp(step, 'idle');
        this.patch({ probe: undefined });
        if (!this.state?.finishing) this.frame();
        return truth.outcome;
    }

    // ----- Finishing -----

    /** Every objective holds: the trades walk through the gate one last time and the result is shown. */
    finish(): void {
        const state = this.state;
        if (!state || !this.free || !state.solved) return;
        this.patch({ finishing: true, menu: undefined });
        run(async () => {
            const g = this.g;
            let held = true;
            for (const objective of state.scenario.objectives) {
                if (objective.kind !== 'trade') continue;
                const outcome = await this.runTrade(
                    objective.stock,
                    objective.request,
                    objective.label,
                    objective.id,
                    objective.expect,
                    true,
                );
                if (outcome !== objective.expect) held = false;
            }
            const current = this.state;
            if (!current) return;
            // State objectives are read as they stand once the trades have gone through.
            if (current.scenario.objectives.some((objective) => !objectiveStatus(current.park, objective).met)) held = false;
            if (!held) {
                // A trade in the run changed something an objective needed: say so and hand the venue back.
                this.patch({ finishing: false });
                this.addLog('The run did not hold: look at the objectives again.', 'refused');
                this.refresh();
                this.frame();
                return;
            }
            const stars = current.watched
                ? 0
                : 1 + (current.actions <= current.scenario.par ? 1 : 0) + (current.slipped ? 0 : 1);
            const result: ManagerResult = {
                watched: current.watched === true,
                stars,
                actions: current.actions,
                par: current.scenario.par,
                slipped: current.slipped,
                hints: current.hints,
                time: current.park.now,
            };
            this.patch({ finishing: false, result });
            g.store.set({ phase: 'debrief' });
            g.audio.setMood('finale');
            g.audio.play('fanfare');
            this.lookPark();
            for (let i = 0; i < 3; i += 1) {
                g.world.fx.burst(v((Math.random() - 0.5) * 14, 6, (Math.random() - 0.5) * 14 + 4), 'confetti');
                await g.t.wait(0.4);
            }
        });
    }

    // ----- The town follows the venue -----

    /** Makes every pool, the halt board, the exchange and the gate show the venue's state. */
    syncWorld(snap = false): void {
        const state = this.state;
        if (!state) return;
        const g = this.g;
        const { park, scenario } = state;
        const { exchange, haltBoard, gate } = g.places;
        // Every pool, the scenario's or not: one it does not use stands as a bare plot, whatever the last scenario left.
        for (const stock of STOCK_IDS) this.syncPool(g.world.pools[stock], park, stock, snap);
        void scenario;

        const stocks = listed(park);
        const halted = stocks.filter((stock) => park.listings[stock]?.market.status === 'halted');
        const recorded = stocks.filter((stock) => {
            const listing = park.listings[stock];
            return listing && (listing.holds.length > 0 || listing.market.record === 'halted');
        });
        exchange.setStatus(halted.length > 0 ? 'halted' : 'trading');
        const first = halted[0];
        if (first) {
            const code = park.listings[first]?.market.haltCode;
            exchange.setTicker(`${first} HALTED`, code === 'SEC' ? 'SEC trading suspension' : `${code ?? 'LUDP'} · trading pause`);
        } else {
            const [lead, ...rest] = stocks.filter((stock) => park.listings[stock]?.pool.status === 'open');
            if (lead)
                exchange.setTicker(
                    `${lead} ${money(park.listings[lead]?.market.price ?? 0)}`,
                    rest.map((stock) => `${stock} ${money(park.listings[stock]?.market.price ?? 0)}`).join(' · ') ||
                        'primary market',
                );
            else exchange.setTicker('TRADING', 'primary market');
        }
        exchange.setClock(park.now);
        if (park.features.halts) {
            haltBoard.setState(!park.poster ? 'unknown' : recorded.length > 0 ? 'halted' : 'trading');
            haltBoard.setFreshness(park.poster ? 1 : 0);
        } else {
            haltBoard.setState('trading');
            haltBoard.setFreshness(1);
        }
        gate.setPaused(false);
        gate.setPolicy(park.listings[state.stock]?.policy?.version ?? park.listings.TSA?.policy?.version ?? 0);
        g.store.set((game) => ({ rev: game.rev + 1 }));
    }

    private syncPool(pool: PoolPlace, park: Park, stock: StockId, snap: boolean): void {
        const listing = park.listings[stock];
        if (!listing || listing.pool.status === 'none') {
            pool.setStage('none', snap);
            pool.setVaultFrozen(true, snap);
            pool.setBoard(listing?.created ? 'NO POOL YET' : 'NOT LISTED', `${STOCKS[stock].name}`, 'idle');
            return;
        }
        const p = listing.pool;
        pool.setStage(p.status, snap);
        pool.setVaultFrozen(!p.vaultThawed, snap);
        pool.setVaults(p.vaultTsa, p.usdc, p.tsa);
        if (p.status !== 'open') {
            pool.setBoard('NOT FUNDED', p.vaultThawed ? 'vault thawed · waiting for funds' : 'two empty vaults', 'idle');
            return;
        }
        const features = park.features;
        const short = p.vaultTsa < p.tsa - 1e-9;
        const reserves = `${amount(p.tsa, 1)} ${stock} · ${amount(p.usdc, 0)} USDC`;
        if (features.reserves && (short || p.flagged)) {
            pool.setBoard(
                short ? 'OUT OF BALANCE' : 'FLAGGED',
                short ? `vault ${amount(p.vaultTsa, 1)} · books ${amount(p.tsa, 1)} ${stock}` : 'vault whole · waiting for operations',
                'alert',
            );
        } else if (features.halts && listing.holds.length > 0) {
            pool.setBoard(`${stock} HALTED`, `venue hold: ${listing.holds.map((hold) => HOLD_LABEL[hold].toLowerCase()).join(', ')}`, 'alert');
        } else if (features.halts && listing.market.evidenceFresh && listing.market.record === 'halted') {
            pool.setBoard(`${stock} HALTED`, 'the exchange halted it · 7004', 'alert');
        } else if (features.halts && !listing.market.evidenceFresh) {
            pool.setBoard('STATE UNKNOWN', 'halt evidence stale · 7007', 'alert');
        } else if (features.governance && listing.swapsPaused) {
            pool.setBoard('SWAPS PAUSED', `${reserves}`, 'alert');
        } else {
            pool.setBoard(`1 ${stock} = ${money(priceOf(park, stock))} USDC`, reserves, 'open');
        }
    }

    // ----- Choreography -----

    /** How long a token takes between two points: far flights take longer. */
    private flight(from: THREE.Vector3, to: THREE.Vector3): { duration: number; height: number } {
        const distance = from.distanceTo(to);
        return { duration: Math.min(0.9 + distance * 0.05, 2.2), height: Math.min(1.6 + distance * 0.12, 5) };
    }

    /** Plays an action out in town; `apply` changes the venue at the right moment. */
    private async play(action: ActionId, args: ActionArgs, apply: () => void): Promise<void> {
        const g = this.g;
        const state = this.state;
        if (!state) return;
        const park = state.park;
        const { bureau, issuer, gate, council, haltBoard, exchange } = g.places;
        const fx = g.world.fx;
        const pool = args.stock ? g.world.pools[args.stock] : undefined;
        const officer = g.world.find('officer');
        const issuerNpc = g.world.find('issuer');
        const who = args.who ? park.people[args.who] : undefined;
        const resident = args.who ? g.world.find(args.who) : undefined;
        const over = (place: THREE.Vector3): THREE.Vector3 => place.clone().add(v(0, 0.6, 0));
        switch (action) {
            case 'verify':
            case 'revoke': {
                const issue = action === 'verify';
                officer?.act(issue ? 'stamp' : 'shake');
                await g.t.wait(issue ? 0.2 : 0.5);
                officer?.act('stamp');
                bureau.stamp(issue ? 'issue' : 'revoke');
                await g.t.wait(0.42);
                g.audio.play('seal', { pitch: issue ? 1 : 0.8 });
                if (!issue) g.audio.play('wrong', { volume: 0.5 });
                fx.burst(bureau.anchors.seal ?? bureau.anchors.label, 'sparkle', issue ? 14 : 6);
                apply();
                const seal = bureau.anchors.seal ?? bureau.anchors.label;
                if (resident && seal) {
                    const head = (): THREE.Vector3 => resident.headTop();
                    await g.t.guard(
                        fx.fly(issue ? 'credential' : 'revocation', seal, head, {
                            ...this.flight(seal, resident.headTop()),
                            trail: issue ? '#cdd6ff' : '#ffc9c2',
                            scale: 1.2,
                        }),
                    );
                    resident.setMood(issue ? 'happy' : 'surprised').act(issue ? 'cheer' : 'shake');
                }
                if (seal) {
                    g.overlay.float(
                        resident ? resident.headTop() : over(seal),
                        issue ? `Credential issued: ${who?.name ?? ''} (${who?.home ?? ''})` : `Credential revoked: ${who?.name ?? ''}`,
                        issue ? 'good' : 'bad',
                        2.4,
                    );
                    adminTx(g, seal);
                }
                await g.t.wait(0.9);
                resident?.setMood('neutral');
                break;
            }
            case 'holder-thaw':
            case 'issuer-thaw': {
                const out = issuer.anchors.output;
                if (action === 'issuer-thaw') {
                    issuerNpc?.act('stamp');
                    issuer.press();
                    g.audio.play('press');
                    await g.t.wait(0.5);
                } else {
                    resident?.act('nod');
                    await g.t.wait(0.3);
                }
                apply();
                g.audio.play('thaw');
                const at = resident ? resident.headTop().add(v(0, -0.6, 0)) : out;
                if (at) fx.burst(at, 'ice', 16);
                if (at)
                    g.overlay.float(
                        resident ? resident.headTop() : at,
                        `${who?.name ?? ''}'s ${args.stock ?? ''} account thawed`,
                        'ice',
                        2.4,
                    );
                if (out) adminTx(g, out);
                await g.t.wait(1);
                break;
            }
            case 'create-stock': {
                const out = issuer.anchors.output;
                issuerNpc?.act('stamp');
                await g.t.wait(0.3);
                issuer.press();
                g.audio.play('press');
                await g.t.wait(0.5);
                apply();
                if (out) {
                    for (let i = 0; i < 3; i += 1) {
                        void fx
                            .fly(stockToken(args.stock ?? 'TSA', true), out, out.clone().add(v(0.9 + i * 0.5, 0.3, 0.9 - i * 0.2)), {
                                duration: 0.7,
                                height: 1.2,
                            })
                            .then(() => g.audio.play('freeze', { volume: 0.5 }));
                        await g.t.wait(0.22);
                    }
                    g.overlay.float(out, `${args.stock ? STOCKS[args.stock].name : ''} · frozen by default`, 'ice', 2.6);
                    adminTx(g, out);
                }
                issuerNpc?.setMood('happy');
                await g.t.wait(1.1);
                break;
            }
            case 'thaw-vault': {
                const out = issuer.anchors.output;
                issuerNpc?.act('stamp');
                issuer.press();
                g.audio.play('press');
                await g.t.wait(0.45);
                if (out && pool)
                    await g.t.guard(
                        fx.fly('key', out, pool.anchors.stockVault, {
                            ...this.flight(out, pool.anchors.stockVault),
                            trail: '#ffe08a',
                            scale: 1.5,
                        }),
                    );
                apply();
                g.audio.play('thaw');
                if (pool) {
                    fx.burst(pool.anchors.stockVault, 'ice', 22);
                    g.overlay.float(pool.anchors.stockVault, 'Vault thawed', 'good', 2.4);
                    adminTx(g, pool.anchors.stockVault);
                }
                await g.t.wait(1);
                break;
            }
            case 'recover':
            case 'return-stock': {
                const out = issuer.anchors.output;
                issuerNpc?.act('stamp');
                issuer.press();
                g.audio.play('press');
                await g.t.wait(0.5);
                const source = action === 'recover' ? (resident ? resident.hands() : out) : out;
                const target = action === 'recover' ? out : pool?.anchors.stockVault;
                if (source && target) {
                    const flights: Promise<void>[] = [];
                    for (let i = 0; i < 4; i += 1) {
                        flights.push(
                            fx.fly(stockToken(args.stock ?? 'TSA'), source, target, {
                                ...this.flight(source, target),
                                trail: '#ffd3df',
                            }),
                        );
                        await g.t.wait(0.18);
                    }
                    await g.t.guard(Promise.all(flights));
                }
                apply();
                g.audio.play('coin');
                if (target)
                    g.overlay.float(
                        target,
                        action === 'recover' ? `Recovered: ${who?.name ?? ''}'s ${args.stock ?? ''}` : 'Vault whole again',
                        action === 'recover' ? 'info' : 'good',
                        2.4,
                    );
                if (out) adminTx(g, out);
                await g.t.wait(0.9);
                break;
            }
            case 'create-pool':
            case 'fund-pool': {
                if (!pool) {
                    apply();
                    break;
                }
                // Yuki works the pool from its rim; she appears there in a puff, as the pool's own business.
                const yuki = g.visitor('yuki');
                const rim = poolRim(pool.stock);
                if (yuki.position.distanceTo(v(rim[0], 0, rim[2])) > 1.2) {
                    yuki.place(rim, Math.PI);
                    fx.burst(yuki.headTop(), 'dust', 10);
                }
                yuki.face_(pool.anchors.water);
                yuki.act('wave', 0.8);
                await g.t.wait(0.4);
                if (action === 'create-pool') {
                    apply();
                    g.audio.play('pop');
                    fx.burst(pool.anchors.water, 'dust', 18);
                    await g.t.wait(0.4);
                    fx.burst(pool.anchors.stockVault, 'ice', 8);
                    g.audio.play('freeze');
                    g.overlay.float(pool.anchors.stockVault, 'Stock vault: frozen', 'ice', 2.4);
                } else {
                    const hands = (): THREE.Vector3 => yuki.hands();
                    for (let i = 0; i < 3; i += 1) {
                        void fx.fly(stockToken(pool.stock), hands, pool.anchors.water, { duration: 0.7, height: 1.4 });
                        void fx.fly('usdc', hands, pool.anchors.water, { duration: 0.85, height: 1.8 });
                        await g.t.wait(0.26);
                        g.audio.play('coin', { pitch: 1 + i * 0.08 });
                    }
                    await g.t.wait(0.4);
                    apply();
                    pool.splash();
                    fx.burst(pool.anchors.water, 'splash', 22);
                    g.audio.play('splash');
                    yuki.setMood('happy').act('cheer');
                    fx.burst(pool.anchors.board, 'sparkle', 14);
                }
                adminTx(g, pool.anchors.board);
                await g.t.wait(1.1);
                yuki.setMood('neutral');
                g.sendOff('yuki', this.exitFrom(pool.stock), 3);
                break;
            }
            case 'reconcile': {
                apply();
                if (pool) {
                    g.audio.play('stampRefuse', { volume: 0.5 });
                    g.overlay.float(pool.anchors.board, 'Reconciled', 'info', 2.2);
                    adminTx(g, pool.anchors.board);
                }
                await g.t.wait(0.8);
                break;
            }
            case 'set-policy': {
                const from = council.anchors.steps.clone().setY(1.4);
                await g.t.guard(
                    fx.fly('scroll', from, gate.anchors.book, { ...this.flight(from, gate.anchors.book), trail: '#fff3d6' }),
                );
                apply();
                g.audio.play('paper');
                fx.burst(gate.anchors.book, 'sparkle', 12);
                const policy = args.stock ? park.listings[args.stock]?.policy : undefined;
                gate.setPolicy(policy?.version ?? 1);
                g.overlay.float(gate.anchors.book, `${args.stock ?? ''} trade policy v${policy?.version ?? 1}`, 'gold', 2.6);
                adminTx(g, gate.anchors.book);
                await g.t.wait(1);
                break;
            }
            case 'approve': {
                const broker = args.broker ? park.people[args.broker].name : '';
                resident?.act('nod');
                g.audio.play('paper');
                apply();
                g.overlay.float(
                    resident ? resident.headTop() : gate.anchors.book,
                    `${who?.name ?? ''} approves ${broker}`,
                    'gold',
                    2.4,
                );
                adminTx(g, resident ? resident.hands() : gate.anchors.book);
                await g.t.wait(1);
                break;
            }
            case 'pause-swaps':
            case 'hold': {
                g.audio.play('alarm', { volume: 0.6 });
                await vote(g, 'emergency', 2);
                council.gong();
                g.audio.play('gong');
                await g.t.wait(0.4);
                const to = action === 'hold' ? haltBoard.anchors.perch : pool?.anchors.board;
                if (to)
                    await g.t.guard(
                        fx.fly('admin', council.anchors.emergency, to, {
                            ...this.flight(council.anchors.emergency, to),
                            trail: '#ffc9c2',
                            scale: 1.3,
                        }),
                    );
                apply();
                g.audio.play('stampRefuse');
                if (to) {
                    fx.ring(to.clone().setY(0.05), '#ee5d50', 2);
                    g.overlay.float(
                        to,
                        action === 'hold' ? `${args.hold ? HOLD_LABEL[args.hold] : ''} hold: ${args.stock ?? ''}` : `Swaps paused: ${args.stock ?? ''}`,
                        'bad',
                        2.6,
                    );
                    adminTx(g, to);
                }
                await g.t.wait(0.8);
                council.setVotes('emergency', 0, 3);
                break;
            }
            case 'lift-pause':
            case 'lift-hold':
            case 'lift-flag': {
                // The emergency role may not lift anything: operations does, after its time lock.
                g.world.find('signer:emergency')?.act('shake');
                await vote(g, 'operations', 2);
                g.audio.play('tick');
                await g.t.tween(1.8, (t) => council.setTimeLock('operations', t));
                council.gong();
                g.audio.play('gong');
                await g.t.wait(0.4);
                const to = action === 'lift-hold' ? haltBoard.anchors.perch : pool?.anchors.board;
                if (to)
                    await g.t.guard(
                        fx.fly('admin', council.anchors.operations, to, {
                            ...this.flight(council.anchors.operations, to),
                            trail: '#cfe3ff',
                            scale: 1.3,
                        }),
                    );
                apply();
                g.audio.play('correct');
                if (to) {
                    fx.burst(to, 'sparkle', 12);
                    g.overlay.float(
                        to,
                        action === 'lift-flag' ? 'Flag lifted' : action === 'lift-hold' ? 'Hold lifted' : 'Swaps open',
                        'good',
                        2.4,
                    );
                    adminTx(g, to);
                }
                await g.t.wait(0.6);
                council.setVotes('operations', 0, 3);
                council.setTimeLock('operations', 0);
                break;
            }
            case 'restart-poster': {
                const poster = g.world.find('bot:poster');
                poster?.setMood('happy').act('cheer');
                await sendCrane(g, 'heartbeat');
                apply();
                haltBoard.setFreshness(1);
                g.audio.play('correct');
                fx.burst(haltBoard.anchors.perch, 'sparkle', 12);
                g.overlay.float(haltBoard.anchors.perch, 'Fresh evidence', 'good', 2.4);
                await g.t.wait(0.8);
                poster?.setMood('neutral');
                break;
            }
            case 'sim-halt':
            case 'sim-resume': {
                const halt = action === 'sim-halt';
                exchange.ringBell();
                g.audio.play('bell', { pitch: halt ? 1 : 1.12 });
                if (halt) g.audio.play('alarm', { volume: 0.5 });
                await g.t.wait(0.4);
                if (park.poster) await sendCrane(g, halt ? 'halt' : 'resume');
                apply();
                g.overlay.float(haltBoard.anchors.perch, `${args.stock ?? ''} ${halt ? 'HALTED' : 'TRADING'}`, halt ? 'bad' : 'good', 2.4);
                await g.t.wait(0.6);
                break;
            }
            case 'sim-poster-down': {
                const poster = g.world.find('bot:poster');
                poster?.setMood('sad').act('slump');
                g.overlay.float(poster?.headTop() ?? haltBoard.anchors.perch, 'zzz…', 'info', 3);
                await g.t.tween(1.6, (t) => haltBoard.setFreshness(1 - t));
                apply();
                g.audio.play('wrong', { volume: 0.6 });
                break;
            }
            case 'sim-clock': {
                g.audio.play('tick');
                apply();
                await g.t.wait(0.6);
                break;
            }
        }
    }
}

/** A trade in a few words: "buy 10 USDC of TSB". */
export function tradeWords(request: TradeRequest, stock: StockId): string {
    switch (request.op) {
        case 'buy':
            return `buy ${amount(request.amount, 0)} USDC of ${stock}`;
        case 'sell':
            return `sell ${amount(request.amount)} ${stock}`;
        case 'deposit':
            return `deposit ${amount(request.amount)} LP of ${stock} liquidity`;
        case 'withdraw':
            return `withdraw ${amount(request.amount)} LP from ${stock}`;
    }
}

/** The actions a building offers in this scenario, in menu order. */
export function siteActions(state: ManagerState, site: (typeof ACTIONS)[number]['site']): typeof ACTIONS {
    return ACTIONS.filter((action) => action.site === site && offered(state.park, action, state.scenario.sandbox === true));
}

/** The clock as the log prints it. */
export function logTime(minutes: number): string {
    return clock(minutes);
}
