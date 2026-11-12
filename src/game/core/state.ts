/**
 * The game's state as the interface sees it. The director (`game.ts`) is the
 * only writer.
 */
import type { ActionArgs, ActionId, Site } from '../sim/actions.ts';
import type { CaseDef, ChapterDef, SceneDef, SetupStep } from '../sim/campaign.ts';
import type { Park, StockId } from '../sim/park.ts';
import type { ScenarioDef } from '../sim/scenarios.ts';
import type { Availability, ReasonId, TradeRequest, Venue, Verdict } from '../sim/types.ts';
import type { Quality } from '../scene/stage.ts';
import type { LampState } from '../world/gate.ts';
import type { PlaceId } from '../world/world.ts';

export type Phase =
    | 'loading'
    | 'title'
    /** The opening fly-over that introduces the town. */
    | 'tour'
    /** A chapter card is up. */
    | 'chapter'
    /** The player builds the venue, one click per step. */
    | 'setup'
    /** A scripted event plays. */
    | 'scene'
    /** A visitor walks up to the window. */
    | 'arrive'
    /** The player inspects papers and decides. */
    | 'inspect'
    /** The gate runs the pool's checks on the visitor. */
    | 'judging'
    /** The outcome is on screen, waiting for the player to move on. */
    | 'verdict'
    | 'summary'
    /** Manager mode: the scenario's briefing card is up. */
    | 'briefing'
    /** Manager mode: the player runs the venue, building by building. */
    | 'manage'
    /** Manager mode: the scenario is over and its result card is up. */
    | 'debrief';

/** Which game is being played: the gatekeeper's day, or running the venue. */
export type Mode = 'gate' | 'manager';

/** A paper the gatekeeper can ask a visitor for. */
export type Paper = 'account' | 'kyc' | 'authority';

/** How the player's decision compares with the pool's. */
export type Grade = 'correct' | 'partial' | 'wrong';

export interface Settings {
    /** The game plays itself: asks, decides and moves on. */
    autoplay: boolean;
    /** 1, 1.6 or 2.5 times normal pace. */
    speed: number;
    muted: boolean;
    quality: Quality;
}

export interface Score {
    correct: number;
    partial: number;
    wrong: number;
    streak: number;
    best: number;
    points: number;
}

/** One decision of the day, for the feed and the summary. */
export interface LedgerEntry {
    id: string;
    time: number;
    /** The visitor's name. */
    who: string;
    request: TradeRequest;
    outcome: 'fill' | 'refuse';
    reason?: ReasonId;
    code?: number;
    /** What moved, or why it was refused, in a few words. */
    summary: string;
    /** Missing for trades the game filled itself in a scripted scene. */
    grade?: Grade;
    /** What the player stamped, when they judged this one. */
    stamp?: { approved: boolean; cited?: ReasonId };
    /** The chapter the decision fell in, to replay it from. */
    chapter?: { id: string; number: number };
    /** The stock whose pool decided, in manager mode. The day trades TSA only. */
    stock?: StockId;
    slot: number;
    /** The stock and the dollars the request moves (or would have moved). */
    shares: number;
    dollars: number;
}

export interface SetupState {
    step: SetupStep;
    index: number;
    total: number;
    /** The step's animation is playing. */
    busy: boolean;
    /** The step is complete and its result is on screen. */
    done: boolean;
    /** A wrong move's message. */
    error?: string;
}

export interface SceneState {
    scene: SceneDef;
    caption: string;
    index: number;
}

export interface InspectState {
    case: CaseDef;
    /** 1-based position among the day's visitors. */
    number: number;
    shown: Record<Paper, boolean>;
    /** A question is being asked and answered; the desk waits. */
    busy: boolean;
    hint: boolean;
    /** The first visitor comes with step-by-step guidance. */
    tutorial: boolean;
}

export interface VerdictState {
    case: CaseDef;
    number: number;
    /** What the player stamped. */
    approved: boolean;
    cited?: ReasonId;
    /** What the pool decided. */
    truth: Verdict;
    grade: Grade;
    points: number;
    /** Autoplay stamped this one: shown, not scored. */
    automatic: boolean;
    /** The lantern of each step, as revealed so far (index 0 is step 1). */
    lamps: LampState[];
    /** The gate has finished and the outcome may be shown in full. */
    revealed: boolean;
}

export interface TourState {
    caption: string;
    index: number;
    total: number;
}

/** One line of the manager's log: what was done, refused or traded, and when. */
export interface ManagerLogEntry {
    id: number;
    time: number;
    text: string;
    tone: 'action' | 'refused' | 'fill' | 'refuse' | 'event' | 'hint';
    availability?: Availability | 'mock';
}

/** What the interface shows for one objective, as the pool would decide it right now. */
export interface ObjectiveView {
    id: string;
    label: string;
    /** A guard rail: it held at the start and must keep holding. */
    keep: boolean;
    kind: 'trade' | 'state';
    stock?: StockId;
    request?: TradeRequest;
    expect?: 'fill' | 'refuse';
    met: boolean;
    /** For a trade: what the pool decides now. */
    outcome?: 'fill' | 'refuse';
    reason?: ReasonId;
    /** The refusal code, or a note when the venue has none (pool error 6000, a pause). */
    code?: number;
    codeNote?: string;
}

/** A trade walking through the gate in manager mode: a test the player sent, or an objective. */
export interface ProbeState {
    /** The objective it tests, if any. */
    objective?: string;
    label: string;
    stock: StockId;
    request: TradeRequest;
    truth: Verdict;
    /** The lantern of each step, as revealed so far (index 0 is step 1). */
    lamps: LampState[];
    /** The gate has finished: the outcome may be shown in full. */
    revealed: boolean;
    /** For an objective: what it should do, and whether it did. */
    expect?: 'fill' | 'refuse';
    met?: boolean;
}

/** Where a menu opens: on one action's last step ("Show me"), or on a new trade ("Compose a trade"). */
export type MenuFocus = { action: ActionId; args: ActionArgs } | { trade: true };

/** An action the player asked for, while it plays out in town. */
export interface PendingAction {
    action: ActionId;
    args: ActionArgs;
    /** The button's label when it was pressed: the venue it describes changes while the action plays. */
    label: string;
}

export interface ManagerResult {
    /** 1 to 3: solved; within par; no guard rail ever broken. 0 for a run the game played itself. */
    stars: number;
    /** The game played its own solution ("Show me"): shown, not scored. */
    watched: boolean;
    actions: number;
    par: number;
    /** A guard rail broke at some point, even if it was put right later. */
    slipped: boolean;
    hints: number;
    /** The venue clock when it was solved. */
    time: number;
}

export interface ManagerState {
    scenario: ScenarioDef;
    /** The venue being run. The director mutates it in place and bumps `rev`. */
    park: Park;
    /**
     * The building whose menu is open. Pools are one site, told apart by their stock. `focus` opens the
     * menu further in: on one action's last step, as "Show me" does before it plays that action, or on a
     * new trade.
     */
    menu?: { place: PlaceId; stock?: StockId; focus?: MenuFocus };
    /** The stock that per-pool menus (gate, council, issuer) show. */
    stock: StockId;
    objectives: ObjectiveView[];
    /** Actions taken so far; refused ones do not count. */
    actions: number;
    slipped: boolean;
    /** Hints revealed so far. */
    hints: number;
    log: ManagerLogEntry[];
    /** Why the last action could not be done, until the next one. */
    error?: { action: ActionId; text: string };
    /** An action is playing out. */
    acting?: PendingAction;
    /** A trade is walking through the gate. */
    probe?: ProbeState;
    /** Every objective holds. */
    solved: boolean;
    /** The final run through the gate is playing. */
    finishing: boolean;
    /** The game is playing its own solution ("Show me"): the player watches. */
    watched?: boolean;
    result?: ManagerResult;
}

export interface GameState {
    phase: Phase;
    mode: Mode;
    /** Manager mode's state; absent during the gatekeeper's day. */
    manager?: ManagerState;
    /** Index into the day's beats. */
    beat: number;
    chapter?: ChapterDef;
    /** The chapter card on screen. */
    card?: ChapterDef;
    setup?: SetupState;
    scene?: SceneState;
    inspect?: InspectState;
    verdict?: VerdictState;
    tour?: TourState;
    venue: Venue;
    /** Bumped whenever the venue changes, so the interface re-reads it. */
    rev: number;
    score: Score;
    ledger: LedgerEntry[];
    /** Visitors seen so far. */
    cases: number;
    settings: Settings;
    /** The place whose card is open. */
    info?: PlaceId;
    /** The slot of the block at the dock. */
    slot: number;
    /** A scripted moment is being fast-forwarded. */
    skipping: boolean;
    /** Sound has been unlocked by a click. */
    sound: boolean;
}
