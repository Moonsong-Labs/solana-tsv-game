'use client';

import { useEffect, useState } from 'react';

import { AudioLab } from './audio/AudioLab.tsx';
import { Lab } from './lab/Lab.tsx';
import { GameShell } from './ui/GameShell.tsx';

/** The app's root: the game, or a lab when the address asks for one. */
export function GameRoot() {
    const [lab, setLab] = useState<string[] | null | undefined>(undefined);
    useEffect(() => {
        const value = new URLSearchParams(window.location.search).get('lab');
        setLab(value ? value.split(',') : null);
    }, []);
    if (lab === undefined) return null;
    if (lab?.includes('audio')) return <AudioLab />;
    if (lab) return <Lab names={lab} />;
    return <GameShell />;
}
