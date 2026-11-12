'use client';

/**
 * The game's shell: starts the stage and the director on a canvas, then lays
 * the interface over it.
 */
import './game.css';
import './manager.css';

import { useEffect, useRef, useState } from 'react';

import { createAudio } from '../audio/audio.ts';
import { Game } from '../core/game.ts';
import { disposePortraitStudio } from '../scene/portrait.ts';
import { Stage, type Quality } from '../scene/stage.ts';
import { scenarioDef } from '../sim/scenarios.ts';
import { GameContext } from './context.tsx';
import { Desk } from './Desk.tsx';
import { ChapterCard, Feed, Narration, PlaceCard, TopBar } from './Hud.tsx';
import { controlOwnsKey, watchPointerFocus } from './keys.ts';
import { ScenarioPicker } from './manager/Cards.tsx';
import { ManagerLayer } from './manager/Layer.tsx';
import { Summary, Title } from './Screens.tsx';

export function GameShell() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const [game, setGame] = useState<Game | null>(null);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return undefined;
        let stage: Stage | undefined;
        let made: Game | undefined;
        let cancelled = false;
        const params = new URLSearchParams(window.location.search);
        void (async () => {
            try {
                await Promise.all([
                    document.fonts.load('600 32px "Fredoka Variable"'),
                    document.fonts.load('600 16px "Nunito Variable"'),
                ]);
            } catch {
                // The game still works with fallback fonts.
            }
            if (cancelled) return;
            try {
                const quality = params.get('quality') as Quality | null;
                stage = new Stage(
                    canvas,
                    overlay,
                    quality === 'low' || quality === 'medium' || quality === 'high' ? quality : 'high',
                );
            } catch (error) {
                setFailed(error instanceof Error ? error.message : 'WebGL is not available.');
                return;
            }
            const audio = createAudio();
            const created = new Game(stage, overlay, audio, {
                muted: params.get('mute') === '1',
                speed: Number(params.get('speed')) || 1,
            });
            if (params.get('mute') === '1') audio.setMuted(true);
            made = created;
            stage.start();
            setGame(created);
            (window as unknown as { __gk: unknown }).__gk = { game: created, stage, world: created.world, ready: true };
            // A link can start the day directly: at a chapter, or on autoplay for a projector. Or a
            // scenario of manager mode: ?manager=<scenario id>.
            const chapter = params.get('chapter') ?? undefined;
            const autoplay = params.get('autoplay') === '1';
            const scenario = scenarioDef(params.get('manager') ?? '');
            if (scenario) {
                created.beginManager(scenario.id);
            } else if (chapter || autoplay || params.get('start') === '1') {
                created.begin({ chapter, tour: params.get('tour') === '1', autoplay, fromLink: true });
            }
        })();
        return () => {
            cancelled = true;
            delete (window as unknown as { __gk?: unknown }).__gk;
            made?.dispose();
            disposePortraitStudio();
            stage?.dispose();
            setGame(null);
        };
    }, []);

    useEffect(() => {
        if (!game) return undefined;
        const onKey = (event: KeyboardEvent): void => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            const key = event.key.toLowerCase();
            // Letters typed into a field (a select picking a name, say) are the field's, not shortcuts.
            if ((event.target as Element | null)?.closest('input, select, textarea')) return;
            if (key === ' ' || key === 'enter') {
                // A button the player tabbed to gets the key. One that only kept the focus from a
                // click does not: Space and Enter stay the game's keys, so a speed or mute button
                // clicked a moment ago never fires again.
                if (controlOwnsKey(event)) return;
                // While the game waits to move on, Space and Enter do that. While the gate is
                // checking, they hurry it.
                if (game.advance()) event.preventDefault();
            } else if (key === 'p') {
                // Running the venue has no autoplay.
                if (game.store.get().mode !== 'manager') game.patchSettings({ autoplay: !game.settings.autoplay });
            } else if (key === 'm') game.patchSettings({ muted: !game.settings.muted });
        };
        // Browsers start sound only after a click or a key press: take the first one, wherever it lands.
        const unlock = (): void => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
            void game.audio.unlock().then(() => game.store.set({ sound: game.audio.unlocked }));
        };
        watchPointerFocus();
        // A click anywhere finishes the line being spoken.
        const hurry = (): void => game.hurry();
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', hurry);
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('pointerdown', hurry);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [game]);

    return (
        <div className="gk-root">
            <canvas ref={canvasRef} className="gk-canvas" />
            <div ref={overlayRef} className="gk-overlay" />
            {failed && (
                <div className="gk-veil">
                    <div className="gk-chapter">
                        <h2>This game needs WebGL</h2>
                        <p className="gk-chapter__question">Your browser could not start the 3D view: {failed}</p>
                    </div>
                </div>
            )}
            {!game && !failed && (
                <div className="gk-loading">
                    <div className="gk-loading__dot" />
                    <span>Raising the island…</span>
                </div>
            )}
            {game && (
                <GameContext.Provider value={game}>
                    <TopBar />
                    <Title />
                    <Narration />
                    <Desk />
                    <ChapterCard />
                    <PlaceCard />
                    <Feed />
                    <Summary />
                    <ManagerLayer />
                    <ScenarioPicker />
                </GameContext.Provider>
            )}
        </div>
    );
}
