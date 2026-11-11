/**
 * The music's composer. It makes no sound: it writes the notes of one
 * eight-bar section at a time, from each mood's hand-written motifs.
 *
 * A section is four two-bar phrases over a cycle of four chords. In each
 * phrase the lead calls in the first bar and the counter line answers in
 * the second. The phrases follow the form A A' B A: the theme, the theme
 * again over the next chord with a new ending, a contrasting line a little
 * higher, and the theme closing. The same section number always gives the
 * same notes, so a mood has a tune of its own, and later sections vary it.
 */
import type { MusicMood } from './audio.ts';
import { seeded } from './synth.ts';

export const STEPS_PER_BAR = 16;
export const STEPS_PER_PHRASE = 32;
export const PHRASES_PER_SECTION = 4;
export const STEPS_PER_SECTION = STEPS_PER_PHRASE * PHRASES_PER_SECTION;

/** The instruments a note can be for. */
export type Part = 'lead' | 'double' | 'counter' | 'arp' | 'bass' | 'pad' | 'block' | 'shaker' | 'drum' | 'bells';

/** One note of the score. */
export interface Note {
    part: Part;
    /** Sixteenth notes from the start of the section. */
    step: number;
    /** Length in sixteenth notes. */
    len: number;
    /** MIDI note number; for percussion, 0 is the low sound and 1 the high one. */
    midi: number;
    /** Loudness, 0..1. */
    vel: number;
    /** Slide up into the note. */
    scoop?: boolean;
}

/** The timbre of the lead line. */
export type LeadVoice = 'koto' | 'bell';
/** The timbre of the counter line. */
export type CounterVoice = 'marimba' | 'musicbox' | 'koto';

/** One chord of the cycle. */
interface Chord {
    /** The bass note, in semitones above the tonic's pitch class. */
    root: number;
    /** The pad's notes, in semitones from the tonic. */
    pad: number[];
    /** The scale degrees (0..4) a phrase may rest on over this chord, most restful first. */
    stable: number[];
}

/** A motif: `[step, degree]` pairs, degrees counted in scale steps from the phrase's anchor. */
type Motif = Array<[number, number]>;

/** Percussion hits in a phrase: `[part, step, loudness, low 0 or high 1]`. */
type Hit = ['block' | 'shaker' | 'drum' | 'bells', number, number, number];

/** Everything that makes a mood. */
export interface MoodSpec {
    bpm: number;
    /** The tonic as a MIDI note; degree 0 of the scale. */
    tonic: number;
    /** A five-note scale, in semitones above the tonic. */
    scale: number[];
    /** Four chords, two bars each. */
    chords: Chord[];
    /** The lead: its timbre, the scale degree its phrases start near, and its lowest and highest degree. */
    lead: { voice: LeadVoice; centre: number; low: number; high: number; level: number; bright: number };
    /** The counter line; it stays within an octave of its centre. */
    counter: { voice: CounterVoice; centre: number; level: number };
    /** The lead's motifs; the first two are the mood's main theme and its contrast. */
    calls: string[];
    /** The counter line's answers. */
    responses: string[];
    /** How the bass moves: `[step, length, 0 root or 1 fifth]` within a phrase. */
    bass: Array<[number, number, number]>;
    /** Levels of the instrument groups. */
    levels: { pad: number; bass: number; perc: number };
    /** Percussion, the same every phrase. */
    perc: Hit[];
    /** Doubles the lead an octave up on a music box. */
    double?: boolean;
    /** Adds a quiet eighth-note figure on the chord. */
    arp?: boolean;
    /** How often an accented note slides up into pitch, 0..1. */
    scoops: number;
    /** How often the lead leaves a phrase to the others, 0..1. */
    rests: number;
    /** The mood's overall level, so that all moods are about as loud. */
    gain: number;
}

/** The yo scale, the major pentatonic: bright and open. */
const YO = [0, 2, 4, 7, 9];
/** The hirajoshi scale: two semitone steps give it its shadow. */
const HIRAJOSHI = [0, 2, 3, 7, 8];

function motif(text: string): Motif {
    return text.split(' ').map((pair) => {
        const [step, degree] = pair.split(':');
        return [Number(step), Number(degree)];
    });
}

const D = 62;
const E = 64;
const G = 67;

/** The moods. Keys are neighbours, so one mood fades into the next without a clash. */
export const MOODS: Record<MusicMood, MoodSpec> = {
    // D major pentatonic over D, G, D, A: slow, a few notes and room around them.
    title: {
        bpm: 76,
        tonic: D,
        scale: YO,
        chords: [
            { root: 0, pad: [-12, -5, 4], stable: [0, 3, 2] },
            { root: 5, pad: [-7, -3, 2], stable: [4, 0] },
            { root: 0, pad: [-12, -5, 4], stable: [0, 3, 2] },
            { root: 7, pad: [-5, 2, 7], stable: [3, 1] },
        ],
        lead: { voice: 'koto', centre: 5, low: 1, high: 10, level: 0.8, bright: 0.5 },
        counter: { voice: 'musicbox', centre: 9, level: 0.42 },
        calls: [
            '0:0 4:2 8:3 14:2 16:1',
            '0:3 6:2 8:1 16:0',
            '0:0 8:1 12:2 16:3',
            '2:2 4:3 8:5 16:3',
            '0:1 4:0 8:-2 16:0',
        ],
        responses: ['22:3 24:2 28:0', '20:0 24:2 28:3', '24:1 26:2 28:0', '22:2 28:0'],
        bass: [[0, 28, 0]],
        levels: { pad: 1, bass: 0.7, perc: 0 },
        perc: [],
        scoops: 0.3,
        rests: 0.12,
        gain: 1,
    },
    // D major pentatonic over D, A, Bm, G: a rising theme, a marimba answering, a shaker.
    morning: {
        bpm: 88,
        tonic: D,
        scale: YO,
        chords: [
            { root: 0, pad: [-12, -5, 4], stable: [0, 2, 3] },
            { root: 7, pad: [-5, 2, 9], stable: [3, 1] },
            { root: 9, pad: [-3, 0, 4], stable: [4, 0, 2] },
            { root: 5, pad: [-7, -3, 2], stable: [4, 0] },
        ],
        lead: { voice: 'koto', centre: 5, low: 1, high: 11, level: 0.8, bright: 0.7 },
        counter: { voice: 'marimba', centre: 4, level: 0.6 },
        calls: [
            '0:0 4:1 6:2 8:3 12:2 16:0',
            '0:3 3:2 4:3 8:5 12:4 16:3',
            '0:0 2:1 4:2 8:2 10:3 12:4 16:3',
            '0:5 4:4 6:3 8:2 12:3 16:2',
            '0:2 4:3 6:4 8:3 10:2 12:1 16:0',
        ],
        responses: ['20:2 22:1 24:0', '20:0 22:1 24:2 28:3', '22:3 24:2 26:1 28:0', '20:3 24:2 28:0'],
        bass: [
            [0, 14, 0],
            [16, 12, 1],
        ],
        levels: { pad: 0.8, bass: 0.8, perc: 0.7 },
        perc: [
            ['shaker', 2, 0.5, 0],
            ['shaker', 6, 0.65, 0],
            ['shaker', 10, 0.5, 0],
            ['shaker', 14, 0.7, 0],
            ['shaker', 18, 0.5, 0],
            ['shaker', 22, 0.65, 0],
            ['shaker', 26, 0.5, 0],
            ['shaker', 30, 0.7, 0],
            ['block', 28, 0.5, 1],
        ],
        scoops: 0.25,
        rests: 0,
        gain: 1,
    },
    // G major pentatonic over G, Em, C, D: busier lines, a walking bass, wood block and shaker.
    day: {
        bpm: 96,
        tonic: G,
        scale: YO,
        chords: [
            { root: 0, pad: [-12, -5, 4], stable: [0, 2, 3] },
            { root: 9, pad: [-15, -8, 0], stable: [4, 0, 2] },
            { root: 5, pad: [-7, -3, 0], stable: [4, 0] },
            { root: 7, pad: [-5, 2, 7], stable: [3, 1] },
        ],
        lead: { voice: 'koto', centre: 3, low: -1, high: 9, level: 0.8, bright: 0.75 },
        counter: { voice: 'marimba', centre: 1, level: 0.6 },
        calls: [
            '0:0 2:1 4:2 6:1 8:2 10:3 12:4 16:3',
            '0:2 2:3 4:2 6:1 8:0 12:1 14:2 16:3',
            '0:0 3:0 6:1 8:2 10:1 12:2 14:3 16:2',
            '0:4 2:3 4:2 6:3 8:2 10:1 12:0 16:1',
            '0:0 2:2 4:1 6:3 8:2 12:4 14:3 16:2',
        ],
        responses: ['20:2 22:3 24:2 26:1 28:0', '20:0 22:1 24:2 28:1', '22:4 24:3 26:2 28:0', '20:3 22:2 24:0 28:2'],
        bass: [
            [0, 6, 0],
            [10, 4, 1],
            [16, 6, 0],
            [24, 4, 1],
            [28, 3, 0],
        ],
        levels: { pad: 0.7, bass: 0.85, perc: 0.9 },
        perc: [
            ['shaker', 2, 0.6, 0],
            ['shaker', 4, 0.3, 0],
            ['shaker', 6, 0.7, 0],
            ['shaker', 10, 0.6, 0],
            ['shaker', 12, 0.3, 0],
            ['shaker', 14, 0.7, 0],
            ['shaker', 18, 0.6, 0],
            ['shaker', 20, 0.3, 0],
            ['shaker', 22, 0.7, 0],
            ['shaker', 26, 0.6, 0],
            ['shaker', 28, 0.3, 0],
            ['shaker', 30, 0.7, 0],
            ['shaker', 31, 0.3, 0],
            ['block', 4, 0.6, 0],
            ['block', 12, 0.6, 0],
            ['block', 20, 0.6, 0],
            ['block', 27, 0.45, 1],
            ['block', 28, 0.6, 0],
        ],
        scoops: 0.2,
        rests: 0,
        gain: 0.92,
    },
    // E hirajoshi over Em, C, Em, B: low koto, a low marimba, a slow drum like a heartbeat.
    tense: {
        bpm: 80,
        tonic: E,
        scale: HIRAJOSHI,
        chords: [
            { root: 0, pad: [-12, -5, 3], stable: [0, 3, 2] },
            { root: 8, pad: [-16, -9, 0], stable: [4, 0, 2] },
            { root: 0, pad: [-12, -5, 3], stable: [0, 3, 2] },
            { root: 7, pad: [-17, -10, -5], stable: [3, 1] },
        ],
        lead: { voice: 'koto', centre: 0, low: -5, high: 4, level: 1.15, bright: 0.38 },
        counter: { voice: 'marimba', centre: -3, level: 0.62 },
        calls: [
            '0:0 4:1 6:2 8:1 16:0',
            '0:3 4:4 8:3 12:2 16:0',
            '0:0 6:-1 8:-2 12:-1 16:0',
            '0:2 3:1 4:0 8:-2 16:-1',
            '0:0 8:2 10:3 12:4 16:3',
        ],
        responses: ['22:2 24:1 28:0', '20:0 24:-1 28:-2', '24:1 28:0', '20:-2 24:-1 28:0'],
        bass: [[0, 30, 0]],
        levels: { pad: 0.9, bass: 0.75, perc: 1.1 },
        perc: [
            ['drum', 0, 0.9, 0],
            ['drum', 8, 0.55, 0],
            ['drum', 16, 0.85, 0],
            ['drum', 24, 0.55, 0],
            ['drum', 30, 0.3, 0],
            ['block', 28, 0.35, 0],
        ],
        scoops: 0.45,
        rests: 0,
        gain: 1,
    },
    // The day's notes leaning on E minor, over C, G, Em, D: falling lines, slower, softer.
    dusk: {
        bpm: 80,
        tonic: G,
        scale: YO,
        chords: [
            { root: 5, pad: [-7, -3, 0], stable: [4, 0] },
            { root: 0, pad: [-12, -5, 4], stable: [0, 2, 3] },
            { root: 9, pad: [-15, -8, 0], stable: [4, 0, 2] },
            { root: 7, pad: [-17, -10, -3], stable: [3, 1] },
        ],
        lead: { voice: 'koto', centre: 2, low: -2, high: 7, level: 0.75, bright: 0.42 },
        counter: { voice: 'marimba', centre: 0, level: 0.55 },
        calls: [
            '0:2 4:1 6:0 8:1 16:0',
            '0:0 6:1 8:2 12:1 16:-1',
            '0:3 4:2 8:1 10:2 12:1 16:0',
            '2:0 4:1 8:3 12:2 16:1',
            '0:4 6:3 8:2 14:1 16:0',
        ],
        responses: ['22:1 24:0 28:-2', '20:2 24:1 28:0', '24:0 26:1 28:0', '22:3 26:2 28:0'],
        bass: [
            [0, 14, 0],
            [16, 12, 0],
        ],
        levels: { pad: 1, bass: 0.85, perc: 0.9 },
        perc: [
            ['shaker', 4, 0.5, 0],
            ['shaker', 12, 0.6, 0],
            ['shaker', 20, 0.5, 0],
            ['shaker', 28, 0.6, 0],
            ['block', 30, 0.3, 0],
        ],
        scoops: 0.35,
        rests: 0.1,
        gain: 1,
    },
    // The same notes resting on D: bells far apart, a soft koto answering, a long pad.
    night: {
        bpm: 76,
        tonic: G,
        scale: YO,
        chords: [
            { root: 7, pad: [-17, -10, -3], stable: [3, 1] },
            { root: 0, pad: [-12, -5, 2], stable: [0, 3] },
            { root: 9, pad: [-15, -8, 0], stable: [4, 2, 0] },
            { root: 7, pad: [-17, -10, -3], stable: [3, 1] },
        ],
        lead: { voice: 'bell', centre: 6, low: 2, high: 11, level: 0.4, bright: 0.5 },
        counter: { voice: 'koto', centre: 2, level: 0.65 },
        calls: ['0:0 8:2 16:1', '4:0 8:-1 16:0', '0:0 12:1 16:3', '0:3 8:0 16:1', '0:2 6:1 16:0'],
        responses: ['24:0 28:2', '22:1 28:0', '20:2 24:0', '28:0'],
        bass: [[0, 30, 0]],
        levels: { pad: 1.1, bass: 0.6, perc: 0 },
        perc: [],
        scoops: 0,
        rests: 0.2,
        gain: 1.1,
    },
    // D major pentatonic over D, Bm, G, A: the full band, the lead doubled, bells on the downbeats.
    finale: {
        bpm: 96,
        tonic: D,
        scale: YO,
        chords: [
            { root: 0, pad: [-12, -5, 4], stable: [0, 2, 3] },
            { root: 9, pad: [-3, 0, 4], stable: [4, 0, 2] },
            { root: 5, pad: [-7, -3, 2], stable: [4, 0] },
            { root: 7, pad: [-5, 2, 9], stable: [3, 1] },
        ],
        lead: { voice: 'koto', centre: 5, low: 1, high: 11, level: 0.8, bright: 0.8 },
        counter: { voice: 'marimba', centre: 4, level: 0.6 },
        calls: [
            '0:0 2:2 4:3 8:5 10:4 12:3 14:4 16:5',
            '0:5 2:4 4:3 6:4 8:5 12:7 16:5',
            '0:0 3:1 6:2 8:3 10:2 12:3 14:4 16:5',
            '0:3 2:4 4:5 8:4 10:3 12:2 16:3',
            '0:2 4:3 6:2 8:5 12:4 14:3 16:2',
        ],
        responses: [
            '20:5 22:4 24:3 26:2 28:0',
            '20:0 22:2 24:3 26:4 28:5',
            '20:3 22:4 24:5 28:3',
            '22:2 24:3 26:2 28:0',
        ],
        bass: [
            [0, 6, 0],
            [6, 2, 0],
            [8, 6, 1],
            [16, 6, 0],
            [24, 4, 1],
            [28, 3, 0],
        ],
        levels: { pad: 0.8, bass: 0.9, perc: 1 },
        perc: [
            ['drum', 0, 0.8, 0],
            ['drum', 10, 0.5, 0],
            ['drum', 16, 0.75, 0],
            ['drum', 26, 0.5, 0],
            ['shaker', 2, 0.6, 0],
            ['shaker', 3, 0.3, 0],
            ['shaker', 6, 0.7, 0],
            ['shaker', 10, 0.6, 0],
            ['shaker', 11, 0.3, 0],
            ['shaker', 14, 0.7, 0],
            ['shaker', 18, 0.6, 0],
            ['shaker', 19, 0.3, 0],
            ['shaker', 22, 0.7, 0],
            ['shaker', 26, 0.6, 0],
            ['shaker', 27, 0.3, 0],
            ['shaker', 30, 0.7, 0],
            ['block', 4, 0.65, 0],
            ['block', 7, 0.4, 1],
            ['block', 12, 0.65, 0],
            ['block', 20, 0.65, 0],
            ['block', 28, 0.65, 0],
            ['block', 30, 0.45, 1],
            ['bells', 0, 0.6, 0],
        ],
        double: true,
        arp: true,
        scoops: 0.2,
        rests: 0,
        gain: 0.85,
    },
};

/** The mood's names, in the order of a venue day. */
export const MOOD_NAMES = Object.keys(MOODS) as MusicMood[];

function modulo(value: number, size: number): number {
    return ((value % size) + size) % size;
}

/** The MIDI note of a scale degree; degree 5 is the tonic an octave up. */
export function degreeToMidi(spec: MoodSpec, degree: number): number {
    const size = spec.scale.length;
    const octave = Math.floor(degree / size);
    return spec.tonic + 12 * octave + (spec.scale[degree - octave * size] ?? 0);
}

/** The nearest degree the chord lets a phrase rest on. */
function settle(degree: number, stable: number[], size: number, reach: number = 2): number {
    for (const offset of [0, -1, 1, -2, 2]) {
        if (Math.abs(offset) > reach) break;
        if (stable.includes(modulo(degree + offset, size))) return degree + offset;
    }
    return degree;
}

/** Moves a degree by octaves until it is within `reach` of the centre. */
function fold(degree: number, centre: number, reach: number, size: number): number {
    let folded = degree;
    while (folded > centre + reach) folded -= size;
    while (folded < centre - reach) folded += size;
    return folded;
}

/** How loud a note is from where it falls in the bar: downbeats lead, off-beats follow. */
function accent(step: number): number {
    const inBar = modulo(step, STEPS_PER_BAR);
    if (inBar === 0) return 1;
    if (inBar === 8) return 0.88;
    if (inBar % 4 === 0) return 0.8;
    if (inBar % 2 === 0) return 0.7;
    return 0.6;
}

/** The bass note for a pitch class, kept between the low E and the E above it. */
function bassMidi(pitchClass: number): number {
    let midi = 36 + modulo(pitchClass, 12);
    while (midi < 40) midi += 12;
    while (midi >= 52) midi -= 12;
    return midi;
}

/** How a motif is varied when it is placed. */
type Turn = 'plain' | 'tail' | 'close' | 'home';

/**
 * Places a motif on a chord and returns its notes as `[step, degree]`. The
 * motif starts from the chord note nearest `centre`; if it then climbs above
 * `high` or falls below `low`, the whole line moves an octave, so its shape
 * is kept.
 */
function place(
    spec: MoodSpec,
    shape: Motif,
    chord: Chord,
    centre: number,
    low: number,
    high: number,
    turn: Turn,
    random: () => number,
): Motif {
    const size = spec.scale.length;
    const anchor = settle(centre, chord.stable, size);
    const home = [chord.stable[0] ?? 0];
    let notes: Motif = shape.map(([step, degree]) => [step, anchor + degree]);
    if (turn === 'tail' && notes.length > 2) {
        // The same theme with a new ending: the note before last moves a step.
        const index = notes.length - 2;
        const [step, degree] = notes[index] ?? [0, anchor];
        notes[index] = [step, degree + (random() < 0.5 ? 1 : -1)];
    }
    if (turn === 'close') {
        // The theme's first half, then home to the chord's most restful note.
        notes = notes.filter(([step]) => step <= 12);
        notes.push([16, settle(anchor, home, size)]);
    }
    const first = notes[0];
    if (first && first[0] === 0) first[1] = settle(first[1], chord.stable, size, 1);
    const last = notes[notes.length - 1];
    if (last) last[1] = settle(last[1], turn === 'home' ? home : chord.stable, size);
    const degrees = notes.map(([, degree]) => degree);
    let shift = 0;
    while (Math.max(...degrees) + shift > high) shift -= size;
    while (Math.min(...degrees) + shift < low) shift += size;
    return notes.map(([step, degree]) => [step, degree + shift]);
}

/** Writes the notes of section `index` of a mood, sorted by time. */
export function composeSection(mood: MusicMood, index: number): Note[] {
    const spec = MOODS[mood];
    const size = spec.scale.length;
    let hash = 2166136261;
    for (const letter of mood) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
    const random = seeded(hash + index * 977);
    const notes: Note[] = [];

    // The theme lasts two sections, then the next motif takes over; the
    // contrast changes every section.
    const theme = Math.floor(index / 2);
    const calls = spec.calls.map(motif);
    const responses = spec.responses.map(motif);
    const callA = calls[theme % calls.length] ?? [];
    const callB = calls[(theme + 1 + (index % 2) * 2) % calls.length] ?? callA;
    const answerA = responses[theme % responses.length] ?? [];
    const answerB = responses[(theme + 1 + (index % 2)) % responses.length] ?? answerA;
    // Every fourth section the lead sits out the first half and the counter
    // line carries the theme alone.
    const interlude = index % 4 === 3;
    // The first section builds up: percussion joins from the second phrase.
    const opening = index === 0;

    for (let phrase = 0; phrase < PHRASES_PER_SECTION; phrase++) {
        const start = phrase * STEPS_PER_PHRASE;
        const chord = spec.chords[phrase % spec.chords.length];
        if (!chord) continue;
        const contrast = phrase === 2;
        const turn: Turn = phrase === 1 ? 'tail' : phrase === 3 ? 'close' : 'plain';
        const lift = contrast ? 2 : 0;
        const resting = !opening && phrase !== 3 && random() < spec.rests;
        const leadPlays = !(interlude && phrase < 2) && !resting;

        const { lead, counter } = spec;
        const call = place(
            spec,
            contrast ? callB : callA,
            chord,
            lead.centre + lift,
            lead.low,
            lead.high,
            turn,
            random,
        );
        const answer = place(
            spec,
            contrast ? answerB : answerA,
            chord,
            counter.centre + lift,
            counter.centre - 5,
            counter.centre + 6,
            phrase === 3 ? 'home' : 'plain',
            random,
        );

        if (leadPlays) {
            call.forEach(([step, degree], position) => {
                const next = call[position + 1];
                const len = Math.min(8, next ? next[0] - step : 8);
                const midi = degreeToMidi(spec, degree);
                const strong = step % 8 === 0 && position > 0;
                const vel = accent(step) * (0.9 + random() * 0.14);
                const scoop = strong && random() < spec.scoops;
                notes.push({ part: 'lead', step: start + step, len, midi, vel, scoop });
                if (spec.double)
                    notes.push({ part: 'double', step: start + step, len, midi: midi + 12, vel: vel * 0.7 });
            });
        } else {
            // The counter line carries the theme, quietly, in its own register.
            const solo = place(
                spec,
                callA,
                chord,
                counter.centre,
                counter.centre - 5,
                counter.centre + 6,
                turn,
                random,
            );
            for (const [step, degree] of solo) {
                notes.push({
                    part: 'counter',
                    step: start + step,
                    len: 4,
                    midi: degreeToMidi(spec, degree),
                    vel: accent(step) * 0.8,
                });
            }
        }

        // The answer. In the closing phrase only its last two notes are left, landing on the chord.
        const answered = phrase === 3 ? answer.slice(-2) : answer;
        for (const [step, degree] of answered) {
            if (step < 16) continue;
            notes.push({
                part: 'counter',
                step: start + step,
                len: 4,
                midi: degreeToMidi(spec, degree),
                vel: accent(step) * (0.8 + random() * 0.14),
            });
        }

        const root = bassMidi(spec.tonic + chord.root);
        for (const [step, len, fifth] of spec.bass) {
            let midi = root + (fifth ? 7 : 0);
            if (midi >= 55) midi -= 12;
            notes.push({ part: 'bass', step: start + step, len, midi, vel: step === 0 ? 1 : 0.8 });
        }
        for (const offset of chord.pad) {
            notes.push({ part: 'pad', step: start, len: STEPS_PER_PHRASE, midi: spec.tonic + offset, vel: 1 });
        }

        if (spec.arp) {
            // Eighth notes up and down the chord, under everything.
            const tones = chord.stable.length > 2 ? chord.stable : [...chord.stable, chord.stable[0] ?? 0];
            const figure = [0, 1, 2, 1];
            for (let step = 0; step < STEPS_PER_PHRASE; step += 2) {
                const degree = tones[figure[(step / 2) % figure.length] ?? 0] ?? 0;
                const midi = degreeToMidi(spec, fold(degree, spec.lead.centre - 3, 2, size));
                notes.push({ part: 'arp', step: start + step, len: 2, midi, vel: step % 8 === 0 ? 0.7 : 0.5 });
            }
        }

        if (!(opening && phrase === 0)) {
            for (const [part, step, vel, variant] of spec.perc) {
                // Bells only greet the theme and the contrast.
                if (part === 'bells' && phrase % 2 === 1) continue;
                // While the counter line plays alone, only the drum keeps time.
                if (interlude && phrase < 2 && part !== 'drum') continue;
                notes.push({ part, step: start + step, len: 1, midi: variant, vel: vel * (0.9 + random() * 0.2) });
            }
        }
    }

    return notes.sort((a, b) => a.step - b.step);
}
