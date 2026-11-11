/**
 * The director: runs the venue day from the title screen to the closing
 * bell. It owns the simulated venue, moves the town to match it, waits for
 * the player's decisions (or plays them itself in autoplay) and grades them
 * against what the pool decides.
 */
import * as THREE from 'three';

import type { AudioEngine } from '../audio/audio.ts';
import { PLACES } from '../content/places.ts';
import type { V3 } from '../scene/kit.ts';
import type { Stage } from '../scene/stage.ts';
import {
    CAST,
    DAY_BEATS,
    RUSH,
    applyBeat,
    openingVenue,
    type Beat,
    type CaseDef,
    type ChapterDef,
    type SceneDef,
    type SetupStep,
} from '../sim/campaign.ts';
import { amount, clock, money } from '../sim/format.ts';
import { bandWidth, judge, price, reasonDef, settle, settledWord, stepLamp } from '../sim/rules.ts';
import type { Quote, ReasonId, TradeRequest, Venue, Verdict, WalletId } from '../sim/types.ts';
import type { Character, LookId } from '../world/character.ts';
import type { LampState } from '../world/gate.ts';
import { SPOTS, VIEWS, queueSpot, type ViewId } from '../world/layout.ts';
import { World, type PlaceId } from '../world/world.ts';
import { Overlay } from './overlay.ts';
import { playScene, playSetupStep, playTour } from './scenes.ts';
import type { GameState, Grade, LedgerEntry, Paper, Settings } from './state.ts';
import { Store } from './store.ts';
import { Cancelled, Timeline, run } from './timeline.ts';

interface Pending {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    /** Seconds after which autoplay answers; undefined when only the player can. */
    auto: number | undefined;
    autoValue: unknown;
}

const SPEEDS = [1, 1.6, 2.5];

export class Game {
    readonly store: Store<GameState>;
    readonly world: World;
    readonly t: Timeline;
    readonly overlay: Overlay;
    venue: Venue = openingVenue();

    private readonly pending = new Map<string, Pending>();
    private keeper: Character | undefined;
    private askedKyc = false;
    /** Papers asked for while another was being handed over: they are asked next. */
    private wanted: Paper[] = [];
    /** The player pressed "next" while the visitor was still settling: move on as soon as that ends. */
    private nextQueued = false;
    /** A stamp that came down while the gatekeeper was mid-sentence: it lands when the paper has. */
    private queuedStamp: { approve: boolean; reason?: ReasonId } | undefined;
    private speedBeforeSkip: number | undefined;
    private started = false;
    /** Visitors walking out of town, by the ticket of their latest send-off. */
    private readonly leaving = new Map<string, number>();
    private tickets = 0;

    constructor(
        readonly stage: Stage,
        overlayRoot: HTMLElement,
        public audio: AudioEngine,
        settings: Partial<Settings> = {},
    ) {
        this.world = new World(stage);
        this.t = new Timeline(stage);
        this.overlay = new Overlay(stage, overlayRoot, () => this.audio);
        this.store = new Store<GameState>({
            phase: 'loading',
            beat: 0,
            venue: this.venue,
            rev: 0,
            score: { correct: 0, partial: 0, wrong: 0, streak: 0, best: 0, points: 0 },
            ledger: [],
            cases: 0,
            settings: {
                autoplay: false,
                speed: 1,
                muted: false,
                quality: stage.getQuality(),
                ...settings,
            },
            slot: 1,
            skipping: false,
            sound: false,
        });
        stage.timeScale = this.settings.speed;

        this.overlay.createTags(
            (Object.keys(PLACES) as PlaceId[]).map((id) => ({
                id,
                title: PLACES[id].title,
                sub: PLACES[id].sub,
                tone: PLACES[id].availability,
                anchor: this.world.places[id].anchors.label ?? new THREE.Vector3(),
            })),
        );
        this.overlay.onTag = (id) => this.clickPlace(id as PlaceId);
        stage.onPick = (hit) => this.clickPlace(hit.id as PlaceId);
        // The stage knows its size after the window does, so the title is framed from the stage's own resize.
        stage.onResize = () => this.handleResize();
        // When slow frames make the stage lower its quality, the menu follows.
        stage.onQuality = (quality) => this.store.set((state) => ({ settings: { ...state.settings, quality } }));
        stage.onHover = (id) => this.overlay.hoverTag(id);
        this.world.places.chain.onSlot = (slot) => {
            this.store.set({ slot });
            if (this.started && slot % 2 === 0) this.audio.play('block', { volume: 0.35 });
        };

        this.populate();
        this.syncWorld(true);
        this.showTitle();
    }

    get settings(): Settings {
        return this.store.get().settings;
    }

    get places(): World['places'] {
        return this.world.places;
    }

    // ----- Setting the scene -----

    /** The people who live in town all day. */
    private populate(): void {
        const { places, world } = this;
        // Facing the road, a little toward where visitors stand.
        this.keeper = world.person('keeper', 'gatekeeper', places.gate.anchors.keeper, -0.25);
        world.person('issuer', 'issuer', SPOTS.issuerDoor, 0.5);
        world.person('officer', 'officer', places.bureau.anchors.door.clone().setY(0), Math.PI / 2 - 0.4);
        world.person(
            'ringer',
            'bellRinger',
            places.exchange.anchors.door
                .clone()
                .setY(0)
                .add(new THREE.Vector3(0.9, 0, 0.2)),
            0.5,
        );
        world.person(
            'bot:indexer',
            'indexerBot',
            places.indexer.anchors.door
                .clone()
                .setY(0)
                .add(new THREE.Vector3(-0.2, 0, 0.3)),
            0.8,
        );
        world.person(
            'bot:archive',
            'archiveBot',
            places.archive.anchors.door
                .clone()
                .setY(0)
                .add(new THREE.Vector3(0.2, 0, 0.3)),
            0.5,
        );
        world.person(
            'bot:poster',
            'posterBot',
            places.haltBoard.anchors.door
                .clone()
                .setY(0)
                .add(new THREE.Vector3(-0.9, 0, 0.5)),
            0.9,
        );
        const steps = places.council.anchors.steps;
        (['emergency', 'operations', 'structural', 'upgrade'] as const).forEach((role, i) => {
            world.person(
                `signer:${role}`,
                role,
                new THREE.Vector3(steps.x - 1.8 + i * 1.2, 0, steps.z + 0.5 + (i % 2) * 0.35),
                0.4,
            );
        });
    }

    /** Makes the town show the venue's state. `snap` skips the animations. */
    syncWorld(snap = false): void {
        const venue = this.venue;
        const { pool, gate, exchange, haltBoard } = this.places;
        pool.setStage(venue.pool.status, snap);
        pool.setVaultFrozen(!venue.pool.vaultThawed, snap);
        pool.setVaults(venue.pool.vaultTsa, venue.pool.usdc, venue.pool.tsa);
        this.syncBoard();
        gate.setPolicy(venue.policy?.version ?? 0);
        gate.setPaused(venue.swapsPaused);
        exchange.setStatus(venue.market.status);
        this.syncTicker();
        haltBoard.setState(venue.market.evidenceFresh ? venue.market.record : 'unknown');
        haltBoard.setFreshness(venue.market.evidenceFresh ? 1 : 0);
        this.touch();
    }

    /** Redraws the exchange's ticker: the simulated price and its band, or the halt. */
    syncTicker(): void {
        const { market, now } = this.venue;
        const { exchange } = this.places;
        if (market.status === 'halted') {
            exchange.setTicker('TSA HALTED', `${market.haltCode ?? 'LUDP'} · trading pause`);
            return;
        }
        const width = bandWidth(now);
        exchange.setTicker(
            `TSA ${money(market.price)}`,
            `band ${money(market.price * (1 - width))} – ${money(market.price * (1 + width))}`,
        );
    }

    /** Redraws the pool's price board from the venue. */
    syncBoard(): void {
        const venue = this.venue;
        const { pool } = this.places;
        if (venue.pool.status !== 'open') {
            pool.setBoard('NOT FUNDED', 'two empty vaults', 'idle');
        } else if (venue.features.reserves && venue.pool.vaultTsa < venue.pool.tsa - 1e-9) {
            pool.setBoard(
                'OUT OF BALANCE',
                `vault ${amount(venue.pool.vaultTsa, 1)} · books ${amount(venue.pool.tsa, 1)} TSA`,
                'alert',
            );
        } else {
            pool.setBoard(
                `1 TSA = ${money(price(venue))} USDC`,
                `${amount(venue.pool.tsa, 1)} TSA · ${amount(venue.pool.usdc, 0)} USDC`,
                'open',
            );
        }
        pool.setVaults(venue.pool.vaultTsa, venue.pool.usdc, venue.pool.tsa);
    }

    /** Tells the interface the venue changed. */
    touch(): void {
        this.places.exchange.setClock(this.venue.now);
        this.store.set((state) => ({ venue: this.venue, rev: state.rev + 1 }));
    }

    /** Points the camera at a named view. `desk` leaves room for the desk at the bottom of the screen. */
    look(view: ViewId, opts: { desk?: boolean; span?: number; snap?: boolean } = {}): void {
        const spec = VIEWS[view];
        const span = opts.span ?? (view === 'town' ? this.stage.spanToFit(24, 0.05) : spec.span);
        this.stage.look(
            { target: spec.target, span, lift: opts.desk ? this.deskLift() : view === 'town' ? 0.02 : 0.12, shift: 0 },
            opts.snap,
        );
    }

    /**
     * How far the view moves up while the desk is on screen, so that what it looks at sits in the
     * middle of the town left between the top bar and the desk. The desk's height follows the
     * stylesheet's `--desk-h`.
     */
    private deskLift(): number {
        const { width, height } = this.stage.size();
        let desk: number;
        if (height <= 480) desk = Math.min(0.78 * height, 330);
        else if (width <= 760) desk = Math.min(0.62 * height, 520);
        else if (width <= 1040) desk = Math.min(Math.max(0.48 * height, 340), 400);
        else desk = Math.min(Math.max(0.41 * height, 324), 384);
        return Math.min(Math.max((desk + 12 - 56) / height, 0.2), 0.55);
    }

    // ----- Waiting for the player -----

    /**
     * Resolves when the player triggers `name` (through `fire`), or, in
     * autoplay, after `auto` seconds with `autoValue`.
     */
    input<T = void>(name: string, auto?: number, autoValue?: T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.pending.set(name, { resolve: resolve as (value: unknown) => void, reject, auto, autoValue });
            this.armAuto(name);
        });
    }

    private armAuto(name: string): void {
        const entry = this.pending.get(name);
        if (!entry || entry.auto === undefined || !this.settings.autoplay) return;
        run(async () => {
            await this.t.wait(entry.auto ?? 0);
            if (this.pending.get(name) === entry && this.settings.autoplay) this.fire(name, entry.autoValue);
        });
    }

    /** Answers a pending `input`. Returns false when nothing was waiting for it. */
    fire(name: string, value?: unknown): boolean {
        const entry = this.pending.get(name);
        if (!entry) return false;
        this.pending.delete(name);
        entry.resolve(value);
        return true;
    }

    private cancelAll(): void {
        this.t.cancel();
        const error = new Cancelled();
        for (const entry of this.pending.values()) entry.reject(error);
        this.pending.clear();
        this.overlay.clear();
    }

    // ----- The player's controls -----

    /**
     * Starts (or restarts) the day. `chapter` jumps to a chapter by id; `tour`
     * plays the opening fly-over first. `fromLink` marks a start that no click
     * caused: browsers refuse sound then, so it waits for the first click or key.
     */
    begin(opts: { chapter?: string; tour?: boolean; autoplay?: boolean; fromLink?: boolean } = {}): void {
        if (!opts.fromLink) void this.audio.unlock().then(() => this.store.set({ sound: this.audio.unlocked }));
        this.cancelAll();
        this.resetDay();
        this.started = true;
        if (opts.autoplay !== undefined) this.patchSettings({ autoplay: opts.autoplay });
        let from = 0;
        if (opts.chapter) {
            const index = DAY_BEATS.findIndex((beat) => beat.kind === 'chapter' && beat.chapter.id === opts.chapter);
            if (index > 0) from = index;
        }
        this.fastForward(from);
        this.stage.setSway(0);
        this.overlay.showTags('none');
        run(async () => {
            if (from === 0 && opts.tour !== false) await playTour(this);
            await this.play(from);
        });
    }

    /** Back to the title screen. */
    quit(): void {
        this.cancelAll();
        this.resetDay();
        this.started = false;
        this.showTitle();
    }

    private showTitle(): void {
        this.store.set({
            phase: 'title',
            card: undefined,
            setup: undefined,
            scene: undefined,
            inspect: undefined,
            verdict: undefined,
            tour: undefined,
            info: undefined,
        });
        this.look('town', { snap: true });
        this.frameTitle();
        this.stage.setSway(this.calm ? 0 : 0.05);
        this.stage.setDaytime(0.3, true);
        this.showOpenTown();
        // The town is the picture: a place's name shows when the pointer is on it.
        this.overlay.showTags('none');
        this.audio.setMood('title');
    }

    /** Dresses the town as it looks once the venue is open, whatever the venue's state: for the title and the tour. */
    showOpenTown(): void {
        const { pool, gate } = this.places;
        pool.setStage('open', true);
        pool.setVaultFrozen(false, true);
        pool.setVaults(100, 1240, 100);
        pool.setBoard('1 TSA = 12.40 USDC', '100 TSA · 1,240 USDC', 'open');
        gate.setPolicy(1);
    }

    /** Whether the player asked their system for less motion: no camera sway then. */
    private get calm(): boolean {
        return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /** Stops everything and releases what the game holds, when the page lets go of it. */
    dispose(): void {
        this.cancelAll();
        this.overlay.dispose();
        this.audio.dispose();
    }

    /** The stage changed size: the title's framing depends on it. */
    handleResize(): void {
        if (this.store.get().phase === 'title') this.frameTitle();
    }

    /** Frames the island beside the title card, which covers the left of a wide screen. */
    private frameTitle(): void {
        const { width, height } = this.stage.size();
        const card = width > 900 ? 520 : 0;
        const free = Math.max(width - card, 320);
        // The island's diamond is 24·√2 wide; leave a little air around it.
        const span = Math.max(this.stage.spanToFit(24, 0.06), (24 * Math.SQRT2 * 1.1 * height) / free);
        this.stage.look({ shift: card / width, span, lift: width > 900 ? 0.02 : 0.3 }, true);
    }

    /** Hands over the stamp that was waiting for the gatekeeper to finish a sentence, if any. */
    private takeStamp(): { approve: boolean; reason?: ReasonId } | undefined {
        const stamp = this.queuedStamp;
        this.queuedStamp = undefined;
        return stamp;
    }

    /** The papers this visitor can be asked for that are not on the desk yet. */
    private missingPapers(): Paper[] {
        const state = this.store.get();
        if (state.phase !== 'inspect' || !state.inspect || state.verdict) return [];
        const { shown, case: def } = state.inspect;
        return papersFor(def.request).filter((paper) => !shown[paper]);
    }

    /** Asks the visitor for a paper. While another is being handed over, the request waits its turn. */
    ask(paper: Paper): void {
        if (!this.missingPapers().includes(paper)) return;
        if (this.fire('desk', { kind: 'ask', papers: [paper] })) return;
        if (!this.wanted.includes(paper)) this.wanted.push(paper);
    }

    /** "Papers, please": asks for every paper not on the desk yet. False when there is nothing to ask for. */
    askAll(): boolean {
        const missing = this.missingPapers();
        if (missing.length === 0) return false;
        if (!this.fire('desk', { kind: 'ask', papers: missing })) {
            for (const paper of missing) if (!this.wanted.includes(paper)) this.wanted.push(paper);
        }
        return true;
    }

    /**
     * Stamps the decision: approve, or refuse citing a finding. Refusing early can be right (a halt
     * needs no papers); approving papers nobody read never is, so that waits until all are down.
     * Returns whether the stamp came down.
     */
    decide(approve: boolean, reason?: ReasonId): boolean {
        const state = this.store.get();
        if (state.phase !== 'inspect' || !state.inspect || state.verdict) return false;
        if (approve && this.missingPapers().length > 0) return false;
        // Mid-sentence, the stamp waits a moment: no click is lost.
        if (!this.fire('desk', { kind: 'decide', approve, reason })) this.queuedStamp = { approve, reason };
        return true;
    }

    /** Moves on: closes a chapter card, a setup result or a verdict. */
    next(): void {
        this.audio.play('click');
        if (this.fire('continue')) return;
        // The verdict is out but the visitor is still walking off: hurry that along, then move on.
        const state = this.store.get();
        if (state.phase === 'judging' && state.verdict?.revealed) {
            this.nextQueued = true;
            this.skip();
        }
    }

    /** True while the game waits for the player to move on, or can take that request already. */
    get awaitingNext(): boolean {
        if (this.pending.has('continue')) return true;
        const state = this.store.get();
        return state.phase === 'judging' && state.verdict?.revealed === true;
    }

    /** Space or Enter: moves on when the game waits for that, else hurries the moment that is playing. */
    advance(): boolean {
        if (this.awaitingNext) {
            this.next();
            return true;
        }
        const phase = this.store.get().phase;
        if (phase === 'judging' || phase === 'arrive') {
            this.skip();
            return true;
        }
        return false;
    }

    /** A click anywhere: lines being spoken finish at once. */
    hurry(): void {
        this.overlay.hurry();
    }

    showHint(): void {
        const inspect = this.store.get().inspect;
        if (inspect) this.store.set({ inspect: { ...inspect, hint: true } });
    }

    /** Fast-forwards the scripted moment that is playing. */
    skip(): void {
        const state = this.store.get();
        const phase = state.phase;
        if (phase !== 'scene' && phase !== 'tour' && phase !== 'judging' && phase !== 'arrive') return;
        // A scene that has finished has nothing left to skip.
        if (phase === 'scene' && !state.scene) return;
        if (this.speedBeforeSkip === undefined) {
            this.speedBeforeSkip = this.stage.timeScale;
            this.stage.timeScale = 9;
            this.store.set({ skipping: true });
        }
    }

    /** Ends a fast-forward; the director calls it when a scripted moment is over. */
    endSkip(): void {
        if (this.speedBeforeSkip !== undefined) {
            this.stage.timeScale = this.settings.speed;
            this.speedBeforeSkip = undefined;
            this.store.set({ skipping: false });
        }
    }

    clickPlace(id: PlaceId): void {
        const state = this.store.get();
        // During setup, clicking the place the step points at performs the step.
        if (
            state.phase === 'setup' &&
            state.setup &&
            !state.setup.busy &&
            !state.setup.done &&
            state.setup.step.site === id
        ) {
            if (this.fire('setup')) return;
        }
        // While a visitor is at the desk a click on the town only hurries the talk: a place's card
        // would cover the findings and the rulebook the player is reading.
        if (state.inspect || state.verdict || state.phase === 'arrive') return;
        this.audio.play('click');
        this.store.set({ info: state.info === id ? undefined : id });
    }

    closeInfo(): void {
        this.store.set({ info: undefined });
    }

    patchSettings(patch: Partial<Settings>): void {
        const before = this.settings;
        const settings = { ...before, ...patch };
        this.store.set({ settings });
        if (patch.speed !== undefined && this.speedBeforeSkip === undefined) this.stage.timeScale = settings.speed;
        if (patch.muted !== undefined) this.audio.setMuted(settings.muted);
        if (patch.quality !== undefined) this.stage.setQuality(settings.quality, true);
        if (patch.autoplay && !before.autoplay) for (const name of this.pending.keys()) this.armAuto(name);
    }

    cycleSpeed(): void {
        const index = SPEEDS.indexOf(this.settings.speed);
        this.patchSettings({ speed: SPEEDS[(index + 1) % SPEEDS.length] as number });
    }

    // ----- The day -----

    private resetDay(): void {
        this.venue = openingVenue();
        this.leaving.clear();
        this.askedKyc = false;
        this.wanted = [];
        this.nextQueued = false;
        this.queuedStamp = undefined;
        this.endSkip();
        for (const id of Object.keys(CAST)) this.world.dismiss(id);
        const { gate, council, archive, indexer } = this.places;
        gate.setBarrier(false);
        for (let step = 1; step <= 5; step += 1) gate.setLamp(step, 'idle');
        for (const role of ['emergency', 'operations', 'structural', 'upgrade'] as const) {
            council.setVotes(role, 0, 3);
            council.setTimeLock(role, 0);
        }
        archive.setCount(0);
        indexer.setFeed([]);
        gate.reset();
        this.world.fx.setFireflies(0);
        // Whatever a scene left behind: tokens in flight, a crane in the air, a slumped robot.
        this.world.fx.clear();
        for (const crane of this.world.cranes) crane.group.visible = false;
        for (const person of this.world.everyone().values()) person.setMood('neutral').act('idle').lookAt(undefined);
        this.store.set({
            beat: 0,
            chapter: undefined,
            card: undefined,
            setup: undefined,
            scene: undefined,
            inspect: undefined,
            verdict: undefined,
            tour: undefined,
            info: undefined,
            score: { correct: 0, partial: 0, wrong: 0, streak: 0, best: 0, points: 0 },
            ledger: [],
            cases: 0,
        });
        this.syncWorld(true);
    }

    /** Replays the day silently up to a beat, as the pool decides it, so a chapter can be entered directly. */
    private fastForward(until: number): void {
        let cases = 0;
        let chapter: ChapterDef | undefined;
        const ledger: LedgerEntry[] = [];
        for (let i = 0; i < until; i += 1) {
            const beat = DAY_BEATS[i] as Beat;
            if (beat.kind === 'scene' && beat.scene.id === 'rush') {
                // The morning rush fills two deposits of its own.
                for (const item of RUSH) {
                    this.venue.now = item.time;
                    const truth = judge(this.venue, item.request);
                    ledger.push(this.entry(item.id, item.request, truth, ledger.length));
                    settle(this.venue, item.request, truth.quote);
                }
                beat.scene.apply(this.venue);
                continue;
            }
            applyBeat(this.venue, beat);
            if (beat.kind === 'chapter') chapter = beat.chapter;
            if (beat.kind === 'case') {
                cases += 1;
                const truth = judge(this.venue, beat.case.request);
                ledger.push(this.entry(beat.case.id, beat.case.request, truth, ledger.length));
                if (truth.outcome === 'fill') settle(this.venue, beat.case.request, truth.quote);
            }
        }
        this.store.set({ cases, chapter, ledger });
        if (chapter) this.stage.setDaytime(chapter.daytime, true);
        this.syncWorld(true);
        this.syncRecords();
    }

    private async play(from: number): Promise<void> {
        for (let i = from; i < DAY_BEATS.length; i += 1) {
            const beat = DAY_BEATS[i] as Beat;
            this.store.set({ beat: i });
            switch (beat.kind) {
                case 'chapter':
                    await this.playChapter(beat.chapter, beat);
                    break;
                case 'setup':
                    await this.playSetup(beat.step, beat);
                    break;
                case 'scene':
                    await this.runScene(beat.scene);
                    break;
                case 'case':
                    await this.playCase(beat.case, i);
                    break;
            }
        }
        await this.playSummary();
    }

    private async playChapter(chapter: ChapterDef, beat: Beat): Promise<void> {
        this.endSkip();
        applyBeat(this.venue, beat);
        // After the fly-over showed the finished town, the prologue starts from the empty lot again.
        this.syncWorld(true);
        this.look('town');
        this.stage.setDaytime(chapter.daytime);
        this.world.fx.setFireflies(chapter.daytime > 0.75 ? 3 : 0);
        this.audio.setMood(chapter.music);
        this.audio.play('chapter');
        this.store.set({
            phase: 'chapter',
            card: chapter,
            chapter,
            setup: undefined,
            scene: undefined,
            inspect: undefined,
            verdict: undefined,
        });
        await this.input('continue', 4.2);
        this.store.set({ card: undefined });
        await this.t.wait(0.35);
    }

    private async playSetup(step: SetupStep, beat: Beat): Promise<void> {
        const steps: Beat[] = DAY_BEATS.filter((item) => item.kind === 'setup');
        const index = steps.indexOf(beat);
        this.endSkip();
        this.store.set({ phase: 'setup', setup: { step, index, total: steps.length, busy: false, done: false } });
        await playSetupStep(this, step, () => {
            applyBeat(this.venue, beat);
            this.syncWorld();
        });
        this.overlay.clearAction();
        this.store.set((state) => ({
            setup: state.setup ? { ...state.setup, busy: false, done: true, error: undefined } : undefined,
        }));
        await this.input('continue', 3);
    }

    private async runScene(scene: SceneDef): Promise<void> {
        this.store.set({
            phase: 'scene',
            scene: { scene, caption: scene.captions[0] ?? '', index: 0 },
            inspect: undefined,
            verdict: undefined,
            setup: undefined,
        });
        let applied = false;
        // The scene's own effect on the venue; a scene that fills trades settles them itself.
        const apply = (): void => {
            if (applied) return;
            applied = true;
            scene.apply(this.venue);
            this.touch();
        };
        await playScene(this, scene, apply);
        apply();
        this.syncBoard();
        // Clear the scene before the pause, so its Skip button cannot start a skip that nothing ends.
        this.store.set({ scene: undefined });
        this.endSkip();
        await this.t.wait(0.5);
    }

    /** Shows one of the current scene's narration lines and waits long enough to read it. */
    async caption(index: number, extra = 0): Promise<void> {
        const state = this.store.get().scene;
        if (!state) return;
        const caption = state.scene.captions[index] ?? '';
        this.store.set({ scene: { ...state, caption, index } });
        await this.t.wait(1.1 + caption.split(' ').length * 0.21 + extra);
    }

    // ----- A visitor at the gate -----

    /** The visitor's character, walking in from the edge of the island if they are not in town. */
    visitor(id: WalletId): Character {
        // Someone on their way out who is wanted again stays in town.
        this.leaving.delete(id);
        return this.world.person(id, CAST[id].look as LookId, SPOTS.spawn, Math.PI / 2);
    }

    /** Walks a visitor out of town along `path` and removes them on arrival, unless they are called back first. */
    sendOff(id: WalletId, path: ReadonlyArray<V3>, speed = 2.6): void {
        const person = this.world.find(id);
        if (!person) return;
        const ticket = (this.tickets += 1);
        this.leaving.set(id, ticket);
        run(async () => {
            await this.t.guard(person.walkTo(path, speed));
            if (this.leaving.get(id) !== ticket) return;
            this.leaving.delete(id);
            this.world.dismiss(id);
        });
    }

    /** Lines up the next visitors behind the window. */
    private fillQueue(fromBeat: number, current: WalletId): void {
        const next: WalletId[] = [];
        const busy = new Set<WalletId>([current]);
        for (let i = fromBeat + 1; i < DAY_BEATS.length && next.length < 2; i += 1) {
            const beat = DAY_BEATS[i] as Beat;
            if (beat.kind === 'chapter') break;
            // A scripted scene moves its own cast; do not park anyone in the queue across one.
            if (beat.kind === 'scene') break;
            if (beat.kind === 'case') {
                const who = beat.case.request.signer;
                if (!busy.has(who) && !next.includes(who)) next.push(who);
            }
        }
        next.forEach((id, slot) => {
            const person = this.visitor(id);
            person.setMood('neutral').act('idle');
            void person.walkTo([queueSpot(slot)], 2.2).then(() => person.turn(Math.PI / 2));
        });
    }

    private async playCase(def: CaseDef, beatIndex: number): Promise<void> {
        const { gate } = this.places;
        const request = def.request;
        const who = request.signer;
        const cast = CAST[who];
        const wallet = this.venue.wallets[who];
        const number = this.store.get().cases + 1;
        applyBeat(this.venue, DAY_BEATS[beatIndex] as Beat);
        this.syncTicker();
        this.touch();

        // Arrive.
        this.store.set({
            phase: 'arrive',
            inspect: undefined,
            verdict: undefined,
            scene: undefined,
            setup: undefined,
            info: undefined,
            cases: number,
        });
        this.look('gate', { desk: true });
        for (let step = 1; step <= 5; step += 1) gate.setLamp(step, 'idle');
        gate.setBarrier(false);
        this.wanted = [];
        this.nextQueued = false;
        this.queuedStamp = undefined;
        const person = this.visitor(who);
        person.setMood('neutral').act('idle').lookAt(undefined);
        this.fillQueue(beatIndex, who);
        await this.t.guard(person.walkTo([SPOTS.window], 2.6));
        // Turned three-quarters to the camera, eyes on the gatekeeper.
        person.turn(WINDOW_FACING);
        const keeper = this.keeper;
        if (keeper) person.lookAt(keeper.headTop());
        keeper?.lookAt(person.headTop());
        this.audio.play('step');
        this.endSkip();
        this.store.set({
            phase: 'inspect',
            inspect: {
                case: def,
                number,
                shown: { account: false, kyc: false, authority: false },
                busy: false,
                hint: false,
                tutorial: number === 1,
            },
        });
        this.audio.play('paper');
        // The desk opens at once: the greeting plays while the player starts asking.
        run(() => this.speak(person, 'visitor', def.greeting, cast.pitch, wallet.name));
        const greeted = this.stage.time + def.greeting.length / 46 + 1;

        // Inspect: the player asks for papers, then stamps.
        const truth = judge(this.venue, request);
        const papers = papersFor(request);
        let decision: { approve: boolean; reason?: ReasonId } | undefined;
        // Autoplay's stamps are the pool's own answers: they are shown, not scored.
        let automatic = false;
        while (!decision) {
            const shown = this.store.get().inspect?.shown;
            const missing = papers.filter((paper) => !shown?.[paper]);
            const stamped = this.takeStamp();
            if (stamped && !(stamped.approve && missing.length > 0)) {
                decision = stamped;
                continue;
            }
            // Papers asked for while the last one was being handed over come next, without a new click.
            const queued = this.wanted.filter((paper) => missing.includes(paper));
            this.wanted = [];
            if (queued.length > 0) {
                await this.askFor(queued, person, def);
                continue;
            }
            const auto =
                missing.length > 0
                    ? { kind: 'ask' as const, papers: [missing[0] as Paper] }
                    : { kind: 'decide' as const, approve: truth.outcome === 'fill', reason: truth.reason };
            // Autoplay lets the visitor finish the greeting before it asks.
            const pause = missing.length > 0 ? Math.max(0.7, greeted - this.stage.time) : 1.6;
            const action = await this.input<
                { kind: 'ask'; papers: Paper[] } | { kind: 'decide'; approve: boolean; reason?: ReasonId }
            >('desk', pause, auto);
            if (action.kind === 'ask') {
                await this.askFor(
                    action.papers.filter((paper) => missing.includes(paper)),
                    person,
                    def,
                );
            } else {
                decision = { approve: action.approve, reason: action.reason };
                automatic = action === auto;
            }
        }

        // Stamp. Papers the gatekeeper never asked for land on the desk now: the pool reads them all,
        // and its finding has a line to be shown on.
        const unread = papers.filter((paper) => !this.store.get().inspect?.shown[paper]);
        if (unread.length > 0) this.audio.play('paper');
        this.patchInspect({ busy: true, shown: { account: true, kyc: true, authority: true } });
        this.overlay.hush();
        const grade = this.grade(decision, truth);
        const stamp = { approved: decision.approve, cited: decision.reason };
        this.keeper?.act('stamp');
        await this.t.wait(0.38);
        this.audio.play(decision.approve ? 'stampApprove' : 'stampRefuse');
        this.world.fx.burst(gate.anchors.counter, 'stamp');
        const lamps: LampState[] = ['idle', 'idle', 'idle', 'idle', 'idle'];
        this.store.set({
            phase: 'judging',
            verdict: {
                case: def,
                number,
                approved: decision.approve,
                cited: decision.reason,
                truth,
                grade,
                points: 0,
                automatic,
                lamps: [...lamps],
                revealed: false,
            },
        });
        await this.t.wait(0.6);

        // The gate runs the pool's checks, with the camera close on its five lanterns.
        person.lookAt(undefined);
        this.look('lanterns', { desk: true });
        await this.t.guard(person.walkTo([SPOTS.barrier], 3.1));
        person.turn(Math.PI / 2);
        for (let step = 1; step <= 5; step += 1) {
            const lamp = stepLamp(truth, step);
            if (lamp !== 'off' && lamp !== 'skip' && lamp !== 'na') {
                gate.setLamp(step, 'run');
                lamps[step - 1] = 'run';
                this.patchVerdict({ lamps: [...lamps] });
                this.audio.play('tick', { pitch: 0.9 + step * 0.06 });
                await this.t.wait(0.38);
            }
            gate.setLamp(step, lamp);
            lamps[step - 1] = lamp;
            this.patchVerdict({ lamps: [...lamps] });
            if (lamp === 'pass' || lamp === 'open') this.audio.play('ping', { pitch: 0.9 + step * 0.08, volume: 0.6 });
            if (lamp === 'fail') break;
            await this.t.wait(lamp === 'off' || lamp === 'na' ? 0.08 : 0.16);
        }
        // Steps after a refusal are never reached.
        for (let step = 1; step <= 5; step += 1) {
            if (lamps[step - 1] === 'idle') {
                lamps[step - 1] = stepLamp(truth, step);
                gate.setLamp(step, lamps[step - 1] as LampState);
            }
        }
        // The score moves only now, when the gate has shown what the pool decided.
        const points = automatic ? 0 : this.award(grade);
        this.patchVerdict({ lamps: [...lamps], revealed: true, points });
        this.audio.play(grade === 'correct' ? 'correct' : grade === 'partial' ? 'ping' : 'wrong');

        // The record runs alongside; if the day is restarted meanwhile it simply stops.
        run(() => this.record(def.id, request, truth, automatic ? undefined : { grade, ...stamp }));
        if (truth.outcome === 'fill') {
            gate.showVerdict('fill', settledWord(request.op).toUpperCase());
            gate.setBarrier(true);
            this.audio.play('gate');
            person.setMood('happy').act('cheer');
            await this.t.wait(0.5);
            // Pull back to follow the visitor to the pool.
            this.look('settle', { desk: true });
            run(() => this.speak(person, 'visitor', def.say.filled, cast.pitch, wallet.name));
            await this.t.guard(person.walkTo([SPOTS.pastGate, SPOTS.poolRim], 2.6));
            person.face_(this.places.pool.anchors.water);
            await this.settleFx(request, truth.quote, person);
            settle(this.venue, request, truth.quote);
            this.syncBoard();
            this.touch();
            gate.setBarrier(false);
            this.sendOff(who, [SPOTS.exitStart, SPOTS.exitEnd]);
        } else {
            const reason = truth.reason ? reasonDef(truth.reason) : undefined;
            gate.showVerdict('refuse', reason?.code ? String(reason.code) : 'REFUSED');
            person.setMood('sad').act('slump');
            this.overlay.float(person.headTop(), reason?.code ? `${reason.code}` : 'Refused', 'bad');
            await this.t.wait(0.4);
            run(() => this.speak(person, 'visitor', def.say.refused, cast.pitch, wallet.name));
            await this.t.wait(0.6);
        }
        this.endSkip();
        this.store.set({ phase: 'verdict' });
        // A click on "next" during the settle already asked to move on.
        if (this.nextQueued) this.nextQueued = false;
        else await this.input('continue', truth.outcome === 'fill' ? 3.6 : 4.2);

        // Leave.
        this.overlay.hush();
        if (truth.outcome === 'refuse') {
            person.act('idle');
            // Jordan stays in town: the bureau is the next stop.
            if (def.id === 'jordan-first') {
                void person.walkTo([[-9.3, 0, 4.9]], 2.2);
            } else {
                this.sendOff(who, [[-9, 0, 5.1], SPOTS.spawn], 2.4);
            }
        }
        for (let step = 1; step <= 5; step += 1) gate.setLamp(step, 'idle');
        this.keeper?.lookAt(undefined);
        this.store.set({ inspect: undefined, verdict: undefined });
        await this.t.wait(0.3);
    }

    private patchInspect(patch: Partial<NonNullable<GameState['inspect']>>): void {
        this.store.set((state) => ({ inspect: state.inspect ? { ...state.inspect, ...patch } : undefined }));
    }

    private patchVerdict(patch: Partial<NonNullable<GameState['verdict']>>): void {
        this.store.set((state) => ({ verdict: state.verdict ? { ...state.verdict, ...patch } : undefined }));
    }

    /**
     * One line of dialogue in a bubble over a character. `hold` is how long the finished line stays
     * before the script moves on; by default long enough to read it.
     */
    speak(
        person: Character,
        speaker: 'keeper' | 'visitor' | 'npc',
        text: string,
        pitch = 1,
        name?: string,
        hold?: number,
    ): Promise<void> {
        person.setTalking(true);
        const said = this.overlay.say(
            speaker === 'keeper' ? 'keeper' : `say:${name ?? 'npc'}`,
            () => person.headTop(),
            text,
            { speaker, pitch, name, hold },
        );
        return this.t.guard(said).finally(() => person.setTalking(false));
    }

    /** The gatekeeper asks for one paper, or for several at once; the visitor answers as they land. */
    private async askFor(papers: Paper[], person: Character, def: CaseDef): Promise<void> {
        const first = papers[0];
        if (first === undefined) return;
        const keeper = this.keeper;
        const who = def.request.signer;
        this.patchInspect({ busy: true });
        const lines: Record<Paper, string[]> = {
            account: ['Your stock account, please.', 'Stock account, please.', 'Let me see the account.'],
            kyc: ['Show me your KYC.', 'Credential, please.', 'Your KYC credential, please.'],
            authority: ['You sign for someone else. Show me their approval.'],
        };
        let line =
            papers.length > 1
                ? 'Papers, please.'
                : ((lines[first] as string[])[this.store.get().cases % lines[first].length] as string);
        if (papers.includes('kyc') && !this.askedKyc) {
            line =
                papers.length > 1
                    ? 'Entrance is restricted. Papers, please.'
                    : 'Entrance is restricted. Show me your KYC.';
            this.askedKyc = true;
        }
        this.audio.play('ask');
        // The desk waits for the gatekeeper's short line only, not for the answer.
        if (keeper) await this.speak(keeper, 'keeper', line, 0.85, 'Gatekeeper', 0.25);
        const reply = first === 'authority' ? (def.say.authority ?? 'Here.') : def.say[first];
        person.act('nod');
        run(() => this.speak(person, 'visitor', reply, CAST[who].pitch, this.venue.wallets[who].name));
        for (const paper of papers) {
            this.audio.play('paper');
            this.store.set((state) => ({
                inspect: state.inspect
                    ? { ...state.inspect, shown: { ...state.inspect.shown, [paper]: true } }
                    : undefined,
            }));
            if (papers.length > 1) await this.t.wait(0.16);
        }
        this.patchInspect({ busy: false });
    }

    private grade(decision: { approve: boolean; reason?: ReasonId }, truth: Verdict): Grade {
        if (truth.outcome === 'fill') return decision.approve ? 'correct' : 'wrong';
        if (decision.approve) return 'wrong';
        return decision.reason === truth.reason ? 'correct' : 'partial';
    }

    private award(grade: Grade): number {
        const score = { ...this.store.get().score };
        let points = 0;
        if (grade === 'correct') {
            score.correct += 1;
            score.streak += 1;
            score.best = Math.max(score.best, score.streak);
            points = 100 + Math.min(score.streak - 1, 5) * 10;
        } else if (grade === 'partial') {
            score.partial += 1;
            score.streak = 0;
            points = 40;
        } else {
            score.wrong += 1;
            score.streak = 0;
        }
        score.points += points;
        this.store.set({ score });
        return points;
    }

    // ----- The record: chain, indexer, archive -----

    private entry(
        id: string,
        request: TradeRequest,
        truth: Verdict | undefined,
        slot: number,
        judged?: { grade: Grade; approved: boolean; cited?: ReasonId },
    ): LedgerEntry {
        const venue = this.venue;
        const who = venue.wallets[request.signer].name;
        const chapter = this.store.get().chapter;
        const verdict = truth ?? judge(venue, request);
        const q = verdict.quote;
        let summary: string;
        if (verdict.outcome === 'refuse') {
            const reason = verdict.reason ? reasonDef(verdict.reason) : undefined;
            summary = reason?.title ?? 'Refused';
        } else if (request.op === 'buy') summary = `Bought ${amount(q.tsa)} TSA for ${amount(-q.usdc)} USDC`;
        else if (request.op === 'sell') summary = `Sold ${amount(-q.tsa)} TSA for ${amount(q.usdc)} USDC`;
        else if (request.op === 'deposit') summary = `Added ${amount(-q.tsa)} TSA + ${amount(-q.usdc)} USDC`;
        else summary = `Withdrew ${amount(q.tsa)} TSA + ${amount(q.usdc)} USDC`;
        return {
            id,
            time: venue.now,
            who,
            request,
            outcome: verdict.outcome,
            reason: verdict.reason,
            code: verdict.code,
            summary,
            grade: judged?.grade,
            stamp: judged ? { approved: judged.approved, cited: judged.cited } : undefined,
            chapter: chapter ? { id: chapter.id, number: chapter.number } : undefined,
            slot,
            shares: Math.abs(q.tsa),
            dollars: Math.abs(q.usdc),
        };
    }

    /** Puts a decision on chain and lets the indexer and the archive pick it up. `judged` is the player's own stamp, if they made one. */
    async record(
        id: string,
        request: TradeRequest,
        truth: Verdict,
        judged?: { grade: Grade; approved: boolean; cited?: ReasonId },
    ): Promise<void> {
        const { chain, gate, indexer, archive } = this.places;
        const kind = truth.outcome === 'fill' ? 'fill' : 'refusal';
        // Written before the animation, so the summary sees every decision even if the player races ahead.
        const entry = this.entry(id, request, truth, chain.slot(), judged);
        this.store.set((state) => ({ ledger: [...state.ledger, entry] }));
        await this.t.guard(
            this.world.fx.fly(kind, gate.anchors.plaque, () => chain.openBlock(), {
                duration: 1.25,
                height: 3.2,
                trail: truth.outcome === 'fill' ? '#bff5d5' : '#ffe2a8',
            }),
        );
        chain.load(kind);
        this.audio.play('pop');
        await this.t.wait(0.5);
        indexer.ping();
        this.audio.play('ping', { volume: 0.5 });
        this.world.fx.stream(chain.anchors.dock, indexer.anchors.dish, '#ffe08a', 0.9, 1.8);
        void this.t
            .guard(
                this.world.fx.fly('scroll', chain.anchors.dock, archive.anchors.slot, { duration: 1.1, height: 2.2 }),
            )
            .then(
                () => {
                    archive.file();
                    this.syncRecords();
                },
                () => {},
            );
        await this.t.wait(0.7);
        this.syncRecords();
    }

    /** Redraws the public feed and the archive's counter from the ledger. */
    syncRecords(): void {
        const ledger = this.store.get().ledger;
        const { indexer, archive } = this.places;
        archive.setCount(ledger.length);
        // Only fills reach the public feed: swaps that settled. Refusals and liquidity moves stay with the indexer and the archive.
        indexer.setFeed(
            ledger
                .filter(
                    (entry) => entry.outcome === 'fill' && (entry.request.op === 'buy' || entry.request.op === 'sell'),
                )
                .slice(-4)
                .reverse()
                .map((entry) => ({ text: `${clock(entry.time)} ${feedLine(entry)}`, tone: 'fill' as const })),
        );
    }

    /** Tokens flying between the visitor, the pond and the vaults for a filled trade. */
    async settleFx(request: TradeRequest, fill: Quote, person: Character): Promise<void> {
        const { pool } = this.places;
        const fx = this.world.fx;
        const hands = (): THREE.Vector3 => person.hands();
        const water = pool.anchors.water;
        const plop = (): void => {
            pool.splash();
            fx.burst(water, 'splash');
            this.audio.play('splash');
        };
        switch (request.op) {
            case 'buy':
                await this.t.guard(fx.fly('usdc', hands, water, { duration: 0.7 }));
                plop();
                this.audio.play('coin');
                await this.t.guard(
                    fx.fly('stock', pool.anchors.stockVault, hands, { duration: 0.8, trail: '#ffd3df' }),
                );
                this.overlay.float(person.headTop(), `+${amount(fill.tsa)} TSA`, 'good');
                break;
            case 'sell':
                await this.t.guard(fx.fly('stock', hands, water, { duration: 0.7 }));
                plop();
                await this.t.guard(fx.fly('usdc', pool.anchors.usdcVault, hands, { duration: 0.8, trail: '#cfe3ff' }));
                this.audio.play('coin');
                this.overlay.float(person.headTop(), `+${amount(fill.usdc)} USDC`, 'good');
                break;
            case 'deposit':
                await Promise.all([
                    this.t.guard(fx.fly('stock', hands, water, { duration: 0.7 })),
                    this.t.guard(fx.fly('usdc', hands, water, { duration: 0.85 })),
                ]);
                plop();
                await this.t.guard(fx.fly('lp', water, hands, { duration: 0.7, trail: '#ffe08a' }));
                this.overlay.float(person.headTop(), `+${amount(fill.lp)} LP`, 'gold');
                break;
            case 'withdraw':
                await this.t.guard(fx.fly('lp', hands, water, { duration: 0.6 }));
                plop();
                await Promise.all([
                    this.t.guard(fx.fly('stock', pool.anchors.stockVault, hands, { duration: 0.8, trail: '#ffd3df' })),
                    this.t.guard(fx.fly('usdc', pool.anchors.usdcVault, hands, { duration: 0.95, trail: '#cfe3ff' })),
                ]);
                this.audio.play('coin');
                this.overlay.float(person.headTop(), `+${amount(fill.tsa)} TSA  +${amount(fill.usdc)} USDC`, 'good');
                break;
        }
        this.world.fx.burst(person.headTop(), 'sparkle', 8);
    }

    private async playSummary(): Promise<void> {
        this.endSkip();
        this.store.set({
            phase: 'summary',
            inspect: undefined,
            verdict: undefined,
            scene: undefined,
            setup: undefined,
        });
        this.look('town');
        this.stage.setSway(this.calm ? 0 : 0.05);
        this.overlay.showTags('none');
        this.audio.setMood('finale');
        this.audio.play('fanfare');
        for (let i = 0; i < 5; i += 1) {
            this.world.fx.burst(
                new THREE.Vector3((Math.random() - 0.5) * 14, 5 + Math.random() * 3, (Math.random() - 0.5) * 14),
                'confetti',
            );
            await this.t.wait(0.5);
        }
    }
}

/** The papers a visitor carries: an approval too when they sign for someone else. */
function papersFor(request: TradeRequest): Paper[] {
    return request.signer !== request.owner ? ['account', 'kyc', 'authority'] : ['account', 'kyc'];
}

/** How a visitor stands at the booth: mostly toward the gate, a little toward the window. */
const WINDOW_FACING = Math.PI / 2 + 0.3;

/** The public feed's line for a fill: the side, the shares and the dollars. */
function feedLine(entry: LedgerEntry): string {
    return `${entry.request.op === 'buy' ? 'BUY' : 'SELL'} ${amount(entry.shares)} TSA $${money(entry.dollars)}`;
}
