'use client';

/**
 * The modelling lab: shows one or more places on the island, alone, for
 * look-dev and screenshots. Open it with `?lab=<name>[,<name>]`:
 *
 *   ?lab=exchange            the place, framed by its camera view
 *   ?lab=market              the market quarter with its three pools open
 *   &at=x,y,z&span=n         a custom camera target and span instead
 *   &day=0..1                time of day (0 dawn, 0.4 noon, 0.8 dusk, 1 night)
 *   &island=0                hide the island and garden
 *   &cast=1                  stand two people at the door, for scale
 *
 * `window.__gk` exposes `{ stage, places, extra, ready }` so a script can
 * call a place's methods before a screenshot.
 */
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';

import type { V3 } from '../scene/kit.ts';
import { Stage } from '../scene/stage.ts';
import { Character, LOOKS } from '../world/character.ts';
import { type Island, createIsland } from '../world/island.ts';
import { VIEWS, type ViewId } from '../world/layout.ts';
import type { Place } from '../world/place.ts';

interface Loaded {
    places: Record<string, Place>;
    extra?: Record<string, { group: THREE.Object3D; update?(dt: number, time: number): void }>;
    view: ViewId;
    /** Readies the stage (and the island, if shown) for places beyond the town, and frames them in place of `view`. */
    frame?: (stage: Stage, island: Island | undefined) => { target: THREE.Vector3 | V3; span: number };
}

const LOADERS: Record<string, () => Promise<Loaded>> = {
    bureau: async () => ({ places: { bureau: (await import('../world/bureau.ts')).createBureau() }, view: 'bureau' }),
    issuer: async () => ({ places: { issuer: (await import('../world/issuer.ts')).createIssuer() }, view: 'issuer' }),
    council: async () => ({
        places: { council: (await import('../world/council.ts')).createCouncil() },
        view: 'council',
    }),
    exchange: async () => {
        const module = await import('../world/exchange.ts');
        const exchange = module.createExchange();
        const haltBoard = module.createHaltBoard();
        const crane = module.createCrane();
        crane.group.position.copy(exchange.anchors.launch).lerp(haltBoard.anchors.perch, 0.5);
        crane.group.position.y += 1.2;
        return { places: { exchange, haltBoard }, extra: { crane }, view: 'exchange' };
    },
    archive: async () => ({
        places: { archive: (await import('../world/archive.ts')).createArchive() },
        view: 'chain',
    }),
    indexer: async () => ({
        places: { indexer: (await import('../world/indexer.ts')).createIndexer() },
        view: 'chain',
    }),
    chain: async () => ({ places: { chain: (await import('../world/chain.ts')).createChain() }, view: 'chain' }),
    gate: async () => ({ places: { gate: (await import('../world/gate.ts')).createGate() }, view: 'gate' }),
    pool: async () => ({ places: { pool: (await import('../world/pool.ts')).createPool() }, view: 'pool' }),
    market: async () => {
        const [{ createAnnex }, { createPool }, layout, { STOCKS }] = await Promise.all([
            import('../world/annex.ts'),
            import('../world/pool.ts'),
            import('../world/layout.ts'),
            import('../sim/park.ts'),
        ]);
        const places: Record<string, Place> = {};
        for (const stock of ['TSB', 'TSC', 'TSD'] as const) {
            const pool = createPool({ stock });
            const { opening } = STOCKS[stock];
            pool.setStage('open', true);
            pool.setVaultFrozen(false, true);
            pool.setVaults(100, 100 * opening, 100);
            pool.setBoard(
                `1 ${stock} = ${opening.toFixed(2)} USDC`,
                `100 ${stock} · ${Math.round(100 * opening)} USDC`,
                'open',
            );
            places[`pool:${stock}`] = pool;
        }
        const { x0, x1, z0, z1 } = layout.ANNEX;
        return {
            places,
            extra: { annex: createAnnex() },
            view: 'pool',
            frame: (stage, island) => {
                stage.setShadowFrame(layout.MANAGER_SHADOW.target, layout.MANAGER_SHADOW.reach);
                island?.makeRoom(true);
                stage.panLimit = { x: 30, y: 20 };
                return stage.fitPoints(
                    [
                        [x0, 2, z0],
                        [x1, 2, z0],
                        [x1, -3, z1],
                        [x0, -3, z1],
                    ],
                    0.06,
                );
            },
        };
    },
};

export function Lab({ names }: { names: string[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return undefined;
        let stage: Stage | undefined;
        let cancelled = false;
        void (async () => {
            await document.fonts.load('600 32px "Fredoka Variable"');
            const params = new URLSearchParams(window.location.search);
            const wanted = names.includes('all') ? Object.keys(LOADERS) : names;
            const loaded = await Promise.all(
                wanted.filter((name) => LOADERS[name]).map((name) => (LOADERS[name] as () => Promise<Loaded>)()),
            );
            if (cancelled) return;
            stage = new Stage(canvas, overlay);
            const activeStage = stage;
            let island: Island | undefined;
            if (params.get('island') !== '0') {
                const shown = createIsland();
                activeStage.scene.add(shown.group);
                activeStage.onUpdate((dt, time) => shown.update(dt, time));
                island = shown;
            }
            const places: Record<string, Place> = {};
            const extra: Record<string, unknown> = {};
            const cast: Character[] = [];
            for (const item of loaded) {
                for (const [name, place] of Object.entries(item.places)) {
                    places[name] = place;
                    activeStage.scene.add(place.group);
                    if (place.update) activeStage.onUpdate((dt, time) => place.update?.(dt, time));
                    if (params.get('cast') === '1' && place.anchors.door) {
                        const a = new Character(LOOKS.trader1).place(place.anchors.door.clone().setY(0), 0.6);
                        const b = new Character(LOOKS.broker).place(
                            place.anchors.door.clone().setY(0).add({ x: 0.9, y: 0, z: 0.3 }),
                            -0.4,
                        );
                        cast.push(a, b);
                        activeStage.scene.add(a.root, b.root);
                    }
                }
                for (const [name, thing] of Object.entries(item.extra ?? {})) {
                    extra[name] = thing;
                    activeStage.scene.add(thing.group);
                    if (thing.update) activeStage.onUpdate((dt, time) => thing.update?.(dt, time));
                }
            }
            activeStage.onUpdate((dt) => {
                for (const who of cast) who.update(dt);
            });
            const first = loaded[0];
            const viewId =
                (params.get('view') as ViewId | null) ?? (names.includes('all') ? 'town' : (first?.view ?? 'town'));
            const framed = params.get('view') ? undefined : first?.frame?.(activeStage, island);
            const view = framed ?? VIEWS[viewId] ?? VIEWS.town;
            const at = params.get('at')?.split(',').map(Number);
            const span =
                Number(params.get('span')) ||
                (viewId === 'town' && !framed ? activeStage.spanToFit(24) : view.span);
            activeStage.look(
                {
                    target: at && at.length === 3 ? [at[0] as number, at[1] as number, at[2] as number] : view.target,
                    span,
                },
                true,
            );
            const day = params.get('day');
            if (day) activeStage.setDaytime(Number(day), true);
            activeStage.start();
            (window as unknown as { __gk: unknown }).__gk = { stage: activeStage, places, extra, cast, ready: true };
        })();
        return () => {
            cancelled = true;
            stage?.dispose();
        };
    }, [names]);

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            <div
                ref={overlayRef}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
            />
        </div>
    );
}
