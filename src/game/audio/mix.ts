/**
 * The mixing desk: an effects channel and a music channel, one shared
 * reverb, and a master bus that glues the mix and keeps it from clipping.
 * It is built the same way on a live context and on an offline one.
 */
import { seeded, type Bus } from './synth.ts';

/** A pair of faders moved together: the dry signal and what goes to the reverb. */
export interface Channel {
    out: GainNode;
    send: GainNode;
}

export interface Mixer {
    ctx: BaseAudioContext;
    /** Where effects play; its faders are the effects volume. */
    sfx: Channel;
    /** Where music decks play; it feeds `music` and dips under the big effects. */
    duck: Channel;
    /** The music volume. */
    music: Channel;
    /** The last gain before the speakers, used to mute. */
    master: GainNode;
}

/** The volume sliders' starting positions. */
export const DEFAULT_SFX_VOLUME = 0.8;
export const DEFAULT_MUSIC_VOLUME = 0.7;

/** Level trims, so that the sliders' full range is useful and the music sits under the effects. */
const SFX_TRIM = 1;
const MUSIC_TRIM = 0.55;
/** The reverb's return. With it, a sound sent in full comes back about 6 dB under itself. */
const REVERB_LEVEL = 1.6;
/** What the compressor's built-in make-up gain does to a quiet signal, measured in Chromium. */
const GLUE_GAIN = 1.28;

/** A slider position (0..1) as a gain: squared, because loudness is heard that way. */
function sliderGain(volume: number): number {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    return clamped * clamped;
}

function makeChannel(ctx: BaseAudioContext, gain: number): Channel {
    const out = ctx.createGain();
    const send = ctx.createGain();
    out.gain.value = gain;
    send.gain.value = gain;
    return { out, send };
}

/** Moves both faders of a channel towards `gain`, smoothly, starting at `time`. */
function fade(channel: Channel, gain: number, time: number, seconds: number): void {
    for (const param of [channel.out.gain, channel.send.gain]) {
        param.cancelScheduledValues(time);
        param.setTargetAtTime(gain, time, Math.max(0.005, seconds / 4));
    }
}

/** The bus a voice plays on to reach a channel. */
export function busOf(ctx: BaseAudioContext, channel: Channel): Bus {
    return { ctx, out: channel.out, send: channel.send };
}

const impulseCache = new Map<number, AudioBuffer>();

/**
 * The reverb's impulse response: a warm room. A few early echoes, then
 * noise that fades over about a second and grows duller as it fades.
 */
function impulseResponse(ctx: BaseAudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const cached = impulseCache.get(rate);
    if (cached) return cached;
    const seconds = 1.5;
    const length = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        const random = seeded(0x7007 + channel * 101);
        const start = Math.floor(rate * 0.012);
        let low = 0;
        for (let i = start; i < length; i++) {
            const time = (i - start) / rate;
            // 60 dB down after 1.25 s.
            const level = 10 ** ((-3 * time) / 1.25);
            // The low-pass closes from bright to dull as the tail fades.
            const open = 0.75 * Math.exp(-time * 2.6) + 0.12;
            low += open * (random() * 2 - 1 - low);
            data[i] = low * level;
        }
        // Early echoes off the walls, at different times left and right.
        const echoes = channel === 0 ? [0.011, 0.019, 0.031, 0.043] : [0.013, 0.023, 0.029, 0.047];
        echoes.forEach((time, index) => {
            const at = Math.floor(time * rate);
            data[at] = (data[at] ?? 0) + (index % 2 === 0 ? 0.7 : -0.6) * 0.8 ** index;
        });
    }
    impulseCache.set(rate, buffer);
    return buffer;
}

/** A curve that leaves quiet signals alone and bends loud ones under 0.9, so nothing clips. */
function softClipCurve(): Float32Array<ArrayBuffer> {
    const size = 2049;
    const curve = new Float32Array(size);
    const knee = 0.7;
    const room = 0.2;
    for (let i = 0; i < size; i++) {
        const x = (i / (size - 1)) * 2 - 1;
        const magnitude = Math.abs(x);
        const bent = magnitude <= knee ? magnitude : knee + room * Math.tanh((magnitude - knee) / room);
        curve[i] = Math.sign(x) * bent;
    }
    return curve;
}

/** Builds the desk on a context and connects it to the context's output. */
export function createMixer(ctx: BaseAudioContext): Mixer {
    const sum = ctx.createGain();
    // Gentle: the music and single effects pass untouched, a pile-up of loud
    // effects is held back, and the fast attack leaves no spike for the
    // clipper to bend.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -12;
    glue.knee.value = 8;
    glue.ratio.value = 3;
    glue.attack.value = 0.003;
    glue.release.value = 0.2;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    const master = ctx.createGain();
    // A compressor wakes with its gain down and needs a quarter of a second
    // to settle, which would swallow the first click after `unlock`. Until
    // then the mix goes round it, at the level the compressor gives quiet
    // signals.
    const woken = ctx.currentTime + 0.28;
    const settled = ctx.createGain();
    settled.gain.value = 0;
    settled.gain.setValueAtTime(0, woken);
    settled.gain.linearRampToValueAtTime(1, woken + 0.02);
    const waking = ctx.createGain();
    waking.gain.value = GLUE_GAIN;
    waking.gain.setValueAtTime(GLUE_GAIN, woken);
    waking.gain.linearRampToValueAtTime(0, woken + 0.02);
    sum.connect(glue).connect(settled).connect(clip);
    sum.connect(waking).connect(clip);
    clip.connect(master).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_LEVEL;
    reverb.connect(wet).connect(sum);

    const sfx = makeChannel(ctx, sliderGain(DEFAULT_SFX_VOLUME) * SFX_TRIM);
    sfx.out.connect(sum);
    sfx.send.connect(reverb);

    const music = makeChannel(ctx, sliderGain(DEFAULT_MUSIC_VOLUME) * MUSIC_TRIM);
    music.out.connect(sum);
    music.send.connect(reverb);
    const duck = makeChannel(ctx, 1);
    duck.out.connect(music.out);
    duck.send.connect(music.send);

    return { ctx, sfx, duck, music, master };
}

/** Sets the effects volume from a slider position. */
export function setSfxLevel(mixer: Mixer, volume: number): void {
    fade(mixer.sfx, sliderGain(volume) * SFX_TRIM, mixer.ctx.currentTime, 0.12);
}

/** Sets the music volume from a slider position. */
export function setMusicLevel(mixer: Mixer, volume: number): void {
    fade(mixer.music, sliderGain(volume) * MUSIC_TRIM, mixer.ctx.currentTime, 0.12);
}

/**
 * Dips the music to `depth` for `hold` seconds from `time`, then lets it
 * back up. A later, shorter dip never cuts an earlier one short.
 */
export function duckMusic(mixer: Mixer, time: number, depth: number, hold: number, state: { until: number }): void {
    state.until = Math.max(state.until, time + hold);
    for (const param of [mixer.duck.out.gain, mixer.duck.send.gain]) {
        param.cancelScheduledValues(time);
        param.setTargetAtTime(depth, time, 0.03);
        param.setTargetAtTime(1, state.until, 0.3);
    }
}
