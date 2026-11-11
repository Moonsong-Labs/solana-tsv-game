'use client';

/**
 * The sound lab (`?lab=audio`): buttons for every effect and mood, the
 * volume controls, and the self-test's table.
 *
 * For scripts it sets three globals:
 *
 *   window.__audioTest()                 renders every effect and 8 s of every
 *                                        mood offline and returns the measures
 *   window.__audioWav(kind, name, s?)    renders one ('sfx' or 'mood') and
 *                                        returns it as a base64 WAV file
 *   window.__audioEngine                 the lab's live engine
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import {
    createAudio,
    DEFAULT_MUSIC_VOLUME,
    DEFAULT_SFX_VOLUME,
    type AudioEngine,
    type MusicMood,
    type SfxName,
} from './audio.ts';
import { MOOD_NAMES } from './score.ts';
import { encodeWav, renderMood, renderSfx, runAudioTest, type AudioTestReport, type Measure } from './selftest.ts';

declare global {
    interface Window {
        __audioTest?: (options?: { musicSeconds?: number; stems?: boolean }) => Promise<AudioTestReport>;
        __audioWav?: (kind: 'sfx' | 'mood', name: string, seconds?: number) => Promise<string>;
        __audioEngine?: AudioEngine;
    }
}

/** The effects, grouped by where the game uses them. */
const GROUPS: Array<{ title: string; names: SfxName[] }> = [
    { title: 'Interface', names: ['click', 'hover', 'tick', 'blip', 'ask', 'whoosh', 'pop', 'step'] },
    { title: 'The desk', names: ['paper', 'stampApprove', 'stampRefuse', 'correct', 'wrong', 'seal', 'press'] },
    { title: 'The town', names: ['coin', 'splash', 'thaw', 'freeze', 'gate', 'block', 'crane', 'ping'] },
    { title: 'Signals', names: ['bell', 'gong', 'alarm'] },
    { title: 'Jingles', names: ['chapter', 'fanfare'] },
];

const SFX_SET = new Set<string>(GROUPS.flatMap((group) => group.names));
const MOOD_SET = new Set<string>(MOOD_NAMES);

const INK = '#3b2f2a';
const PAPER = '#fffaf0';
const LINE = '#e6d6b8';
const SEAL = '#d6553b';
const MOSS = '#6f9a63';

const styles = {
    page: {
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background: '#fdf3df',
        color: INK,
        padding: '28px 20px 60px',
    },
    column: { maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 },
    title: { fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 600, margin: 0 },
    lead: { margin: '4px 0 0', opacity: 0.75, maxWidth: 640 },
    card: {
        background: PAPER,
        border: `1.5px solid ${LINE}`,
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: '0 2px 0 rgba(120, 90, 40, 0.08)',
    },
    heading: { fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, margin: '0 0 10px' },
    label: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.6, margin: '10px 0 6px' },
    row: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    button: {
        border: `1.5px solid ${LINE}`,
        background: '#fff',
        borderRadius: 12,
        padding: '8px 14px',
        cursor: 'pointer',
        fontWeight: 600,
    },
    primary: {
        border: `1.5px solid ${SEAL}`,
        background: SEAL,
        color: '#fff',
        borderRadius: 12,
        padding: '10px 18px',
        cursor: 'pointer',
        fontWeight: 700,
    },
    chosen: { border: `1.5px solid ${MOSS}`, background: MOSS, color: '#fff' },
    slider: { display: 'grid', gridTemplateColumns: '120px 1fr 48px', gap: 12, alignItems: 'center', margin: '6px 0' },
    meter: {
        position: 'relative',
        flex: '1 1 160px',
        height: 12,
        borderRadius: 6,
        background: '#efe3c8',
        overflow: 'hidden',
    },
    meterBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 0, background: MOSS, borderRadius: 6 },
    meterPeak: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, background: SEAL },
    table: { width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12.5 },
    cell: { textAlign: 'right', padding: '4px 8px', borderBottom: `1px solid ${LINE}` },
    name: { textAlign: 'left', padding: '4px 8px', borderBottom: `1px solid ${LINE}`, fontWeight: 600 },
} satisfies Record<string, CSSProperties>;

function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section style={styles.card}>
            <h2 style={styles.heading}>{title}</h2>
            {children}
        </section>
    );
}

function Slider(props: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    show: string;
    onChange(value: number): void;
}) {
    return (
        <label style={styles.slider}>
            <span>{props.label}</span>
            <input
                type="range"
                min={props.min}
                max={props.max}
                step={props.step}
                value={props.value}
                onChange={(event) => props.onChange(Number(event.target.value))}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{props.show}</span>
        </label>
    );
}

function base64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

/** Renders one effect or mood offline, as a WAV file. */
async function renderWav(kind: 'sfx' | 'mood', name: string, seconds?: number): Promise<Uint8Array<ArrayBuffer>> {
    if (kind === 'sfx' && SFX_SET.has(name)) {
        const buffer = await renderSfx(name as SfxName);
        return encodeWav(buffer, seconds);
    }
    if (kind === 'mood' && MOOD_SET.has(name)) return encodeWav(await renderMood(name as MusicMood, seconds ?? 8));
    throw new Error(`No ${kind} is called "${name}".`);
}

function Rows({ rows, kind }: { rows: Array<[string, Measure]>; kind: 'sfx' | 'mood' }) {
    const save = async (name: string, seconds: number) => {
        const url = URL.createObjectURL(new Blob([await renderWav(kind, name, seconds)], { type: 'audio/wav' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}.wav`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
        <>
            {rows.map(([name, m]) => (
                <tr key={name}>
                    <td style={styles.name}>{name}</td>
                    <td style={styles.cell}>{m.duration.toFixed(2)}</td>
                    <td style={styles.cell}>{m.body.toFixed(2)}</td>
                    <td style={styles.cell}>{m.peak.toFixed(3)}</td>
                    <td style={styles.cell}>{m.rms.toFixed(3)}</td>
                    <td style={styles.cell}>{(m.silent * 100).toFixed(0)}%</td>
                    <td style={styles.cell}>{(m.high * 100).toFixed(1)}%</td>
                    <td style={styles.cell}>{Math.round(m.centroid)}</td>
                    <td style={styles.cell}>
                        <button
                            type="button"
                            style={{ ...styles.button, padding: '2px 8px', fontSize: 12 }}
                            onClick={() => void save(name, kind === 'sfx' ? m.duration + 0.1 : 30)}
                        >
                            wav
                        </button>
                    </td>
                </tr>
            ))}
        </>
    );
}

export function AudioLab() {
    const engineRef = useRef<AudioEngine | null>(null);
    const meterRef = useRef<HTMLDivElement>(null);
    const peakRef = useRef<HTMLDivElement>(null);
    const [enabled, setEnabled] = useState(false);
    const [mood, setMood] = useState<MusicMood | null>(null);
    const [muted, setMuted] = useState(false);
    const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
    const [sfxVolume, setSfxVolume] = useState(DEFAULT_SFX_VOLUME);
    const [pitch, setPitch] = useState(1);
    const [pan, setPan] = useState(0);
    const [report, setReport] = useState<AudioTestReport | null>(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        const engine = createAudio();
        engineRef.current = engine;
        window.__audioTest = runAudioTest;
        window.__audioWav = async (kind, name, seconds) => base64(await renderWav(kind, name, seconds));
        window.__audioEngine = engine;
        return () => {
            engine.dispose();
            engineRef.current = null;
            delete window.__audioTest;
            delete window.__audioWav;
            delete window.__audioEngine;
        };
    }, []);

    // The output meter: the bar follows the average level, the tick the peak.
    useEffect(() => {
        if (!enabled) return undefined;
        let frame = 0;
        let held = 0;
        const draw = () => {
            const level = engineRef.current?.level?.() ?? { peak: 0, rms: 0 };
            held = Math.max(level.peak, held * 0.96);
            if (meterRef.current) meterRef.current.style.width = `${Math.min(100, level.rms * 250)}%`;
            if (peakRef.current) peakRef.current.style.left = `${Math.min(100, held * 100)}%`;
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, [enabled]);

    const enable = async () => {
        const engine = engineRef.current;
        if (!engine) return;
        await engine.unlock();
        setEnabled(engine.unlocked);
        if (engine.unlocked) engine.play('click');
    };

    const play = (name: SfxName) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (!engine.unlocked) void enable().then(() => engine.play(name, { pitch, pan }));
        else engine.play(name, { pitch, pan });
    };

    /** A line of dialogue as the game speaks it: one blip every few letters, pitched by the letter. */
    const speak = () => {
        const line = 'Entrance is restricted. Show me your papers, please.';
        let index = 0;
        const timer = setInterval(() => {
            const letter = line[index];
            index += 2;
            if (letter === undefined) clearInterval(timer);
            else if (/[a-z]/i.test(letter))
                engineRef.current?.play('blip', {
                    pitch: pitch * (0.85 + ((letter.toLowerCase().charCodeAt(0) - 97) % 7) * 0.05),
                });
        }, 62);
    };

    const chooseMood = (next: MusicMood | null) => {
        const engine = engineRef.current;
        if (!engine) return;
        if (next) engine.setMood(next);
        else engine.stopMusic();
        setMood(next);
        if (!engine.unlocked) void enable();
    };

    const test = async () => {
        setTesting(true);
        try {
            setReport(await runAudioTest());
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={styles.page} data-audio-lab>
            <div style={styles.column}>
                <header>
                    <h1 style={styles.title}>Sound lab</h1>
                    <p style={styles.lead}>
                        Every effect and every mood of the game, made in the browser from oscillators, noise and plucked
                        strings. No audio files.
                    </p>
                </header>

                <Card title="Sound">
                    <div style={styles.row}>
                        <button
                            type="button"
                            style={enabled ? { ...styles.button, ...styles.chosen } : styles.primary}
                            onClick={() => void enable()}
                        >
                            {enabled ? 'Sound is on' : 'Enable sound'}
                        </button>
                        <label style={{ ...styles.row, gap: 6 }}>
                            <input
                                type="checkbox"
                                checked={muted}
                                onChange={(event) => {
                                    setMuted(event.target.checked);
                                    engineRef.current?.setMuted(event.target.checked);
                                }}
                            />
                            Mute
                        </label>
                        <div style={styles.meter} title="Output level: the bar is the average, the tick the peak">
                            <div ref={meterRef} style={styles.meterBar} />
                            <div ref={peakRef} style={styles.meterPeak} />
                        </div>
                    </div>
                    <Slider
                        label="Music volume"
                        value={musicVolume}
                        min={0}
                        max={1}
                        step={0.01}
                        show={musicVolume.toFixed(2)}
                        onChange={(value) => {
                            setMusicVolume(value);
                            engineRef.current?.setMusicVolume(value);
                        }}
                    />
                    <Slider
                        label="Effects volume"
                        value={sfxVolume}
                        min={0}
                        max={1}
                        step={0.01}
                        show={sfxVolume.toFixed(2)}
                        onChange={(value) => {
                            setSfxVolume(value);
                            engineRef.current?.setSfxVolume(value);
                        }}
                    />
                </Card>

                <Card title="Music">
                    <div style={styles.row}>
                        {MOOD_NAMES.map((name) => (
                            <button
                                key={name}
                                type="button"
                                style={mood === name ? { ...styles.button, ...styles.chosen } : styles.button}
                                onClick={() => chooseMood(name)}
                            >
                                {name}
                            </button>
                        ))}
                        <button type="button" style={styles.button} onClick={() => chooseMood(null)}>
                            Stop
                        </button>
                    </div>
                    <p style={{ ...styles.lead, fontSize: 13 }}>
                        Choosing another mood cross-fades over two seconds. The stamps, the bell, the gong and the
                        jingles dip the music while they play.
                    </p>
                </Card>

                <Card title="Effects">
                    {GROUPS.map((group) => (
                        <div key={group.title}>
                            <div style={styles.label}>{group.title}</div>
                            <div style={styles.row}>
                                {group.names.map((name) => (
                                    <button key={name} type="button" style={styles.button} onClick={() => play(name)}>
                                        {name}
                                    </button>
                                ))}
                                {group.title === 'Interface' ? (
                                    <button
                                        type="button"
                                        style={{ ...styles.button, borderStyle: 'dashed' }}
                                        onClick={speak}
                                    >
                                        a line of blips
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                    <div style={{ marginTop: 14 }}>
                        <Slider
                            label="Pitch"
                            value={pitch}
                            min={0.5}
                            max={2}
                            step={0.01}
                            show={`×${pitch.toFixed(2)}`}
                            onChange={setPitch}
                        />
                        <Slider
                            label="Pan"
                            value={pan}
                            min={-1}
                            max={1}
                            step={0.05}
                            show={pan.toFixed(2)}
                            onChange={setPan}
                        />
                    </div>
                </Card>

                <Card title="Self-test">
                    <div style={styles.row}>
                        <button type="button" style={styles.button} disabled={testing} onClick={() => void test()}>
                            {testing ? 'Rendering…' : 'Render and measure everything'}
                        </button>
                        <span style={{ opacity: 0.7, fontSize: 13 }}>
                            Offline, through the game's own mixer at the default volumes. Needs no sound device.
                        </span>
                    </div>
                    {report ? (
                        <>
                            <p
                                style={{
                                    margin: '12px 0 8px',
                                    fontWeight: 700,
                                    color: report.problems.length ? SEAL : MOSS,
                                }}
                            >
                                {report.problems.length
                                    ? `${report.problems.length} thing(s) to look at`
                                    : 'All measures are within their limits.'}
                            </p>
                            {report.problems.map((problem) => (
                                <div key={problem} style={{ fontSize: 13 }}>
                                    {problem}
                                </div>
                            ))}
                            <p style={{ fontSize: 13, margin: '8px 0' }}>
                                Options on a blip: pitch 2 is {report.options.pitch.toFixed(2)} times brighter, pan −1
                                leaves {(report.options.pan * 100).toFixed(0)}% on the right, volume 0.5 plays at{' '}
                                {report.options.volume.toFixed(2)}.
                                {report.engine
                                    ? ` Scheduling a little at a time differs from all at once by ${report.engine.scheduler.toExponential(1)}; a bell dips the music to ${(Math.min(...report.engine.duck) * 100).toFixed(0)}%.`
                                    : ' This browser cannot pause an offline render, so the scheduler was not checked.'}
                            </p>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.name}>sound</th>
                                            <th style={styles.cell}>length s</th>
                                            <th style={styles.cell}>body s</th>
                                            <th style={styles.cell}>peak</th>
                                            <th style={styles.cell}>RMS</th>
                                            <th style={styles.cell}>silent</th>
                                            <th style={styles.cell}>&gt; 6 kHz</th>
                                            <th style={styles.cell}>centre Hz</th>
                                            <th style={styles.cell} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <Rows rows={Object.entries(report.effects)} kind="sfx" />
                                        <Rows rows={Object.entries(report.moods)} kind="mood" />
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : null}
                </Card>
            </div>
        </div>
    );
}
