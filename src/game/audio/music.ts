/**
 * The music player: it turns the composer's notes into sound and schedules
 * them a little ahead on the audio clock, so the beat never depends on the
 * frame rate. Each mood plays on its own deck; changing mood fades one deck
 * out while the next fades in.
 */
import type { MusicMood } from './audio.ts';
import type { Channel, Mixer } from './mix.ts';
import { composeSection, MOODS, STEPS_PER_SECTION, type MoodSpec, type Note, type Part } from './score.ts';
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
    seeded,
    thump,
    tone,
    type Bus,
    type Voice,
} from './synth.ts';

/** How far ahead of the clock notes are scheduled, in seconds. */
export const LOOKAHEAD = 1.2;
/** How long one mood takes to fade into another, in seconds. */
export const CROSSFADE = 2;

/** A music-box comb tooth: nearly pure, with the tick of the pin. */
function tine(v: Voice, at: number, freq: number, len: number, gain: number): void {
    ping(v, at, freq, len, gain, { attack: 0.002 });
    ping(v, at, freq * 2, len * 0.5, gain * 0.1, { attack: 0.002 });
    ping(v, at, freq * 6.27, len * 0.05, gain * 0.06, { attack: 0.001 });
}

/** Moves both faders of a channel in a straight line; at once when `seconds` is 0. */
function ramp(channel: Channel, to: number, now: number, seconds: number): void {
    for (const param of [channel.out.gain, channel.send.gain]) {
        if (seconds <= 0) {
            param.value = to;
            continue;
        }
        const from = param.value;
        param.cancelScheduledValues(now);
        param.setValueAtTime(from, now);
        param.linearRampToValueAtTime(to, now + seconds);
    }
}

/** One mood playing: its instruments, its faders and its place in the score. */
class Deck {
    readonly mood: MusicMood;
    /** No note is scheduled at or after this time; set when the deck fades out. */
    stopAt = Number.POSITIVE_INFINITY;
    /** When set, only these instruments play. */
    solo: ReadonlySet<Part> | null = null;
    private readonly ctx: BaseAudioContext;
    private readonly spec: MoodSpec;
    private readonly fader: Channel;
    private readonly inputs: AudioNode[] = [];
    private readonly lead: Bus;
    private readonly double: Bus;
    private readonly counter: Bus;
    private readonly arp: Bus;
    private readonly bass: Bus;
    private readonly padCentre: Bus;
    private readonly padLeft: Bus;
    private readonly padRight: Bus;
    private readonly perc: Bus;
    private readonly stepSeconds: number;
    private readonly random: () => number;
    private sectionStart: number;
    private sectionIndex = 0;
    private notes: Note[];
    private cursor = 0;

    constructor(mixer: Mixer, mood: MusicMood, start: number) {
        this.mood = mood;
        this.ctx = mixer.ctx;
        this.spec = MOODS[mood];
        const fader: Channel = { out: this.ctx.createGain(), send: this.ctx.createGain() };
        fader.out.gain.value = 0;
        fader.send.gain.value = 0;
        fader.out.connect(mixer.duck.out);
        fader.send.connect(mixer.duck.send);
        this.fader = fader;
        const { levels } = this.spec;
        this.lead = this.group(this.spec.lead.level, -0.12, 0.22);
        this.double = this.group(0.3, 0.2, 0.3);
        this.counter = this.group(this.spec.counter.level, 0.28, 0.28);
        this.arp = this.group(0.2, -0.32, 0.2);
        this.bass = this.group(levels.bass * 0.25, 0, 0);
        this.padCentre = this.group(levels.pad * 0.05, 0, 0.2);
        this.padLeft = this.group(levels.pad * 0.05, -0.6, 0.2);
        this.padRight = this.group(levels.pad * 0.05, 0.6, 0.2);
        this.perc = this.group(levels.perc * 0.5, 0, 0.15);
        this.stepSeconds = 60 / this.spec.bpm / 4;
        this.random = seeded(this.spec.bpm * 131 + this.spec.tonic);
        this.sectionStart = start;
        this.notes = composeSection(mood, 0);
    }

    /** An instrument group: a level, a place in the stereo field and a share of reverb. */
    private group(level: number, pan: number, reverb: number): Bus {
        const input = this.ctx.createGain();
        input.gain.value = level;
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        input.connect(panner).connect(this.fader.out);
        if (reverb > 0) {
            const send = this.ctx.createGain();
            send.gain.value = reverb;
            input.connect(send).connect(this.fader.send);
        }
        this.inputs.push(input);
        return { ctx: this.ctx, out: input, send: this.fader.send };
    }

    /** Fades the deck to `level` (0..1 of the mood's own level) over `seconds`. */
    fadeTo(level: number, now: number, seconds: number): void {
        ramp(this.fader, level * this.spec.gain, now, seconds);
    }

    /** Schedules every note that starts before `until`. Notes already late are dropped, not bunched up. */
    scheduleUntil(until: number, now: number): void {
        const limit = Math.min(until, this.stopAt);
        for (;;) {
            const note = this.notes[this.cursor];
            if (!note) {
                const next = this.sectionStart + STEPS_PER_SECTION * this.stepSeconds;
                if (next >= limit) return;
                this.sectionStart = next;
                this.sectionIndex += 1;
                this.notes = composeSection(this.mood, this.sectionIndex);
                this.cursor = 0;
                continue;
            }
            const beat = this.sectionStart + note.step * this.stepSeconds;
            if (beat >= limit) return;
            this.cursor += 1;
            if (beat < now - 0.05) continue;
            if (this.solo && !this.solo.has(note.part)) continue;
            this.play(note, beat);
        }
    }

    /** Plays one note of the score at `beat`, with a human's small unevenness. */
    private play(note: Note, beat: number): void {
        const { spec, stepSeconds } = this;
        const loose = (spread: number) => Math.max(this.sectionStart, beat + (this.random() - 0.5) * 2 * spread);
        const freq = hz(note.midi);
        const seconds = note.len * stepSeconds;
        switch (note.part) {
            case 'lead': {
                const v = openVoice(this.lead, loose(0.005), { gain: note.vel });
                if (spec.lead.voice === 'bell') {
                    chime(v, 0, freq, 2.3, 0.9);
                    ping(v, 0, freq / 2, 1.2, 0.12, { attack: 0.004 });
                } else {
                    pluck(v, 0, freq, 0.95, { bright: spec.lead.bright * (0.65 + 0.35 * note.vel), scoop: note.scoop });
                }
                finish(v);
                break;
            }
            case 'double': {
                const v = openVoice(this.double, loose(0.006), { gain: note.vel });
                tine(v, 0, freq, 0.8, 0.9);
                finish(v);
                break;
            }
            case 'counter': {
                const v = openVoice(this.counter, loose(0.007), { gain: note.vel });
                if (spec.counter.voice === 'marimba') {
                    mallet(v, 0, freq, Math.max(0.35, Math.min(1.2, 1.4 - (note.midi - 48) * 0.025)), 0.9);
                } else if (spec.counter.voice === 'musicbox') {
                    tine(v, 0, freq, 1.3, 0.8);
                } else {
                    pluck(v, 0, freq, 0.8, { bright: 0.32 });
                }
                finish(v);
                break;
            }
            case 'arp': {
                const v = openVoice(this.arp, loose(0.005), { gain: note.vel });
                mallet(v, 0, freq, 0.4, 0.9);
                finish(v);
                break;
            }
            case 'bass': {
                const v = openVoice(this.bass, beat, { gain: note.vel });
                const hold = Math.max(0.05, seconds * 0.5);
                const release = Math.max(0.2, seconds * 0.6);
                tone(v, 0, freq, { type: 'sine', gain: 0.8, attack: 0.02, hold, release });
                tone(v, 0, freq * 2, { type: 'sine', gain: 0.14, attack: 0.02, hold, release: release * 0.7 });
                tone(v, 0, freq, {
                    type: 'triangle',
                    gain: 0.22,
                    attack: 0.02,
                    hold,
                    release: release * 0.6,
                    cutoff: 620,
                });
                finish(v);
                break;
            }
            case 'pad': {
                // The note in the middle, and a slightly detuned copy on each
                // side that drifts slowly against it: wide, and never still.
                const swell = {
                    type: 'triangle' as const,
                    attack: 1.3,
                    hold: Math.max(0.1, seconds - 1.6),
                    release: 2.4,
                    cutoff: 1100,
                };
                const layers: Array<[Bus, number, number]> = [
                    [this.padCentre, 1, 0.8],
                    [this.padLeft, 0.9982, 0.45],
                    [this.padRight, 1.0018, 0.45],
                ];
                for (const [bus, detune, gain] of layers) {
                    const v = openVoice(bus, beat, { gain: note.vel });
                    tone(v, 0, freq * detune, { ...swell, gain });
                    finish(v);
                }
                break;
            }
            case 'block': {
                const v = openVoice(this.perc, loose(0.003), { gain: note.vel, pan: -0.3 });
                knock(v, 0, note.midi > 0 ? 930 : 620, 0.05, 0.78);
                finish(v);
                break;
            }
            case 'shaker': {
                const v = openVoice(this.perc, loose(0.004), { gain: note.vel, pan: 0.35 });
                hiss(v, 0, 0.05, 0.66, { filter: 'bandpass', freq: 4800, q: 1.1, attack: 0.008 });
                finish(v);
                break;
            }
            case 'drum': {
                const v = openVoice(this.perc, loose(0.003), { gain: note.vel });
                thump(v, 0, 98, 56, 0.42, 1.2);
                ping(v, 0, 196, 0.08, 0.3, { attack: 0.002 });
                finish(v);
                break;
            }
            case 'bells': {
                const v = openVoice(this.perc, beat, { gain: note.vel, pan: 0.2 });
                [2637, 3136, 3951].forEach((bell, index) => ping(v, index * 0.03, bell, 0.3, 0.14, { attack: 0.001 }));
                finish(v);
                break;
            }
        }
    }

    /** Cuts the deck off from the mixer. */
    dispose(): void {
        this.fader.out.disconnect();
        this.fader.send.disconnect();
        for (const input of this.inputs) input.disconnect();
    }
}

/** Plays moods on a mixer. `tick` must be called a few times a second while music plays. */
export class MusicPlayer {
    private readonly mixer: Mixer;
    /** When set, only these instruments play: for the lab, to hear one alone. */
    solo: ReadonlySet<Part> | null = null;
    private current: Deck | null = null;
    /** Decks fading out, with the time each can be thrown away. */
    private fading: Array<{ deck: Deck; until: number }> = [];

    constructor(mixer: Mixer) {
        this.mixer = mixer;
    }

    /** The mood now playing, if any. */
    get mood(): MusicMood | null {
        return this.current?.mood ?? null;
    }

    /** True while any deck is sounding, so the caller knows to keep ticking. */
    get active(): boolean {
        return this.current !== null || this.fading.length > 0;
    }

    /** Starts a mood at `now`, fading out whatever was playing. */
    setMood(mood: MusicMood, now: number, seconds: number = CROSSFADE): void {
        if (this.current?.mood === mood) return;
        this.retire(now, seconds);
        const deck = new Deck(this.mixer, mood, now + (seconds > 0 ? 0.08 : 0));
        deck.solo = this.solo;
        deck.fadeTo(1, now, seconds);
        this.current = deck;
        this.tick(now);
    }

    /** Fades the music out. */
    stop(now: number, seconds: number = 1.2): void {
        this.retire(now, seconds);
    }

    private retire(now: number, seconds: number): void {
        const deck = this.current;
        if (!deck) return;
        deck.fadeTo(0, now, seconds);
        deck.stopAt = now + seconds;
        this.fading.push({ deck, until: now + seconds + 0.3 });
        this.current = null;
    }

    /** Schedules the notes of the next `horizon` seconds and drops decks that have faded out. */
    tick(now: number, horizon: number = LOOKAHEAD): void {
        this.current?.scheduleUntil(now + horizon, now);
        for (const { deck } of this.fading) deck.scheduleUntil(now + horizon, now);
        this.fading = this.fading.filter(({ deck, until }) => {
            if (now < until) return true;
            deck.dispose();
            return false;
        });
    }

    /** Silences and drops every deck. */
    dispose(): void {
        this.current?.dispose();
        for (const { deck } of this.fading) deck.dispose();
        this.current = null;
        this.fading = [];
    }
}
