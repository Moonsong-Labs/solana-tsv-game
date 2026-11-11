/**
 * The game's state as the interface sees it. The director (`game.ts`) is the
 * only writer.
 */
import type { CaseDef, ChapterDef, SceneDef, SetupStep } from '../sim/campaign.ts';
import type { ReasonId, TradeRequest, Venue, Verdict } from '../sim/types.ts';
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
    | 'summary';

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

export interface GameState {
    phase: Phase;
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
