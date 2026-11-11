'use client';

/** Gives the interface the game and its current state. */
import { createContext, useContext, useSyncExternalStore } from 'react';

import type { Game } from '../core/game.ts';
import type { GameState } from '../core/state.ts';

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
    const game = useContext(GameContext);
    if (!game) throw new Error('the game is not ready');
    return game;
}

/** The game's state; the component re-renders when it changes. */
export function useGameState(): GameState {
    const game = useGame();
    return useSyncExternalStore(game.store.subscribe, game.store.get, game.store.get);
}
