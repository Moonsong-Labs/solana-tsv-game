/**
 * The building blocks every sound is made of: struck tones, noise bursts,
 * sustained tones and plucked strings. Each takes a context and a
 * destination, so the same code plays live and renders offline for the
 * self-test.
 */

/** A small seeded random generator (mulberry32), so every render is the same. */
export function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The frequency of a MIDI note number (69 is the A at 440 Hz). */
export function hz(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
}

/** Where sounds play: a context, a dry output and the input of the shared reverb. */
export interface Bus {
    ctx: BaseAudioContext;
    out: AudioNode;
    send: AudioNode;
}

/** One sound being built: where its parts connect, when it starts and its pitch. */
export interface Voice {
    ctx: BaseAudioContext;
    /** Every part of the sound connects here. */
    out: GainNode;
    /** When the sound starts, in context time. */
    t: number;
    /** Multiplies every frequency in the sound. */
    pitch: number;
    /** When the last part stops; grows as parts are added. */
    end: number;
    /** The part that stops last. */
    last: AudioScheduledSourceNode | null;
    /** What to disconnect once the sound is over. */
    nodes: AudioNode[];
    /** Counts noise bursts, so each reads a different stretch of noise. */
    bursts: number;
}

export interface VoiceOptions {
    /** The sound's level. */
    gain?: number;
    /** Multiplies every frequency: 1 is normal, 2 an octave up. */
    pitch?: number;
    /** Stereo position: -1 left, 1 right. */
    pan?: number;
    /** How much of the sound also goes to the reverb, 0..1. */
    reverb?: number;
}

/** Starts a sound on a bus at time `t`; add parts to it, then call `finish`. */
export function openVoice(bus: Bus, t: number, options: VoiceOptions = {}): Voice {
    const { ctx } = bus;
    const out = ctx.createGain();
    out.gain.value = options.gain ?? 1;
    const nodes: AudioNode[] = [out];
    const pan = options.pan ?? 0;
    if (pan !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        out.connect(panner).connect(bus.out);
        nodes.push(panner);
    } else {
        out.connect(bus.out);
    }
    const reverb = options.reverb ?? 0;
    if (reverb > 0) {
        const send = ctx.createGain();
        send.gain.value = reverb;
        out.connect(send).connect(bus.send);
        nodes.push(send);
    }
    return { ctx, out, t, pitch: options.pitch ?? 1, end: t, last: null, nodes, bursts: 0 };
}

/** Ends the building of a sound: its nodes are released when its last part stops. */
export function finish(v: Voice): void {
    const { nodes, last } = v;
    if (!last) {
        for (const node of nodes) node.disconnect();
        return;
    }
    last.onended = () => {
        for (const node of nodes) node.disconnect();
    };
}

/** Starts a source and remembers when the sound ends. */
function run(v: Voice, source: AudioScheduledSourceNode, from: number, until: number): void {
    source.start(from);
    source.stop(until);
    if (until >= v.end) {
        v.end = until;
        v.last = source;
    }
}

/**
 * Shapes a gain: silent, up to `peak` in `attack` seconds, held for `hold`,
 * then dying away over `len` seconds. Returns the time it is silent again.
 */
function shape(gain: AudioParam, t: number, peak: number, attack: number, hold: number, len: number): number {
    gain.value = 0;
    gain.setValueAtTime(0, t);
    gain.linearRampToValueAtTime(peak, t + attack);
    if (hold > 0) gain.setValueAtTime(peak, t + attack + hold);
    gain.setTargetAtTime(0, t + attack + hold, len / 6.9);
    return t + attack + hold + len * 1.15;
}

/** Partials above this are left out: they would only add hiss. */
const TOP = 13000;

export interface PingOptions {
    type?: OscillatorType;
    /** Seconds to reach full level. */
    attack?: number;
    /** Seconds held at full level before dying away. */
    hold?: number;
    /** A frequency to glide to. */
    to?: number;
    /** Seconds the glide takes; the length of the tone by default. */
    glide?: number;
    /** An unsteady pitch: `[times a second, Hz up and down]`. */
    wobble?: [number, number];
    /** Where the tone connects instead of the voice's output. */
    into?: AudioNode;
}

/**
 * One struck tone: an oscillator at `freq` that dies away over `len`
 * seconds. Most sounds are a handful of these. `at` is seconds after the
 * voice's start.
 */
export function ping(v: Voice, at: number, freq: number, len: number, gain: number, options: PingOptions = {}): void {
    const f = freq * v.pitch;
    if (f > TOP) return;
    const { ctx } = v;
    const t = v.t + at;
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (options.to !== undefined)
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to * v.pitch), t + (options.glide ?? len));
    const env = ctx.createGain();
    const end = shape(env.gain, t, gain, options.attack ?? 0.002, options.hold ?? 0, len);
    osc.connect(env).connect(options.into ?? v.out);
    if (options.wobble) {
        const [rate, depth] = options.wobble;
        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        lfo.frequency.value = rate;
        const amount = ctx.createGain();
        amount.gain.value = depth * v.pitch;
        lfo.connect(amount).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(end);
    }
    run(v, osc, t, end);
}

export interface ToneOptions {
    type?: OscillatorType;
    gain: number;
    attack: number;
    hold: number;
    /** Seconds to die away after the hold. */
    release: number;
    to?: number;
    glide?: number;
    /** A low-pass cutoff in Hz, to round the tone off. */
    cutoff?: number;
}

/** A sustained tone: swells in, holds, fades. For buzzes, pads and alarms. */
export function tone(v: Voice, at: number, freq: number, options: ToneOptions): void {
    const { ctx } = v;
    const t = v.t + at;
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'triangle';
    osc.frequency.setValueAtTime(freq * v.pitch, t);
    if (options.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
            Math.max(1, options.to * v.pitch),
            t + (options.glide ?? options.attack + options.hold),
        );
    }
    const env = ctx.createGain();
    const end = shape(env.gain, t, options.gain, options.attack, options.hold, options.release);
    if (options.cutoff !== undefined) {
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = Math.min(TOP, options.cutoff * v.pitch);
        lowpass.Q.value = 0.5;
        osc.connect(lowpass).connect(env);
    } else {
        osc.connect(env);
    }
    env.connect(v.out);
    run(v, osc, t, end);
}

export type NoiseColor = 'white' | 'pink';

const noiseCache = new Map<string, AudioBuffer>();

/** Two seconds of seeded noise at the context's rate; white hisses, pink is softer. */
function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
    const key = `${color}:${ctx.sampleRate}`;
    const cached = noiseCache.get(key);
    if (cached) return cached;
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const random = seeded(color === 'white' ? 0x5eed : 0xb10c);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let peak = 0;
    for (let i = 0; i < length; i++) {
        const white = random() * 2 - 1;
        if (color === 'white') {
            data[i] = white;
        } else {
            // Paul Kellett's three-pole pinking filter.
            b0 = 0.99765 * b0 + white * 0.099046;
            b1 = 0.963 * b1 + white * 0.2965164;
            b2 = 0.57 * b2 + white * 1.0526913;
            data[i] = b0 + b1 + b2 + white * 0.1848;
        }
        peak = Math.max(peak, Math.abs(data[i] ?? 0));
    }
    for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) / peak;
    noiseCache.set(key, buffer);
    return buffer;
}

export interface HissOptions {
    filter: BiquadFilterType;
    /** The filter's frequency in Hz. */
    freq: number;
    q?: number;
    /** Later filter frequencies as `[seconds after the start, Hz]`, for sweeps. */
    sweep?: Array<[number, number]>;
    attack?: number;
    hold?: number;
    color?: NoiseColor;
    into?: AudioNode;
}

/**
 * A burst of filtered noise that dies away over `len` seconds: paper,
 * air, thuds, clicks and splashes.
 */
export function hiss(v: Voice, at: number, len: number, gain: number, options: HissOptions): void {
    const { ctx } = v;
    const t = v.t + at;
    const buffer = noiseBuffer(ctx, options.color ?? 'white');
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = options.filter;
    filter.Q.value = options.q ?? 0.7;
    filter.frequency.setValueAtTime(Math.min(TOP, options.freq * v.pitch), t);
    for (const [after, freq] of options.sweep ?? []) {
        filter.frequency.exponentialRampToValueAtTime(Math.min(TOP, freq * v.pitch), t + after);
    }
    const env = ctx.createGain();
    const end = shape(env.gain, t, gain, options.attack ?? 0.002, options.hold ?? 0, len);
    source
        .connect(filter)
        .connect(env)
        .connect(options.into ?? v.out);
    v.bursts += 1;
    const offset = ((v.bursts * 0.6180339887) % 1) * (buffer.duration - 0.05);
    source.start(t, offset);
    source.stop(end);
    if (end >= v.end) {
        v.end = end;
        v.last = source;
    }
}

/** A little metal bar, like a glockenspiel or music-box note: the palette's small bells. */
export function chime(v: Voice, at: number, freq: number, len: number, gain: number): void {
    ping(v, at, freq, len, gain, { attack: 0.0015 });
    ping(v, at, freq * 2.756, len * 0.4, gain * 0.26, { attack: 0.001 });
    ping(v, at, freq * 5.404, len * 0.18, gain * 0.1, { attack: 0.001 });
}

/** A knock on wood: two quick modes and the tick of the contact. */
export function knock(v: Voice, at: number, freq: number, len: number, gain: number): void {
    ping(v, at, freq, len, gain, { attack: 0.001 });
    ping(v, at, freq * 2.42, len * 0.55, gain * 0.3, { attack: 0.001 });
    hiss(v, at, 0.008, gain * 0.3, { filter: 'bandpass', freq: freq * 3.1, q: 1.2 });
}

/** A marimba-like bar: a warm fundamental, a quick overtone two octaves up and a soft mallet. */
export function mallet(v: Voice, at: number, freq: number, len: number, gain: number): void {
    ping(v, at, freq, len, gain, { attack: 0.003 });
    ping(v, at, freq * 3.93, len * 0.28, gain * 0.2, { attack: 0.002 });
    ping(v, at, freq * 9.2, len * 0.1, gain * 0.04, { attack: 0.001 });
    hiss(v, at, 0.012, gain * 0.18, { filter: 'lowpass', freq: Math.min(2400, freq * 4), color: 'pink' });
}

const pluckCache = new Map<string, AudioBuffer>();

/**
 * A plucked string for one MIDI note, by the Karplus-Strong method: a burst
 * of noise goes round a delay line as long as one period, losing a little
 * brightness on every pass. Computed once per note and rate, then replayed.
 */
export function pluckBuffer(ctx: BaseAudioContext, midi: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const key = `${midi}:${rate}`;
    const cached = pluckCache.get(key);
    if (cached) return cached;
    const freq = hz(midi);
    // Low strings ring longer than high ones.
    const seconds = Math.max(1.4, Math.min(3.2, 3.2 - (midi - 50) * 0.04));
    const length = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const period = rate / freq;
    // The loop is a whole delay, a two-sample average (about `blend` samples
    // late) and an all-pass filter for the fraction, so the note is in tune.
    // The average is what dulls the string; high strings get less of it, or
    // they would die at once.
    const blend = Math.max(0.22, Math.min(0.5, 0.5 - (midi - 40) * 0.005));
    const whole = Math.max(2, Math.floor(period - blend - 0.2));
    const fraction = period - blend - whole;
    const allpass = (1 - fraction) / (1 + fraction);
    // The loss per pass that makes the fundamental fade by 60 dB in `seconds`.
    const loss = 10 ** (-3 / (freq * seconds * 0.95));
    const random = seeded(midi * 7919 + 17);
    // The pluck: one period of noise, smoothed a little, minus a copy of
    // itself delayed as if the string were plucked an eighth along.
    const burst = new Float32Array(whole);
    let smooth = 0;
    let mean = 0;
    for (let i = 0; i < whole; i++) {
        smooth += 0.62 * (random() * 2 - 1 - smooth);
        burst[i] = smooth;
        mean += smooth / whole;
    }
    const pick = Math.max(1, Math.round(whole * 0.13));
    let previous = 0;
    let passed = 0;
    let peak = 0;
    for (let i = 0; i < length; i++) {
        let input = 0;
        if (i < whole) input += (burst[i] ?? 0) - mean;
        if (i >= pick && i < whole + pick) input -= ((burst[i - pick] ?? 0) - mean) * 0.9;
        const a = i >= whole ? (data[i - whole] ?? 0) : 0;
        const b = i > whole ? (data[i - whole - 1] ?? 0) : 0;
        const averaged = (1 - blend) * a + blend * b;
        const out = allpass * averaged + previous - allpass * passed;
        previous = averaged;
        passed = out;
        const sample = input + loss * out;
        data[i] = sample;
        peak = Math.max(peak, Math.abs(sample));
    }
    const fade = Math.floor(rate * 0.04);
    for (let i = 0; i < length; i++) {
        const tail = i > length - fade ? (length - i) / fade : 1;
        data[i] = ((data[i] ?? 0) / peak) * tail;
    }
    pluckCache.set(key, buffer);
    return buffer;
}

export interface PluckOptions {
    /** 0 dull .. 1 bright. */
    bright?: number;
    /** Slides up into the note from just below, like a pressed koto string. */
    scoop?: boolean;
    /** Seconds after which the string is damped; it rings out by default. */
    damp?: number;
}

/** A plucked string, the koto of the palette. */
export function pluck(v: Voice, at: number, freq: number, gain: number, options: PluckOptions = {}): void {
    const { ctx } = v;
    const t = v.t + at;
    const target = freq * v.pitch;
    const midi = Math.max(28, Math.min(100, Math.round(69 + 12 * Math.log2(target / 440))));
    const buffer = pluckBuffer(ctx, midi);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = target / hz(midi);
    // A hard pluck starts a touch sharp; a scoop starts flat and slides up.
    if (options.scoop) {
        source.detune.setValueAtTime(-90, t);
        source.detune.linearRampToValueAtTime(0, t + 0.07);
    } else {
        source.detune.setValueAtTime(14 * gain, t);
        source.detune.setTargetAtTime(0, t, 0.035);
    }
    const bright = options.bright ?? 0.6;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 0.6;
    lowpass.frequency.value = Math.min(TOP, 700 + target * (2 + 9 * bright));
    const env = ctx.createGain();
    env.gain.value = gain;
    let end = t + buffer.duration / source.playbackRate.value;
    if (options.damp !== undefined && t + options.damp < end) {
        env.gain.setValueAtTime(gain, t + options.damp * 0.6);
        env.gain.setTargetAtTime(0, t + options.damp * 0.6, (options.damp * 0.4) / 5);
        end = t + options.damp;
    }
    source.connect(lowpass).connect(env).connect(v.out);
    run(v, source, t, end);
}

/** A soft low drum: a quick fall in pitch and a puff of air. */
export function thump(v: Voice, at: number, from: number, to: number, len: number, gain: number): void {
    ping(v, at, from, len, gain, { to, glide: Math.min(0.08, len * 0.4), attack: 0.002 });
    hiss(v, at, Math.min(0.06, len * 0.4), gain * 0.5, { filter: 'lowpass', freq: from * 5, color: 'pink' });
}
