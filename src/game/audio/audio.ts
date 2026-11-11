/**
 * The game's sound: every effect and the music are synthesized with the Web
 * Audio API, so the app ships no audio files.
 *
 * `synth.ts` holds the building blocks, `sfx.ts` the effects, `score.ts` the
 * composer, `music.ts` the player and `mix.ts` the mixing desk. This file is
 * the engine the game talks to. `selftest.ts` renders everything offline and
 * measures it, since the code that makes a sound takes any audio context.
 */
import {
    createMixer,
    DEFAULT_MUSIC_VOLUME,
    DEFAULT_SFX_VOLUME,
    setMusicLevel,
    setSfxLevel,
    type Mixer,
} from './mix.ts';
import { MusicPlayer } from './music.ts';
import { fireSfx } from './sfx.ts';

export { DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME } from './mix.ts';

/** Every sound effect the game plays. */
export type SfxName =
    | 'click'
    | 'hover'
    | 'paper'
    | 'blip'
    | 'ask'
    | 'stampApprove'
    | 'stampRefuse'
    | 'correct'
    | 'wrong'
    | 'coin'
    | 'splash'
    | 'thaw'
    | 'freeze'
    | 'bell'
    | 'gong'
    | 'whoosh'
    | 'pop'
    | 'block'
    | 'press'
    | 'seal'
    | 'chapter'
    | 'tick'
    | 'alarm'
    | 'fanfare'
    | 'step'
    | 'gate'
    | 'ping'
    | 'crane';

/** The music's mood; it follows the venue day. */
export type MusicMood = 'title' | 'morning' | 'day' | 'tense' | 'dusk' | 'night' | 'finale';

export interface SfxOptions {
    /** 0..1, multiplies the effect's own level. */
    volume?: number;
    /** Playback pitch as a ratio: 1 is normal, 2 an octave up. */
    pitch?: number;
    /** Stereo position: −1 left, 1 right. */
    pan?: number;
}

export interface AudioEngine {
    /** Starts the audio context; call from a click or key press (browsers require it). Safe to call again. */
    unlock(): Promise<void>;
    /** True once `unlock` has succeeded. */
    readonly unlocked: boolean;
    play(name: SfxName, options?: SfxOptions): void;
    /** Starts the music, or cross-fades to another mood. */
    setMood(mood: MusicMood): void;
    stopMusic(): void;
    setMuted(muted: boolean): void;
    /** 0..1. */
    setMusicVolume(volume: number): void;
    /** 0..1. */
    setSfxVolume(volume: number): void;
    dispose(): void;
    /** The output level right now, for a meter: the peak and the average of the last few milliseconds, 0..1. */
    level?(): { peak: number; rms: number };
}

/** The same effect fired again within this many seconds is dropped. */
const REPEAT_GUARD = 0.03;
/** How often the music scheduler runs, in milliseconds. It schedules well over a second ahead. */
const TICK_MS = 100;

/** A silent engine, used where Web Audio is missing: on the server and in old browsers. */
function silentEngine(): AudioEngine {
    return {
        unlock: async () => {},
        unlocked: false,
        play() {},
        setMood() {},
        stopMusic() {},
        setMuted() {},
        setMusicVolume() {},
        setSfxVolume() {},
        dispose() {},
    };
}

/** The browser's audio context class, if it has one. */
function contextClass(): typeof AudioContext | null {
    if (typeof window === 'undefined') return null;
    const scope = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/**
 * Makes the game's audio engine. It is silent and holds no audio context
 * until `unlock` is called from a click or key press. A mood, volumes and
 * mute set before then are remembered and applied.
 */
export function createAudio(): AudioEngine {
    const Context = contextClass();
    if (!Context) return silentEngine();

    let ctx: AudioContext | null = null;
    let mixer: Mixer | null = null;
    let player: MusicPlayer | null = null;
    let meter: AnalyserNode | null = null;
    let samples: Float32Array<ArrayBuffer> | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let unlocked = false;
    let disposed = false;
    let muted = false;
    let musicVolume = DEFAULT_MUSIC_VOLUME;
    let sfxVolume = DEFAULT_SFX_VOLUME;
    let mood: MusicMood | null = null;
    const lastPlayed = new Map<SfxName, number>();
    const ducking = { until: 0 };

    const running = () => ctx !== null && ctx.state === 'running';

    /** Keeps the scheduler's timer alive only while there is music to schedule. */
    const tick = () => {
        if (!ctx || !player) return;
        if (running()) player.tick(ctx.currentTime);
        if (!player.active && timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    };

    /** Makes the player follow the wanted mood, once the context runs. */
    const followMood = () => {
        if (!ctx || !player || !running()) return;
        if (mood) player.setMood(mood, ctx.currentTime);
        else player.stop(ctx.currentTime);
        if (player.active && timer === null) timer = setInterval(tick, TICK_MS);
    };

    // A hidden tab is silent: the context is suspended, which also stops its
    // clock, so the music picks up on the same beat when the tab is back.
    const onVisibility = () => {
        if (!ctx || disposed) return;
        if (document.hidden) void ctx.suspend().catch(() => {});
        else if (unlocked) void ctx.resume().catch(() => {});
    };

    const onState = () => {
        if (!running()) return;
        unlocked = true;
        followMood();
        tick();
    };

    const applyMute = () => {
        if (!ctx || !mixer) return;
        mixer.master.gain.cancelScheduledValues(ctx.currentTime);
        mixer.master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03);
    };

    return {
        async unlock() {
            if (disposed) return;
            if (!ctx) {
                try {
                    const created = new Context({ latencyHint: 'interactive' });
                    mixer = createMixer(created);
                    ctx = created;
                } catch {
                    // No usable Web Audio: stay silent.
                    return;
                }
                player = new MusicPlayer(mixer);
                meter = ctx.createAnalyser();
                meter.fftSize = 2048;
                samples = new Float32Array(meter.fftSize);
                mixer.master.connect(meter);
                setSfxLevel(mixer, sfxVolume);
                setMusicLevel(mixer, musicVolume);
                mixer.master.gain.value = muted ? 0 : 1;
                ctx.addEventListener('statechange', onState);
                document.addEventListener('visibilitychange', onVisibility);
            }
            if (!running() && !document.hidden) {
                // Without a click behind it, `resume` may never settle: do not wait for ever.
                const resumed = ctx.resume().catch(() => {});
                await Promise.race([resumed, new Promise<void>((resolve) => setTimeout(resolve, 400))]);
            }
            if (running()) onState();
        },
        get unlocked() {
            return unlocked;
        },
        play(name, options) {
            if (!ctx || !mixer || muted || !running()) return;
            const now = ctx.currentTime;
            const last = lastPlayed.get(name);
            if (last !== undefined && now - last < REPEAT_GUARD) return;
            lastPlayed.set(name, now);
            fireSfx(mixer, name, now + 0.004, options, ducking);
        },
        setMood(next) {
            mood = next;
            followMood();
        },
        stopMusic() {
            mood = null;
            followMood();
        },
        setMuted(next) {
            muted = next;
            applyMute();
        },
        setMusicVolume(volume) {
            musicVolume = volume;
            if (mixer) setMusicLevel(mixer, volume);
        },
        setSfxVolume(volume) {
            sfxVolume = volume;
            if (mixer) setSfxLevel(mixer, volume);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            unlocked = false;
            if (timer !== null) clearInterval(timer);
            timer = null;
            player?.dispose();
            if (ctx) {
                ctx.removeEventListener('statechange', onState);
                document.removeEventListener('visibilitychange', onVisibility);
                void ctx.close().catch(() => {});
            }
            ctx = null;
            mixer = null;
            player = null;
            meter = null;
        },
        level() {
            if (!meter || !samples || !running()) return { peak: 0, rms: 0 };
            meter.getFloatTimeDomainData(samples);
            let peak = 0;
            let squares = 0;
            for (const sample of samples) {
                peak = Math.max(peak, Math.abs(sample));
                squares += sample * sample;
            }
            return { peak, rms: Math.sqrt(squares / samples.length) };
        },
    };
}
