/**
 * Every sound effect, as a recipe over the building blocks in `synth.ts`.
 * The palette is a warm wooden toy box: knocks on wood, paper, a plucked
 * string and small bells, all in D major pentatonic so that effects ring in
 * tune with each other and with the music.
 */
import type { SfxName, SfxOptions } from './audio.ts';
import { busOf, duckMusic, type Mixer } from './mix.ts';
import {
    chime,
    finish,
    hiss,
    hz,
    knock,
    mallet,
    openVoice,
    ping,
    pluck,
    thump,
    tone,
    type Bus,
    type Voice,
} from './synth.ts';

/** How one effect is made and mixed. */
interface Recipe {
    /** The effect's level in the mix; the loudness order of the effects is set here. */
    level: number;
    /** How much of it goes to the reverb, 0..1. */
    reverb: number;
    /** Dips the music to `depth` for `hold` seconds while it plays. */
    duck?: { depth: number; hold: number };
    /** Adds the effect's parts to a voice. */
    build(v: Voice): void;
}

// The notes the effects use, by name.
const D3 = hz(50);
const G3 = hz(55);
const A3 = hz(57);
const D4 = hz(62);
const Fs4 = hz(66);
const A4 = hz(69);
const B4 = hz(71);
const D5 = hz(74);
const E5 = hz(76);
const Fs5 = hz(78);
const A5 = hz(81);
const B5 = hz(83);
const D6 = hz(86);
const E6 = hz(88);
const Fs6 = hz(90);
const A6 = hz(93);
const D7 = hz(98);

/** The gatekeeper's rubber stamp landing on the desk: both verdicts start with it. */
function thunk(v: Voice, at: number): void {
    ping(v, at, 170, 0.2, 0.85, { to: 52, glide: 0.07, attack: 0.001 });
    ping(v, at, 228, 0.08, 0.45, { attack: 0.001 });
    ping(v, at, 371, 0.05, 0.26, { attack: 0.001 });
    ping(v, at, 540, 0.035, 0.14, { attack: 0.001 });
    hiss(v, at, 0.055, 0.6, { filter: 'lowpass', freq: 1400, color: 'pink' });
    hiss(v, at, 0.02, 0.24, { filter: 'bandpass', freq: 1900, q: 0.9 });
}

/** A small metal disc: a coin or token. */
function disc(v: Voice, at: number, freq: number, len: number, gain: number): void {
    ping(v, at, freq, len, gain, { attack: 0.001 });
    ping(v, at, freq * 2.41, len * 0.6, gain * 0.32, { attack: 0.001 });
    ping(v, at, freq * 3.87, len * 0.35, gain * 0.14, { attack: 0.001 });
}

/** A thin, glassy tone: ice. */
function glass(v: Voice, at: number, freq: number, len: number, gain: number): void {
    ping(v, at, freq, len, gain, { attack: 0.001 });
    ping(v, at, freq * 2.02, len * 0.5, gain * 0.12, { attack: 0.001 });
}

const RECIPES: Record<SfxName, Recipe> = {
    // A soft wooden tick, for buttons.
    click: {
        level: 0.31,
        reverb: 0.03,
        build(v) {
            knock(v, 0, 980, 0.032, 0.6);
            ping(v, 0, 490, 0.05, 0.3);
        },
    },
    // The same wood, barely touched.
    hover: {
        level: 0.09,
        reverb: 0,
        build(v) {
            ping(v, 0, 1480, 0.02, 0.6, { attack: 0.003 });
            hiss(v, 0, 0.006, 0.1, { filter: 'bandpass', freq: 3000, q: 1 });
        },
    },
    // A document sliding onto the desk and settling.
    paper: {
        level: 1.1,
        reverb: 0.08,
        build(v) {
            hiss(v, 0, 0.16, 0.6, {
                filter: 'bandpass',
                freq: 3000,
                q: 0.8,
                sweep: [[0.3, 1300]],
                attack: 0.07,
                hold: 0.07,
                color: 'pink',
            });
            hiss(v, 0.02, 0.1, 0.3, {
                filter: 'bandpass',
                freq: 5200,
                q: 1.1,
                sweep: [[0.2, 3400]],
                attack: 0.05,
                hold: 0.05,
                color: 'pink',
            });
            hiss(v, 0.27, 0.05, 0.5, { filter: 'lowpass', freq: 520, color: 'pink' });
            ping(v, 0.27, 150, 0.045, 0.22);
        },
    },
    // One letter of speech: short and round. The game sets the pitch per character.
    blip: {
        level: 0.15,
        reverb: 0,
        build(v) {
            ping(v, 0, 620, 0.045, 0.7, { type: 'triangle', attack: 0.005, to: 596, glide: 0.04 });
            ping(v, 0, 1240, 0.03, 0.1, { attack: 0.005 });
        },
    },
    // "Show me your papers?": two notes, the second rising like a question.
    ask: {
        level: 0.43,
        reverb: 0.15,
        build(v) {
            ping(v, 0, D5, 0.1, 0.6, { type: 'triangle', attack: 0.005 });
            ping(v, 0, D5 * 2, 0.05, 0.1, { attack: 0.004 });
            ping(v, 0.1, 806, 0.2, 0.65, { type: 'triangle', attack: 0.006, hold: 0.03, to: 905, glide: 0.13 });
            ping(v, 0.1, 1612, 0.1, 0.09, { attack: 0.005, to: 1810, glide: 0.13 });
        },
    },
    // The stamp, then a bright little chime: approved.
    stampApprove: {
        level: 0.94,
        reverb: 0.18,
        duck: { depth: 0.6, hold: 0.5 },
        build(v) {
            thunk(v, 0);
            chime(v, 0.13, D6, 0.5, 0.2);
            chime(v, 0.21, A6, 0.65, 0.19);
        },
    },
    // The stamp, then a low soft buzz: refused, without scolding.
    stampRefuse: {
        level: 0.94,
        reverb: 0.14,
        duck: { depth: 0.6, hold: 0.5 },
        build(v) {
            thunk(v, 0);
            knock(v, 0.13, 196, 0.07, 0.3);
            tone(v, 0.13, 131, {
                type: 'sawtooth',
                gain: 0.3,
                attack: 0.012,
                hold: 0.14,
                release: 0.13,
                to: 116,
                glide: 0.28,
                cutoff: 700,
            });
            tone(v, 0.13, 262, {
                type: 'triangle',
                gain: 0.13,
                attack: 0.012,
                hold: 0.14,
                release: 0.13,
                to: 232,
                glide: 0.28,
            });
        },
    },
    // Three rising bells: the right call.
    correct: {
        level: 0.66,
        reverb: 0.28,
        build(v) {
            chime(v, 0, A5, 0.32, 0.42);
            chime(v, 0.085, D6, 0.4, 0.42);
            chime(v, 0.17, Fs6, 0.7, 0.46);
            mallet(v, 0, A4, 0.25, 0.14);
        },
    },
    // A gentle falling "uh-oh" on wood: the wrong call.
    wrong: {
        level: 0.54,
        reverb: 0.15,
        build(v) {
            ping(v, 0, A4, 0.17, 0.6, { type: 'triangle', attack: 0.008, hold: 0.03 });
            ping(v, 0, A4 * 2, 0.06, 0.07, { attack: 0.006 });
            ping(v, 0.18, Fs4, 0.3, 0.6, { type: 'triangle', attack: 0.008, hold: 0.05, to: Fs4 * 0.955, glide: 0.3 });
            ping(v, 0.18, Fs4 * 2, 0.08, 0.06, { attack: 0.006 });
        },
    },
    // A token dropping in: a bright two-note plink.
    coin: {
        level: 0.47,
        reverb: 0.2,
        build(v) {
            disc(v, 0, B5, 0.09, 0.4);
            disc(v, 0.06, E6, 0.5, 0.55);
        },
    },
    // A pebble in the pool: plop, a bubble and two drops.
    splash: {
        level: 0.58,
        reverb: 0.2,
        build(v) {
            ping(v, 0, 390, 0.05, 0.5, { to: 170, glide: 0.04 });
            ping(v, 0.035, 300, 0.11, 0.62, { to: 900, glide: 0.09, attack: 0.012 });
            hiss(v, 0.01, 0.16, 0.16, { filter: 'bandpass', freq: 2300, q: 0.8, attack: 0.02 });
            ping(v, 0.17, 1250, 0.045, 0.18, { to: 1900, glide: 0.03 });
            ping(v, 0.25, 1600, 0.04, 0.11, { to: 2300, glide: 0.03 });
        },
    },
    // An account thawing: ice cracks, then a rising shimmer.
    thaw: {
        level: 0.76,
        reverb: 0.4,
        build(v) {
            ping(v, 0, 430, 0.05, 0.3, { to: 250, glide: 0.04 });
            const cracks: Array<[number, number, number]> = [
                [0, 0.5, 3000],
                [0.045, 0.28, 3900],
                [0.075, 0.4, 2600],
                [0.135, 0.24, 3400],
                [0.165, 0.34, 2900],
                [0.245, 0.2, 3700],
            ];
            for (const [at, gain, freq] of cracks) {
                hiss(v, at, 0.016, gain, { filter: 'bandpass', freq, q: 2.5 });
                ping(v, at, freq * 0.82, 0.022, gain * 0.35, { attack: 0.001 });
            }
            [1568, A6, 2093, D7, 2637, 3136].forEach((freq, index) => glass(v, 0.3 + index * 0.055, freq, 0.5, 0.15));
        },
    },
    // An account freezing: a quick fall of glass that locks with a tink.
    freeze: {
        level: 0.63,
        reverb: 0.34,
        build(v) {
            hiss(v, 0, 0.09, 0.14, { filter: 'bandpass', freq: 1800, q: 3, sweep: [[0.15, 4800]], attack: 0.09 });
            [3136, 2637, D7, 2093, A6, 1568].forEach((freq, index) => glass(v, index * 0.028, freq, 0.12, 0.17));
            hiss(v, 0.19, 0.008, 0.25, { filter: 'bandpass', freq: 3400, q: 1.2 });
            glass(v, 0.19, 1975.5, 0.42, 0.36);
            ping(v, 0.19, 2960, 0.3, 0.13, { attack: 0.001 });
            ping(v, 0.19, E6, 0.3, 0.13, { attack: 0.001 });
        },
    },
    // The issuer's press: a wooden ratchet winding, then the plate slams down.
    press: {
        level: 0.62,
        reverb: 0.16,
        build(v) {
            [0, 0.058, 0.112, 0.162, 0.208, 0.25, 0.288].forEach((at, index) => {
                knock(v, at, 700 + index * 45, 0.02, 0.3);
                hiss(v, at, 0.01, 0.12, { filter: 'bandpass', freq: 2200, q: 1.5 });
            });
            const slam = 0.4;
            ping(v, slam, 124, 0.32, 1, { to: 40, glide: 0.09, attack: 0.001 });
            ping(v, slam, 196, 0.12, 0.4, { attack: 0.001 });
            ping(v, slam, 293, 0.09, 0.26, { attack: 0.001 });
            ping(v, slam, 452, 0.06, 0.14, { attack: 0.001 });
            hiss(v, slam, 0.09, 0.65, { filter: 'lowpass', freq: 1600, color: 'pink' });
            ping(v, slam, 1320, 0.07, 0.07, { attack: 0.001 });
            ping(v, slam + 0.005, 1870, 0.05, 0.045, { attack: 0.001 });
            knock(v, slam + 0.12, 300, 0.04, 0.12);
        },
    },
    // A seal pressed into wax: a small soft thunk, the sticky lift, a faint ring.
    seal: {
        level: 0.59,
        reverb: 0.12,
        build(v) {
            ping(v, 0, 240, 0.09, 0.75, { to: 105, glide: 0.05, attack: 0.002 });
            hiss(v, 0, 0.05, 0.42, { filter: 'lowpass', freq: 700, color: 'pink' });
            hiss(v, 0.15, 0.014, 0.13, { filter: 'bandpass', freq: 2300, q: 1.5 });
            chime(v, 0.02, A6, 0.26, 0.07);
        },
    },
    // The town's bronze bell: partials out of tune with each other, each a
    // close pair that beats slowly, and a long tail.
    bell: {
        level: 0.4,
        reverb: 0.45,
        duck: { depth: 0.5, hold: 1.6 },
        build(v) {
            const partials: Array<[number, number, number]> = [
                [0.5, 0.42, 3.5],
                [1, 1, 3.1],
                [1.183, 0.55, 2.5],
                [1.506, 0.32, 2],
                [2, 0.6, 1.8],
                [2.514, 0.3, 1.3],
                [2.662, 0.25, 1.2],
                [3.011, 0.22, 1],
                [4.166, 0.14, 0.7],
                [5.433, 0.09, 0.5],
                [6.796, 0.05, 0.35],
            ];
            partials.forEach(([ratio, gain, len], index) => {
                ping(v, 0, 220 * ratio, len, gain * 0.34, { attack: 0.004 });
                if (index < 5) ping(v, 0, 220 * ratio * 1.0045, len * 0.95, gain * 0.2, { attack: 0.004 });
            });
            // The wooden beam meeting the bronze.
            hiss(v, 0, 0.045, 0.3, { filter: 'lowpass', freq: 1400, color: 'pink' });
            ping(v, 0, 110, 0.1, 0.25, { to: 78, glide: 0.06 });
        },
    },
    // A deep gong: struck low, then the upper partials bloom and wash out.
    gong: {
        level: 0.85,
        reverb: 0.5,
        duck: { depth: 0.5, hold: 2 },
        build(v) {
            const partials: Array<[number, number, number, number]> = [
                [1, 1, 3.6, 0.015],
                [1.51, 0.62, 3.5, 0.04],
                [2.03, 0.55, 3.2, 0.09],
                [2.58, 0.45, 3, 0.15],
                [2.94, 0.4, 2.8, 0.21],
                [3.72, 0.34, 2.5, 0.28],
                [4.41, 0.3, 2.3, 0.36],
                [5.33, 0.25, 2.1, 0.43],
                [6.12, 0.2, 1.9, 0.5],
                [7.63, 0.14, 1.6, 0.56],
                [9.2, 0.1, 1.4, 0.6],
            ];
            for (const [ratio, gain, len, attack] of partials) {
                ping(v, 0, 87 * ratio, len, gain * 0.3, { attack, to: 82.4 * ratio, glide: 0.5 });
            }
            [1130, 1370, 1690, 1990, 2380, 2810].forEach((freq, index) => {
                ping(v, 0, freq, 1.8 - index * 0.12, 0.045, { attack: 0.45 + index * 0.04 });
            });
            hiss(v, 0, 1.8, 0.06, { filter: 'bandpass', freq: 2100, q: 0.6, attack: 0.55, color: 'pink' });
            hiss(v, 0, 0.07, 0.25, { filter: 'lowpass', freq: 500, color: 'pink' });
        },
    },
    // A halt: two notes a fourth apart, twice. Urgent, but a tune.
    alarm: {
        level: 0.67,
        reverb: 0.12,
        build(v) {
            [E5, B4, E5, B4].forEach((freq, index) => {
                const at = index * 0.24;
                tone(v, at, freq, { type: 'triangle', gain: 0.55, attack: 0.006, hold: 0.13, release: 0.08 });
                tone(v, at, freq, {
                    type: 'square',
                    gain: 0.07,
                    attack: 0.006,
                    hold: 0.13,
                    release: 0.08,
                    cutoff: 2400,
                });
                chime(v, at, freq * 2, 0.2, 0.09);
            });
        },
    },
    // The clock's escapement.
    tick: {
        level: 0.2,
        reverb: 0.02,
        build(v) {
            ping(v, 0, 2500, 0.012, 0.5, { attack: 0.001 });
            ping(v, 0, 1250, 0.026, 0.4, { attack: 0.001 });
            hiss(v, 0, 0.004, 0.2, { filter: 'highpass', freq: 3600 });
        },
    },
    // A soft sonar ping with two fading echoes: a message on its way.
    ping: {
        level: 0.44,
        reverb: 0.45,
        build(v) {
            ping(v, 0, 1320, 0.7, 0.55, { attack: 0.004, to: 1305, glide: 0.5 });
            ping(v, 0, 2640, 0.2, 0.04, { attack: 0.004 });
            ping(v, 0.24, 1320, 0.5, 0.16, { attack: 0.006 });
            ping(v, 0.48, 1320, 0.4, 0.06, { attack: 0.008 });
        },
    },
    // A paper crane's wings: a short run of papery flaps.
    crane: {
        level: 1.15,
        reverb: 0.1,
        build(v) {
            const flaps: Array<[number, number]> = [
                [0, 0.5],
                [0.07, 0.8],
                [0.135, 1],
                [0.2, 0.9],
                [0.27, 0.7],
                [0.345, 0.5],
                [0.43, 0.3],
            ];
            flaps.forEach(([at, gain], index) => {
                hiss(v, at, 0.05, gain, {
                    filter: 'bandpass',
                    freq: index % 2 === 0 ? 2000 : 1450,
                    q: 1.1,
                    attack: 0.014,
                    color: 'pink',
                });
                hiss(v, at + 0.005, 0.025, gain * 0.1, { filter: 'bandpass', freq: 4200, q: 1.5 });
            });
        },
    },
    // Air moving past: the camera travelling.
    whoosh: {
        level: 0.65,
        reverb: 0.12,
        build(v) {
            hiss(v, 0, 0.36, 1.2, {
                filter: 'bandpass',
                freq: 320,
                q: 1.2,
                sweep: [
                    [0.28, 1500],
                    [0.7, 480],
                ],
                attack: 0.26,
                color: 'pink',
            });
            hiss(v, 0.05, 0.3, 0.24, { filter: 'lowpass', freq: 300, attack: 0.2, color: 'pink' });
        },
    },
    // A parcel popping out: soft, with a little cardboard.
    pop: {
        level: 0.42,
        reverb: 0.06,
        build(v) {
            ping(v, 0, 760, 0.07, 0.7, { to: 240, glide: 0.05 });
            hiss(v, 0, 0.006, 0.22, { filter: 'bandpass', freq: 2600, q: 1 });
            hiss(v, 0, 0.04, 0.14, { filter: 'bandpass', freq: 700, q: 1.2, color: 'pink' });
        },
    },
    // A block passing on the railway: "ch-k" and a tiny ding. Heard every few seconds, so quiet.
    block: {
        level: 0.27,
        reverb: 0.2,
        build(v) {
            hiss(v, 0, 0.05, 0.4, { filter: 'highpass', freq: 2200, attack: 0.02, color: 'pink' });
            knock(v, 0.085, 640, 0.03, 0.55);
            chime(v, 0.1, 2093, 0.22, 0.13);
        },
    },
    // The barrier lifting: a wooden creak, a clunk at the top, a soft ding.
    gate: {
        level: 0.53,
        reverb: 0.2,
        build(v) {
            const { ctx } = v;
            // A slow sawtooth is a train of little jolts, like wood slipping
            // on wood. Two of them, unsteady and out of step, keep it from
            // sounding like a motor; narrow filters that rise as the beam
            // lifts make each jolt ring like wood.
            const body = ctx.createGain();
            body.gain.value = 1;
            const soften = ctx.createBiquadFilter();
            soften.type = 'lowpass';
            soften.frequency.value = Math.min(12000, 2600 * v.pitch);
            for (const [freq, gain] of [
                [700, 1],
                [1120, 0.6],
                [1730, 0.25],
            ] as const) {
                const ring = ctx.createBiquadFilter();
                ring.type = 'bandpass';
                ring.frequency.setValueAtTime(freq * v.pitch, v.t);
                ring.frequency.exponentialRampToValueAtTime(freq * 1.22 * v.pitch, v.t + 0.45);
                ring.Q.value = 9;
                const level = ctx.createGain();
                level.gain.value = gain;
                body.connect(ring).connect(level).connect(soften);
            }
            soften.connect(v.out);
            v.nodes.push(body, soften);
            const jolts = { type: 'sawtooth' as const, attack: 0.06, hold: 0.28, glide: 0.42, into: body };
            ping(v, 0, 29 / v.pitch, 0.12, 0.7, { ...jolts, to: 70 / v.pitch, wobble: [11, 6 / v.pitch] });
            ping(v, 0.03, 19 / v.pitch, 0.1, 0.45, {
                ...jolts,
                hold: 0.24,
                to: 47 / v.pitch,
                wobble: [6.3, 5 / v.pitch],
            });
            knock(v, 0.5, 330, 0.05, 0.42);
            ping(v, 0.5, 165, 0.08, 0.3);
            chime(v, 0.57, E6, 0.5, 0.17);
            chime(v, 0.57, A5, 0.4, 0.08);
        },
    },
    // A soft footstep on the path.
    step: {
        level: 0.45,
        reverb: 0.03,
        build(v) {
            ping(v, 0, 130, 0.06, 0.55, { to: 70, glide: 0.04 });
            ping(v, 0, 255, 0.035, 0.22, { attack: 0.002 });
            hiss(v, 0, 0.05, 0.55, { filter: 'lowpass', freq: 520, color: 'pink' });
            hiss(v, 0.006, 0.035, 0.16, { filter: 'bandpass', freq: 1400, q: 0.8, color: 'pink' });
        },
    },
    // A chapter card: a rising roll on the koto, a bell on top, a warm chord beneath.
    chapter: {
        level: 0.57,
        reverb: 0.38,
        duck: { depth: 0.5, hold: 1.1 },
        build(v) {
            pluck(v, 0, D4, 0.5, { bright: 0.55, damp: 1.7 });
            pluck(v, 0.07, A4, 0.5, { bright: 0.55, damp: 1.6 });
            pluck(v, 0.14, D5, 0.55, { bright: 0.6, damp: 1.6 });
            pluck(v, 0.21, Fs5, 0.6, { bright: 0.6, damp: 1.5 });
            pluck(v, 0.3, A5, 0.7, { bright: 0.65, damp: 1.4 });
            chime(v, 0.3, D6, 1.3, 0.16);
            chime(v, 0.3, A6, 1.1, 0.07);
            tone(v, 0, D3, { gain: 0.2, attack: 0.25, hold: 0.6, release: 0.9, cutoff: 900 });
            tone(v, 0, A3, { gain: 0.15, attack: 0.25, hold: 0.6, release: 0.9, cutoff: 900 });
            tone(v, 0.1, Fs4, { gain: 0.09, attack: 0.25, hold: 0.5, release: 0.9, cutoff: 1200 });
        },
    },
    // The end of the day: a little tune that climbs to the octave and lands on a rolled chord.
    fanfare: {
        level: 0.51,
        reverb: 0.36,
        duck: { depth: 0.45, hold: 3 },
        build(v) {
            const unit = 0.112;
            const tune: Array<[number, number, number]> = [
                [0, A4, 0.6],
                [1, B4, 0.6],
                [2, D5, 0.65],
                [3, Fs5, 0.85],
                [6, E5, 0.6],
                [7, Fs5, 0.65],
                [8, A5, 0.85],
                [11, B5, 0.65],
                [12, A5, 0.6],
                [13, B5, 0.7],
                [14, D6, 0.9],
            ];
            for (const [step, freq, gain] of tune) {
                pluck(v, step * unit, freq, gain * 0.62, { bright: 0.7, damp: 1.4 });
                chime(v, step * unit, freq * 2, 0.35, gain * 0.1);
            }
            // Harmony on the accents, and the bass: D, G, A, D.
            mallet(v, 3 * unit, D5, 0.5, 0.26);
            mallet(v, 3 * unit, A4, 0.5, 0.22);
            mallet(v, 8 * unit, D5, 0.5, 0.26);
            mallet(v, 8 * unit, B4, 0.5, 0.22);
            mallet(v, 14 * unit, A5, 0.5, 0.24);
            mallet(v, 14 * unit, E5, 0.5, 0.22);
            const bass: Array<[number, number, number]> = [
                [0, D3, 0.3],
                [3, D3, 0.5],
                [8, G3, 0.5],
                [14, A3, 0.35],
                [17, D3, 1.2],
            ];
            for (const [step, freq, len] of bass) {
                tone(v, step * unit, freq, {
                    gain: 0.3,
                    attack: 0.012,
                    hold: len * 0.5,
                    release: len * 0.6,
                    cutoff: 700,
                });
                thump(v, step * unit, 120, 64, 0.16, 0.32);
            }
            for (const step of [0, 2, 6, 11, 13]) knock(v, step * unit, 1050, 0.03, 0.12);
            // The landing: a rolled chord, bells running up, a long ring.
            const landing = 17 * unit;
            [D4, A4, D5, Fs5, A5, D6].forEach((freq, index) => {
                pluck(v, landing + index * 0.035, freq, 0.42 + index * 0.04, { bright: 0.7, damp: 1.9 });
            });
            [D6, Fs6, A6, D7].forEach((freq, index) => chime(v, landing + 0.08 + index * 0.06, freq, 1.5, 0.12));
            tone(v, landing, D4, { gain: 0.1, attack: 0.1, hold: 0.6, release: 1.2, cutoff: 1000 });
            tone(v, landing, A4, { gain: 0.08, attack: 0.1, hold: 0.6, release: 1.2, cutoff: 1000 });
            tone(v, landing, Fs5, { gain: 0.05, attack: 0.1, hold: 0.6, release: 1.2, cutoff: 1400 });
        },
    },
};

/** The names of all effects, in the order of the contract. */
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

/**
 * Plays an effect on a mixer as the game does: on the effects channel, and
 * dipping the music if the effect calls for it. `ducking` remembers the dip
 * in progress between calls. The self-test renders effects with this same
 * call on an offline context.
 */
export function fireSfx(
    mixer: Mixer,
    name: SfxName,
    time: number,
    options: SfxOptions | undefined,
    ducking: { until: number },
): void {
    playSfx(busOf(mixer.ctx, mixer.sfx), name, time, options);
    const duck = RECIPES[name].duck;
    if (duck) duckMusic(mixer, time, duck.depth, duck.hold, ducking);
}

/** Builds one effect on a bus at `time`, with the caller's volume, pitch and pan. */
function playSfx(bus: Bus, name: SfxName, time: number, options: SfxOptions = {}): void {
    const recipe = RECIPES[name];
    const volume = Math.max(0, Math.min(1, options.volume ?? 1));
    const pitch = Math.max(0.25, Math.min(4, options.pitch ?? 1));
    const v = openVoice(bus, time, { gain: recipe.level * volume, pitch, pan: options.pan, reverb: recipe.reverb });
    recipe.build(v);
    finish(v);
}
