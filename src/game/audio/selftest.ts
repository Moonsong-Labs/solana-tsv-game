/**
 * The self-test: renders every effect and a stretch of every mood into an
 * offline context, through the same mixer the game uses, and measures the
 * result. It tells a reader without ears whether something is silent, too
 * loud, too long or shrill.
 */
import type { MusicMood, SfxName, SfxOptions } from './audio.ts';
import { createMixer, type Mixer } from './mix.ts';
import { MusicPlayer } from './music.ts';
import { MOOD_NAMES, type Part } from './score.ts';
import { fireSfx, SFX_NAMES } from './sfx.ts';

const RATE = 44100;
/** Long enough for the longest effect and its reverb. */
const SFX_WINDOW = 5.5;
/** Below this a sample counts as silence: 60 dB under full scale. */
const FLOOR = 0.001;

/** What the test measures of one rendered sound. */
export interface Measure {
    /** Seconds until the sound has died away to 60 dB under full scale. */
    duration: number;
    /** Seconds until it has fallen 30 dB under its own peak: the part that is plainly heard. */
    body: number;
    /** The largest sample, 0..1. */
    peak: number;
    /** The average level over the duration. */
    rms: number;
    /** The share of the duration spent in silence, 0..1. */
    silent: number;
    /** The share of the energy above 6 kHz, 0..1. */
    high: number;
    /** The centre of the spectrum in Hz: higher is brighter. */
    centroid: number;
    /** False if any sample is not a finite number. */
    finite: boolean;
}

export interface AudioTestReport {
    sampleRate: number;
    effects: Record<SfxName, Measure>;
    moods: Record<MusicMood, Measure>;
    /** Each instrument of each mood on its own, when asked for: how the band is balanced. */
    stems?: Record<MusicMood, Partial<Record<Part, Measure>>>;
    /** The engine at work; null where the browser cannot pause an offline context. */
    engine: EngineCheck | null;
    /** What the play options do. */
    options: OptionsCheck;
    /** Plain sentences, one per thing that looks wrong; empty when all is well. */
    problems: string[];
}

/** Checks of what a single rendered sound cannot show: scheduling, cross-fading and ducking. */
export interface EngineCheck {
    /**
     * The largest difference between music scheduled in one go and music
     * scheduled a little at a time, at uneven moments, as the live timer
     * does. It should be 0: no note lost, doubled or moved.
     */
    scheduler: number;
    /** The level of each half second while `day` cross-fades to `tense` from the fourth second on. */
    crossfade: number[];
    /** The music's level under a bell struck at the second second, per half second, as a share of its level without the bell. */
    duck: number[];
}

/** What `pitch`, `pan` and `volume` do to a blip, each as a ratio. */
export interface OptionsCheck {
    /** How much brighter the blip is at pitch 2; should be 2. */
    pitch: number;
    /** The right channel against the left at pan -1; should be 0. */
    pan: number;
    /** How loud the blip is at volume 0.5; should be 0.5. */
    volume: number;
}

/**
 * Silence rendered before each sound and cut off afterwards. A context's
 * first moments go round the master compressor (see `createMixer`); the game
 * plays long after that, so the test must too.
 */
const LEAD_IN = 0.5;

function offline(seconds: number): OfflineAudioContext {
    return new OfflineAudioContext(2, Math.ceil((LEAD_IN + seconds) * RATE), RATE);
}

/** Renders the context and returns the result without the lead-in. */
async function render(ctx: OfflineAudioContext): Promise<AudioBuffer> {
    const rendered = await ctx.startRendering();
    const skip = Math.floor(LEAD_IN * RATE);
    const trimmed = new AudioBuffer({
        numberOfChannels: rendered.numberOfChannels,
        length: rendered.length - skip,
        sampleRate: RATE,
    });
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
        trimmed.copyToChannel(rendered.getChannelData(channel).subarray(skip), channel);
    }
    return trimmed;
}

/** Renders one effect as the game would play it at the default volume. */
export async function renderSfx(name: SfxName, options?: SfxOptions): Promise<AudioBuffer> {
    const ctx = offline(SFX_WINDOW);
    fireSfx(createMixer(ctx), name, LEAD_IN, options, { until: 0 });
    return render(ctx);
}

/**
 * Renders the first `seconds` of a mood, at full level from the first note.
 * `solo` keeps only some instruments, to hear or measure them alone.
 */
export async function renderMood(mood: MusicMood, seconds: number = 8, solo?: Part[]): Promise<AudioBuffer> {
    const ctx = offline(seconds);
    const mixer = createMixer(ctx);
    const player = new MusicPlayer(mixer);
    if (solo) player.solo = new Set(solo);
    player.setMood(mood, LEAD_IN, 0);
    player.tick(LEAD_IN, seconds);
    return render(ctx);
}

/** Something the engine does at a moment of a rendered scene. */
interface Cue {
    at: number;
    run(player: MusicPlayer, mixer: Mixer, now: number, ducking: { until: number }): void;
}

/**
 * Renders the engine at work rather than one sound: the offline context is
 * paused at each cue and at each of `ticks`, where the scheduler runs as the
 * live engine's timer would, and then carries on. Returns null where the
 * browser cannot pause an offline context.
 */
async function renderLive(seconds: number, cues: Cue[], ticks: number[]): Promise<AudioBuffer | null> {
    const ctx = offline(seconds);
    if (!('suspend' in ctx)) return null;
    const mixer = createMixer(ctx);
    const player = new MusicPlayer(mixer);
    const ducking = { until: 0 };
    // A context can only pause on a block of 128 samples, once per block.
    const pauses = new Map<number, Cue[]>();
    const block = (time: number) => Math.ceil(((LEAD_IN + time) * RATE) / 128) * 128;
    for (const time of ticks) pauses.set(block(time), []);
    for (const cue of cues) pauses.set(block(cue.at), [...(pauses.get(block(cue.at)) ?? []), cue]);
    for (const [frame, due] of pauses) {
        if (frame >= ctx.length) continue;
        const now = frame / RATE;
        void ctx.suspend(now).then(() => {
            for (const cue of due) cue.run(player, mixer, now, ducking);
            player.tick(now);
            void ctx.resume();
        });
    }
    return render(ctx);
}

/** The level of each half second of a rendered sound. */
function halfSeconds(buffer: AudioBuffer, minus?: AudioBuffer): number[] {
    const size = Math.floor(buffer.sampleRate / 2);
    const levels: number[] = [];
    for (let start = 0; start + size <= buffer.length; start += size) {
        let squares = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            const other = minus?.getChannelData(channel);
            for (let i = start; i < start + size; i++) squares += ((data[i] ?? 0) - (other?.[i] ?? 0)) ** 2;
        }
        levels.push(Math.sqrt(squares / (size * buffer.numberOfChannels)));
    }
    return levels;
}

/** Runs the checks of the engine at work. */
export async function checkEngine(): Promise<EngineCheck | null> {
    const start = (mood: MusicMood): Cue => ({ at: 0, run: (player, _mixer, now) => player.setMood(mood, now, 0) });
    const every = (step: number, until: number) =>
        Array.from({ length: Math.floor(until / step) }, (_, index) => (index + 1) * step);

    // The scheduler: all at once against a little at a time, with a long stall in the middle.
    const once = await renderLive(
        7,
        [{ at: 0, run: (player, _mixer, now) => (player.setMood('day', now, 0), player.tick(now, 7)) }],
        [],
    );
    const uneven = [0.1, 0.2, 0.3, 0.45, 1.5, 1.6, 2.55, 2.7, 3.2, 4.1, 4.15, 5.2, 5.9, 6.6];
    const stepped = await renderLive(7, [start('day')], uneven);
    if (!once || !stepped) return null;
    let scheduler = 0;
    for (let channel = 0; channel < 2; channel++) {
        const a = once.getChannelData(channel);
        const b = stepped.getChannelData(channel);
        for (let i = 0; i < a.length; i++) scheduler = Math.max(scheduler, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
    }

    const ticks = every(0.25, 10);
    const faded = await renderLive(
        10,
        [start('day'), { at: 4, run: (player, _mixer, now) => player.setMood('tense', now) }],
        ticks,
    );

    const bell: Cue = { at: 2, run: (_player, mixer, now, ducking) => fireSfx(mixer, 'bell', now, undefined, ducking) };
    const alone = await renderLive(8, [start('day')], ticks);
    const struck = await renderLive(8, [bell], []);
    const both = await renderLive(8, [start('day'), bell], ticks);
    if (!faded || !alone || !struck || !both) return null;
    const plain = halfSeconds(alone);
    const duck = halfSeconds(both, struck).map((level, index) => level / Math.max(1e-6, plain[index] ?? 0));
    return { scheduler, crossfade: halfSeconds(faded), duck };
}

/** The largest sample of one channel. */
function channelPeak(buffer: AudioBuffer, channel: number): number {
    let peak = 0;
    for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
    return peak;
}

/** Measures what the play options do. */
export async function checkOptions(): Promise<OptionsCheck> {
    const plain = await renderSfx('blip');
    const high = await renderSfx('blip', { pitch: 2 });
    const left = await renderSfx('blip', { pan: -1 });
    const soft = await renderSfx('blip', { volume: 0.5 });
    return {
        pitch: measure(high).centroid / measure(plain).centroid,
        pan: channelPeak(left, 1) / channelPeak(left, 0),
        volume: channelPeak(soft, 0) / channelPeak(plain, 0),
    };
}

/** An in-place radix-2 FFT of a real signal; returns the power in each bin up to half the rate. */
function powerSpectrum(frame: Float32Array): Float32Array {
    const size = frame.length;
    const real = Float32Array.from(frame);
    const imaginary = new Float32Array(size);
    for (let i = 1, j = 0; i < size; i++) {
        let bit = size >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const swap = real[i] ?? 0;
            real[i] = real[j] ?? 0;
            real[j] = swap;
        }
    }
    for (let span = 2; span <= size; span <<= 1) {
        const angle = (-2 * Math.PI) / span;
        for (let start = 0; start < size; start += span) {
            for (let k = 0; k < span / 2; k++) {
                const cos = Math.cos(angle * k);
                const sin = Math.sin(angle * k);
                const a = start + k;
                const b = a + span / 2;
                const re = (real[b] ?? 0) * cos - (imaginary[b] ?? 0) * sin;
                const im = (real[b] ?? 0) * sin + (imaginary[b] ?? 0) * cos;
                real[b] = (real[a] ?? 0) - re;
                imaginary[b] = (imaginary[a] ?? 0) - im;
                real[a] = (real[a] ?? 0) + re;
                imaginary[a] = (imaginary[a] ?? 0) + im;
            }
        }
    }
    const power = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) power[i] = (real[i] ?? 0) ** 2 + (imaginary[i] ?? 0) ** 2;
    return power;
}

/** Measures a rendered sound. `whole` treats the full buffer as the sound, as for music. */
export function measure(buffer: AudioBuffer, whole: boolean = false): Measure {
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const length = buffer.length;
    let peak = 0;
    let last = 0;
    let finite = true;
    for (let i = 0; i < length; i++) {
        const l = left[i] ?? 0;
        const r = right[i] ?? 0;
        if (!Number.isFinite(l) || !Number.isFinite(r)) finite = false;
        const level = Math.max(Math.abs(l), Math.abs(r));
        if (level > peak) peak = level;
        if (level > FLOOR) last = i;
    }
    const end = whole ? length : Math.min(length, last + 1);
    let squares = 0;
    let quiet = 0;
    let bodyEnd = 0;
    const bodyFloor = peak * 10 ** (-30 / 20);
    for (let i = 0; i < end; i++) {
        const l = left[i] ?? 0;
        const r = right[i] ?? 0;
        squares += (l * l + r * r) / 2;
        const level = Math.max(Math.abs(l), Math.abs(r));
        if (level < FLOOR) quiet += 1;
        if (level > bodyFloor) bodyEnd = i;
    }
    // The spectrum, averaged over overlapping windows of the mono mix.
    const size = 2048;
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
    const frame = new Float32Array(size);
    let total = 0;
    let above = 0;
    let weighted = 0;
    const binHz = buffer.sampleRate / size;
    for (let start = 0; start < Math.max(1, end - size / 2); start += size / 2) {
        for (let i = 0; i < size; i++)
            frame[i] = (((left[start + i] ?? 0) + (right[start + i] ?? 0)) / 2) * (window[i] ?? 0);
        const power = powerSpectrum(frame);
        for (let bin = 1; bin < power.length; bin++) {
            const energy = power[bin] ?? 0;
            total += energy;
            weighted += energy * bin * binHz;
            if (bin * binHz >= 6000) above += energy;
        }
    }
    return {
        duration: end / buffer.sampleRate,
        body: (bodyEnd + 1) / buffer.sampleRate,
        peak,
        rms: Math.sqrt(squares / Math.max(1, end)),
        silent: quiet / Math.max(1, end),
        high: total > 0 ? above / total : 0,
        centroid: total > 0 ? weighted / total : 0,
        finite,
    };
}

/** How long each effect should be, in seconds until it has died away, as `[shortest, longest]`. */
const EXPECTED_LENGTH: Record<SfxName, [number, number]> = {
    click: [0.02, 0.2],
    hover: [0.01, 0.12],
    paper: [0.25, 0.7],
    blip: [0.02, 0.12],
    ask: [0.2, 0.8],
    stampApprove: [0.5, 1.3],
    stampRefuse: [0.4, 1.1],
    correct: [0.5, 1.3],
    wrong: [0.4, 1],
    coin: [0.3, 1],
    splash: [0.25, 0.9],
    thaw: [0.8, 1.6],
    freeze: [0.4, 1.2],
    bell: [2.2, 3.3],
    gong: [2.6, 3.7],
    whoosh: [0.4, 1],
    pop: [0.05, 0.4],
    block: [0.15, 0.6],
    press: [0.7, 1.4],
    seal: [0.2, 0.7],
    chapter: [1.3, 2],
    tick: [0.01, 0.12],
    alarm: [0.9, 1.6],
    fanfare: [3.1, 4.1],
    step: [0.04, 0.25],
    gate: [0.7, 1.4],
    ping: [0.6, 1.5],
    crane: [0.35, 0.9],
};

const PARTS: Part[] = ['lead', 'double', 'counter', 'arp', 'bass', 'pad', 'block', 'shaker', 'drum', 'bells'];

/** Effects that must stand out, and effects that must stay in the background. */
const PROMINENT: SfxName[] = ['stampApprove', 'stampRefuse', 'bell', 'gong', 'press'];
const DISCREET: SfxName[] = ['hover', 'blip', 'tick', 'block', 'step'];

/** Renders and measures everything, and lists what looks wrong. */
export async function runAudioTest(options: { musicSeconds?: number; stems?: boolean } = {}): Promise<AudioTestReport> {
    const problems: string[] = [];
    const effects = {} as Record<SfxName, Measure>;
    for (const name of SFX_NAMES) {
        const result = measure(await renderSfx(name));
        effects[name] = result;
        const [shortest, longest] = EXPECTED_LENGTH[name];
        if (!result.finite) problems.push(`${name}: has samples that are not numbers`);
        if (result.peak > 0.95) problems.push(`${name}: clips, peak ${result.peak.toFixed(3)}`);
        if (result.peak < 0.03 || result.rms < 0.003)
            problems.push(`${name}: near silent, peak ${result.peak.toFixed(4)}`);
        if (result.duration < shortest || result.duration > longest) {
            problems.push(`${name}: lasts ${result.duration.toFixed(2)} s, expected ${shortest} to ${longest} s`);
        }
        if (result.high > 0.3)
            problems.push(`${name}: shrill, ${(result.high * 100).toFixed(0)}% of its energy is above 6 kHz`);
    }
    const quietestProminent = Math.min(...PROMINENT.map((name) => effects[name].peak));
    for (const name of DISCREET) {
        if (effects[name].peak > quietestProminent * 0.6)
            problems.push(`${name}: too loud next to the stamps and the bell`);
    }
    const moods = {} as Record<MusicMood, Measure>;
    const peaks = SFX_NAMES.map((name) => effects[name].peak).sort((a, b) => a - b);
    const medianPeak = peaks[Math.floor(peaks.length / 2)] ?? 0;
    for (const mood of MOOD_NAMES) {
        const result = measure(await renderMood(mood, options.musicSeconds ?? 8), true);
        moods[mood] = result;
        if (!result.finite) problems.push(`${mood}: has samples that are not numbers`);
        if (result.peak > 0.6) problems.push(`${mood}: too loud, peak ${result.peak.toFixed(3)}`);
        if (result.rms < 0.01) problems.push(`${mood}: near silent, RMS ${result.rms.toFixed(4)}`);
        if (result.rms > medianPeak * 0.35)
            problems.push(`${mood}: would cover the effects, RMS ${result.rms.toFixed(3)}`);
        if (result.silent > 0.3) problems.push(`${mood}: ${(result.silent * 100).toFixed(0)}% silence`);
        if (result.high > 0.15)
            problems.push(`${mood}: shrill, ${(result.high * 100).toFixed(0)}% of its energy is above 6 kHz`);
    }
    const engine = await checkEngine();
    if (engine) {
        if (engine.scheduler > 0.001)
            problems.push(`scheduler: working a little at a time changes the music by ${engine.scheduler.toFixed(4)}`);
        const steady = Math.min(...engine.crossfade.slice(2, 8), ...engine.crossfade.slice(-6));
        const loud = Math.max(...engine.crossfade.slice(2, 8), ...engine.crossfade.slice(-6));
        engine.crossfade.slice(8, -6).forEach((level, index) => {
            if (level < steady * 0.5)
                problems.push(`cross-fade: the music dips to ${level.toFixed(3)} at ${(4 + index / 2).toFixed(1)} s`);
            if (level > loud * 1.5)
                problems.push(`cross-fade: the music swells to ${level.toFixed(3)} at ${(4 + index / 2).toFixed(1)} s`);
        });
        const dip = Math.min(...engine.duck);
        if (dip > 0.8 || dip < 0.25)
            problems.push(`duck: the bell dips the music to ${(dip * 100).toFixed(0)}%, expected about half`);
        const back = engine.duck[engine.duck.length - 1] ?? 0;
        if (back < 0.85)
            problems.push(`duck: the music is still at ${(back * 100).toFixed(0)}% six seconds after the bell`);
    }
    const played = await checkOptions();
    if (Math.abs(played.pitch - 2) > 0.3)
        problems.push(`options: pitch 2 makes a blip ${played.pitch.toFixed(2)} times brighter, expected 2`);
    if (played.pan > 0.02)
        problems.push(`options: pan -1 leaves ${(played.pan * 100).toFixed(0)}% in the right channel`);
    if (Math.abs(played.volume - 0.5) > 0.05) problems.push(`options: volume 0.5 plays at ${played.volume.toFixed(2)}`);
    if (!options.stems) return { sampleRate: RATE, effects, moods, engine, options: played, problems };
    const stems = {} as Record<MusicMood, Partial<Record<Part, Measure>>>;
    for (const mood of MOOD_NAMES) {
        stems[mood] = {};
        for (const part of PARTS) {
            const result = measure(await renderMood(mood, options.musicSeconds ?? 8, [part]), true);
            if (result.peak > 0) stems[mood][part] = result;
        }
    }
    return { sampleRate: RATE, effects, moods, stems, engine, options: played, problems };
}

/** Packs a rendered sound as a 16-bit WAV file, to listen to or keep. */
export function encodeWav(buffer: AudioBuffer, seconds?: number): Uint8Array<ArrayBuffer> {
    const channels = Math.min(2, buffer.numberOfChannels);
    const frames =
        seconds === undefined ? buffer.length : Math.min(buffer.length, Math.ceil(seconds * buffer.sampleRate));
    const bytes = new Uint8Array(44 + frames * channels * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, 'RIFF');
    view.setUint32(4, 36 + frames * channels * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, frames * channels * 2, true);
    const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let i = 0; i < frames; i++) {
        for (const channel of data) {
            const sample = Math.max(-1, Math.min(1, channel[i] ?? 0));
            view.setInt16(offset, Math.round(sample * 32767), true);
            offset += 2;
        }
    }
    return bytes;
}
