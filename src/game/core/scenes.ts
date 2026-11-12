/**
 * The scripted moments: the opening fly-over, the five setup steps and every
 * event of the day. Each is a short piece of choreography over the town:
 * camera, people, tokens in flight, sounds and a line or two of narration.
 */
import * as THREE from 'three';

import { CAST, RUSH, type SceneDef, type SetupStep } from '../sim/campaign.ts';
import { amount, money } from '../sim/format.ts';
import { bandWidth, judge, settle } from '../sim/rules.ts';
import type { WalletId } from '../sim/types.ts';
import type { Role } from '../world/council.ts';
import { SPOTS, queueSpot } from '../world/layout.ts';
import type { Game } from './game.ts';
import { run } from './timeline.ts';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** The clock on the day's last shot: evening, long after the closing bell. */
const EVENING = 19 * 60 + 30;

/**
 * Marks a promise that is started now and awaited a few lines later. If the
 * day is restarted in between, its rejection has a listener and is not
 * reported as unhandled; awaiting it still throws.
 */
function later<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => {});
    return promise;
}

// ----- The opening fly-over -----

const TOUR: ReadonlyArray<{ view: Parameters<Game['look']>[0]; tags: string[]; caption: string }> = [
    {
        view: 'town',
        tags: [],
        caption:
            'This town is a trading venue for one tokenized stock. Everything in it stands for a part of the real system: built, in review or planned.',
    },
    {
        view: 'issuer',
        tags: ['issuer'],
        caption: 'The issuer mints the stock and keeps control of it.',
    },
    {
        view: 'bureau',
        tags: ['bureau'],
        caption: 'The credential bureau checks who people are, and gives the verified a credential.',
    },
    {
        view: 'venue',
        tags: ['gate', 'pool'],
        caption: 'The pool trades the stock against dollars. The gate is its checks: that is you.',
    },
    {
        view: 'exchange',
        tags: ['exchange', 'haltBoard', 'council'],
        caption: 'The exchange is the primary market. The council governs the venue.',
    },
    {
        view: 'chain',
        tags: ['chain', 'indexer', 'archive'],
        caption: 'Every decision lands on the chain. The indexer and the archive record it.',
    },
];

export async function playTour(g: Game): Promise<void> {
    g.audio.setMood('morning');
    g.stage.setDaytime(0.02);
    // The fly-over shows the venue as it will stand once it is open, the same town as the title's:
    // a map of the whole system. The prologue then builds it from an empty lot.
    g.showOpenTown();
    for (let i = 0; i < TOUR.length; i += 1) {
        const stop = TOUR[i] as (typeof TOUR)[number];
        g.store.set({ phase: 'tour', tour: { caption: stop.caption, index: i, total: TOUR.length } });
        g.look(stop.view);
        g.overlay.showTags(stop.tags);
        if (i > 0) g.audio.play('whoosh', { volume: 0.5 });
        await g.t.wait(1.4 + stop.caption.split(' ').length * 0.2);
    }
    g.overlay.showTags('none');
    g.endSkip();
    g.store.set({ tour: undefined });
}

// ----- The setup steps -----

/** Loads a venue or issuer action on the chain: a plum parcel from a place to the open block. */
export function adminTx(g: Game, from: THREE.Vector3): void {
    const { chain } = g.places;
    run(async () => {
        await g.t.guard(
            g.world.fx.fly('admin', from, () => chain.openBlock(), { duration: 1.3, height: 3.4, trail: '#d9c7f5' }),
        );
        chain.load('admin');
        g.audio.play('pop', { volume: 0.7 });
    });
}

export async function playSetupStep(g: Game, step: SetupStep, apply: () => void): Promise<void> {
    const { issuer, pool, gate, council } = g.places;
    const fx = g.world.fx;
    // The button floats over the middle of the place, not its highest point, so it stays in view.
    const site = {
        issuer: g.world.site('issuer', 4.4),
        pool: pool.anchors.water.clone().setY(2.6),
        gate: gate.anchors.book.clone().setY(3),
        council: g.world.site('council', 4.6),
    }[step.site];
    const view = ({ issuer: 'issuer', pool: 'pool', gate: 'gate', council: 'council' } as const)[step.site];
    g.look(step.id === 'thaw-vault' ? 'town' : view, step.id === 'thaw-vault' ? { span: 24 } : {});
    g.overlay.action('setup', site, step.action, () => g.fire('setup'));

    // One wrong move is on offer: funding the pool while its vault is still frozen.
    let warned = false;
    if (step.id === 'thaw-vault') {
        g.overlay.action(
            'wrong',
            pool.anchors.water.clone().add(v(0, 0.9, 0)),
            'Fund the pool',
            () => {
                if (warned) return;
                warned = true;
                fx.burst(pool.anchors.stockVault, 'ice', 10);
                g.world.find('yuki')?.act('shake');
                g.audio.play('wrong');
                g.overlay.float(pool.anchors.stockVault, 'The vault is frozen', 'ice');
                g.store.set((state) => ({
                    setup: state.setup
                        ? {
                              ...state.setup,
                              error: "Funding fails: the pool's stock vault is still frozen, and only the issuer can thaw it. (The token program answers AccountFrozen.)",
                          }
                        : undefined,
                }));
            },
            'wrong',
        );
    }

    await g.input('setup', 1.9);
    g.overlay.clearAction();
    g.store.set((state) => ({ setup: state.setup ? { ...state.setup, busy: true, error: undefined } : undefined }));
    const issuerNpc = g.world.find('issuer');

    switch (step.id) {
        case 'create-stock': {
            issuerNpc?.act('stamp');
            await g.t.wait(0.3);
            issuer.press();
            g.audio.play('press');
            await g.t.wait(0.55);
            apply();
            for (let i = 0; i < 3; i += 1) {
                void fx
                    .fly(
                        'frozenStock',
                        issuer.anchors.output,
                        issuer.anchors.output.clone().add(v(0.9 + i * 0.5, 0.3, 0.9 - i * 0.2)),
                        { duration: 0.7, height: 1.2 },
                    )
                    .then(() => g.audio.play('freeze', { volume: 0.5 }));
                await g.t.wait(0.22);
            }
            g.overlay.float(issuer.anchors.output, 'Test Stock A · frozen by default', 'ice', 2.6);
            issuerNpc?.setMood('happy');
            adminTx(g, issuer.anchors.output);
            await g.t.wait(1.2);
            break;
        }
        case 'create-pool': {
            // On main the liquidity provider who creates the pool is the one who funds it later.
            const yuki = g.visitor('yuki');
            yuki.place(SPOTS.exitEnd, Math.PI);
            await g.t.guard(yuki.walkTo([SPOTS.exitStart, SPOTS.lpSpot], 3.2));
            yuki.face_(pool.anchors.water);
            yuki.act('wave', 0.9);
            await g.t.wait(0.5);
            apply();
            g.audio.play('pop');
            fx.burst(pool.anchors.water, 'dust', 18);
            await g.t.wait(0.5);
            fx.burst(pool.anchors.stockVault, 'ice', 8);
            g.audio.play('freeze');
            g.overlay.float(pool.anchors.stockVault, 'Stock vault: frozen', 'ice', 2.4);
            adminTx(g, pool.anchors.board);
            await g.t.wait(1.3);
            break;
        }
        case 'set-policy': {
            await g.t.guard(
                fx.fly('scroll', council.anchors.steps.clone().setY(1.4), gate.anchors.book, {
                    duration: 1.3,
                    height: 3,
                    trail: '#fff3d6',
                }),
            );
            apply();
            g.audio.play('paper');
            fx.burst(gate.anchors.book, 'sparkle', 10);
            g.overlay.float(gate.anchors.book, 'Trade policy v1', 'gold', 2.4);
            adminTx(g, gate.anchors.book);
            await g.t.wait(1.2);
            break;
        }
        case 'thaw-vault': {
            issuerNpc?.act('stamp');
            issuer.press();
            g.audio.play('press');
            await g.t.wait(0.5);
            await g.t.guard(
                fx.fly('key', issuer.anchors.output, pool.anchors.stockVault, {
                    duration: 1.5,
                    height: 4,
                    trail: '#ffe08a',
                    scale: 1.5,
                }),
            );
            apply();
            g.audio.play('thaw');
            fx.burst(pool.anchors.stockVault, 'ice', 22);
            g.overlay.float(pool.anchors.stockVault, 'Vault thawed', 'good', 2.4);
            g.look('pool');
            adminTx(g, pool.anchors.stockVault);
            await g.t.wait(1.4);
            break;
        }
        case 'fund-pool': {
            const yuki = g.visitor('yuki');
            // She has waited by the pool since she created it; when the day starts here, she walks in.
            if (yuki.position.distanceTo(v(...SPOTS.lpSpot)) > 1) {
                yuki.place(SPOTS.exitEnd, Math.PI);
                await g.t.guard(yuki.walkTo([SPOTS.exitStart, SPOTS.lpSpot], 3));
            }
            yuki.face_(pool.anchors.water);
            run(() =>
                g.speak(
                    yuki,
                    'visitor',
                    'One hundred shares, twelve hundred forty dollars. Here it comes!',
                    CAST.yuki.pitch,
                    'Yuki',
                ),
            );
            await g.t.wait(0.5);
            const hands = (): THREE.Vector3 => yuki.hands();
            for (let i = 0; i < 3; i += 1) {
                void fx.fly('stock', hands, pool.anchors.water, { duration: 0.7, height: 1.4 });
                void fx.fly('usdc', hands, pool.anchors.water, { duration: 0.85, height: 1.8 });
                await g.t.wait(0.28);
                g.audio.play('coin', { pitch: 1 + i * 0.08 });
            }
            await g.t.wait(0.5);
            apply();
            pool.splash();
            fx.burst(pool.anchors.water, 'splash', 22);
            g.audio.play('splash');
            await g.t.wait(0.4);
            await g.t.guard(fx.fly('lp', pool.anchors.water, hands, { duration: 0.8, trail: '#ffe08a' }));
            g.overlay.float(yuki.headTop(), '+11.14 LP', 'gold');
            yuki.setMood('happy').act('cheer');
            fx.burst(pool.anchors.board, 'sparkle', 14);
            g.audio.play('correct');
            adminTx(g, pool.anchors.water);
            await g.t.wait(1.3);
            g.sendOff('yuki', [SPOTS.exitStart, SPOTS.exitEnd]);
            break;
        }
    }
}

// ----- The day's events -----

/** A quick, unattended trip through the gate for a scripted fill. */
async function scriptedFill(g: Game, who: WalletId, item: (typeof RUSH)[number]): Promise<void> {
    const { gate } = g.places;
    const { id, request } = item;
    const person = g.visitor(who);
    await g.t.guard(person.walkTo([SPOTS.window], 3.4));
    g.world.find('keeper')?.act('stamp');
    await g.t.wait(0.3);
    g.audio.play('stampApprove', { volume: 0.7 });
    await g.t.guard(person.walkTo([SPOTS.barrier], 3.4));
    for (let step = 1; step <= 5; step += 1)
        gate.setLamp(step, step === 1 || step === 3 || step === 4 ? 'pass' : 'off');
    gate.setBarrier(true);
    g.audio.play('gate', { volume: 0.6 });
    g.venue.now = item.time;
    const truth = judge(g.venue, request);
    void g.record(id, request, truth).catch(() => {});
    await g.t.guard(person.walkTo([SPOTS.pastGate, SPOTS.poolRim], 3.4));
    await g.settleFx(request, truth.quote, person);
    settle(g.venue, request, truth.quote);
    g.syncBoard();
    g.touch();
    gate.setBarrier(false);
    for (let step = 1; step <= 5; step += 1) gate.setLamp(step, 'idle');
    g.sendOff(who, [SPOTS.exitStart, SPOTS.exitEnd], 3);
}

/** Flies one of the halt poster's cranes from the exchange to the halt board. */
export async function sendCrane(g: Game, note: 'halt' | 'resume' | 'heartbeat', index = 0): Promise<void> {
    const { exchange, haltBoard } = g.places;
    const crane = g.world.cranes[index];
    if (!crane) return;
    const from = exchange.anchors.launch;
    const to = haltBoard.anchors.perch;
    crane.setNote(note);
    crane.group.visible = true;
    crane.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    g.audio.play('crane');
    try {
        await g.t.tween(1.5, (t) => {
            const k = t * t * (3 - 2 * t);
            crane.group.position.lerpVectors(from, to, k);
            crane.group.position.y += Math.sin(Math.PI * t) * 1.6;
        });
    } finally {
        crane.group.visible = false;
    }
}

/** A council role gathers its approvals, one lantern at a time. */
export async function vote(g: Game, role: Role, threshold: number): Promise<void> {
    const { council } = g.places;
    const signer = g.world.find(`signer:${role}`);
    for (let i = 1; i <= threshold; i += 1) {
        council.setVotes(role, i, 3);
        signer?.act('wave', 0.7);
        g.audio.play('ping', { pitch: 0.9 + i * 0.12 });
        await g.t.wait(0.7);
    }
}

export async function playScene(g: Game, scene: SceneDef, apply: () => void): Promise<void> {
    const { bureau, gate, pool, council, exchange, haltBoard, issuer, chain } = g.places;
    const fx = g.world.fx;
    const officer = g.world.find('officer');

    switch (scene.id) {
        case 'rush': {
            g.look('venue', { span: 16 });
            const [sora, ito] = RUSH;
            if (!sora || !ito) break;
            const first = later(scriptedFill(g, 'sora', sora));
            await g.caption(0);
            await first;
            const second = later(scriptedFill(g, 'ito', ito));
            await g.caption(1);
            await second;
            apply();
            break;
        }
        case 'jordan-kyc': {
            const jordan = g.visitor('jordan');
            jordan.setMood('neutral').act('idle');
            g.look('bureau');
            g.overlay.showTags(['bureau']);
            const walking = jordan.walkTo([SPOTS.bureauTurn, SPOTS.bureauPath, SPOTS.bureauDoor], 3.2);
            await g.caption(0);
            await g.t.guard(walking);
            if (officer) jordan.face_(officer.position);
            officer?.act('talk', 1.6);
            await g.t.wait(0.7);
            officer?.act('stamp');
            bureau.stamp('issue');
            await g.t.wait(0.42);
            g.audio.play('seal');
            fx.burst(bureau.anchors.seal, 'sparkle', 14);
            apply();
            await g.t.guard(
                fx.fly('credential', bureau.anchors.seal, () => jordan.headTop(), {
                    duration: 1,
                    height: 1.6,
                    trail: '#cdd6ff',
                    scale: 1.3,
                }),
            );
            g.overlay.float(jordan.headTop(), 'Credential issued', 'good', 2.2);
            jordan.setMood('happy').act('cheer');
            await g.caption(1);
            g.audio.play('thaw');
            fx.burst(jordan.headTop().add(v(0, -0.6, 0)), 'ice', 18);
            g.overlay.float(jordan.headTop(), 'Account thawed', 'ice', 2.2);
            await g.caption(2);
            g.overlay.showTags('none');
            void jordan
                .walkTo([SPOTS.bureauPath, SPOTS.bureauTurn, queueSpot(0)], 3.2)
                .then(() => jordan.turn(Math.PI / 2));
            jordan.setMood('neutral');
            await g.t.wait(0.8);
            break;
        }
        case 'revoke-sora': {
            const sora = g.visitor('sora');
            void sora.walkTo([queueSpot(0)], 2.8).then(() => sora.turn(Math.PI / 2));
            g.look('bureau');
            g.overlay.showTags(['bureau']);
            officer?.act('shake');
            await g.t.wait(0.6);
            officer?.act('stamp');
            bureau.stamp('revoke');
            await g.t.wait(0.42);
            g.audio.play('seal', { pitch: 0.8 });
            g.audio.play('wrong', { volume: 0.6 });
            await g.caption(0);
            apply();
            g.look('gate');
            await g.t.guard(
                fx.fly('revocation', bureau.anchors.seal, () => sora.headTop(), {
                    duration: 1.3,
                    height: 3,
                    trail: '#ffc9c2',
                    scale: 1.3,
                }),
            );
            g.overlay.float(sora.headTop(), 'Credential revoked', 'bad', 2.4);
            sora.setMood('surprised').act('shake');
            g.overlay.showTags('none');
            await g.caption(1);
            g.overlay.float(sora.headTop(), 'Account: still thawed', 'ice', 2.4);
            sora.setMood('neutral');
            await g.caption(2);
            break;
        }
        case 'policy-v2': {
            g.look('gate');
            await g.t.guard(
                fx.fly('scroll', council.anchors.steps.clone().setY(1.4), gate.anchors.book, {
                    duration: 1.4,
                    height: 3.2,
                    trail: '#fff3d6',
                }),
            );
            apply();
            gate.setPolicy(2);
            g.audio.play('paper');
            fx.burst(gate.anchors.book, 'sparkle', 12);
            g.overlay.float(gate.anchors.book, 'Trade policy v2 · brokers: Kenji', 'gold', 2.8);
            adminTx(g, gate.anchors.book);
            await g.caption(0);
            await g.caption(1);
            break;
        }
        case 'noon': {
            const ito = g.visitor('ito');
            void ito.walkTo([queueSpot(0)], 2.4).then(() => ito.turn(Math.PI / 2));
            // On the clock as it strikes, then on Mr. Ito, whose credential has just run out.
            g.look('clock');
            g.stage.setDaytime(0.42);
            exchange.ringBell();
            g.audio.play('bell');
            apply();
            const striking = later(g.caption(0));
            await g.t.wait(1.7);
            g.look('gate');
            await striking;
            g.overlay.float(ito.headTop(), 'Credential expired 12:00', 'bad', 2.6);
            ito.setMood('worried');
            g.audio.play('tick');
            await g.caption(1);
            ito.setMood('neutral');
            break;
        }
        case 'halt': {
            g.look('halt');
            g.overlay.showTags(['exchange', 'haltBoard']);
            // The price climbs to the top of its band and sticks there.
            const pinned = `TSA ${money(g.venue.market.price * (1 + bandWidth(g.venue.now)))}`;
            exchange.setStatus('limit');
            exchange.setTicker(pinned, 'LIMIT STATE · at the upper band');
            g.venue.market.status = 'limit';
            g.touch();
            g.audio.play('alarm', { volume: 0.6 });
            await g.caption(0);
            // Fifteen seconds in a Limit State, shown as a short countdown.
            for (let left = 15; left > 0; left -= 3) {
                exchange.setTicker(pinned, `LIMIT STATE · pause in ${left} s`);
                g.audio.play('tick');
                await g.t.wait(0.45);
            }
            exchange.setStatus('halted');
            exchange.setTicker('TSA HALTED', 'LUDP · trading pause');
            // The exchange has halted; the on-chain record follows a moment later.
            g.venue.market.status = 'halted';
            g.venue.market.haltCode = 'LUDP';
            g.touch();
            exchange.ringBell();
            g.audio.play('bell');
            g.audio.setMood('tense');
            await g.caption(1);
            const flight = later(sendCrane(g, 'halt'));
            await flight;
            void g.t
                .guard(
                    fx.fly('input', haltBoard.anchors.perch, () => chain.openBlock(), {
                        duration: 1.1,
                        height: 2.6,
                        trail: '#cfe9ff',
                    }),
                )
                .then(
                    () => chain.load('input'),
                    () => {},
                );
            apply();
            haltBoard.setState('halted');
            g.audio.play('alarm');
            fx.ring(haltBoard.anchors.door, '#ee5d50', 2.2);
            g.overlay.float(haltBoard.anchors.perch, 'On-chain record: HALTED', 'bad', 2.8);
            await g.caption(2);
            g.overlay.showTags('none');
            break;
        }
        case 'quiet': {
            g.look('halt');
            g.overlay.showTags(['exchange', 'haltBoard']);
            exchange.setStatus('trading');
            g.venue.market.status = 'trading';
            g.syncTicker();
            exchange.ringBell();
            g.audio.play('bell', { pitch: 1.12 });
            await sendCrane(g, 'resume');
            haltBoard.setState('trading');
            haltBoard.setFreshness(1);
            g.audio.play('correct');
            g.venue.market.record = 'trading';
            g.touch();
            await g.caption(0);
            // The poster falls silent: the evidence ages until it expires.
            const poster = g.world.find('bot:poster');
            poster?.setMood('sad').act('slump');
            g.overlay.float(poster?.headTop() ?? haltBoard.anchors.perch, 'zzz…', 'info', 3);
            // Close on the board while its hourglass runs out: this is what the next visitor's case turns on.
            g.look('board');
            g.overlay.showTags('none');
            const drained = later(g.t.tween(3.4, (t) => haltBoard.setFreshness(1 - t)));
            await g.caption(1);
            await drained;
            apply();
            haltBoard.setFreshness(0);
            haltBoard.setState('unknown');
            g.audio.play('wrong', { volume: 0.7 });
            g.overlay.float(haltBoard.anchors.perch, 'Evidence expired', 'bad', 2.6);
            await g.caption(2);
            g.overlay.showTags('none');
            break;
        }
        case 'poster-back': {
            g.look('board');
            const poster = g.world.find('bot:poster');
            poster?.setMood('happy').act('cheer');
            await sendCrane(g, 'heartbeat');
            apply();
            haltBoard.setFreshness(1);
            haltBoard.setState('trading');
            g.audio.play('correct');
            g.audio.setMood('day');
            fx.burst(haltBoard.anchors.perch, 'sparkle', 12);
            await g.caption(0);
            poster?.setMood('neutral');
            break;
        }
        case 'emergency-pause': {
            g.look('council');
            g.overlay.showTags(['council']);
            g.audio.play('alarm', { volume: 0.7 });
            await vote(g, 'emergency', 2);
            await g.caption(0);
            council.gong();
            g.audio.play('gong');
            await g.t.wait(0.6);
            await g.t.guard(
                fx.fly('admin', council.anchors.emergency, gate.anchors.plaque, {
                    duration: 1.5,
                    height: 4,
                    trail: '#ffc9c2',
                    scale: 1.4,
                }),
            );
            apply();
            gate.setPaused(true);
            g.audio.play('stampRefuse');
            g.look('venue', { span: 16 });
            adminTx(g, gate.anchors.plaque);
            g.overlay.showTags('none');
            await g.caption(1);
            await g.caption(2);
            break;
        }
        case 'operations-lift': {
            g.look('council');
            g.overlay.showTags(['council']);
            council.setVotes('emergency', 0, 3);
            // The emergency role may not lift what it paused.
            g.world.find('signer:emergency')?.act('shake');
            await vote(g, 'operations', 2);
            await g.caption(0);
            // The time lock, fast-forwarded.
            g.audio.play('tick');
            await g.t.tween(2.6, (t) => council.setTimeLock('operations', t));
            council.gong();
            g.audio.play('gong');
            await g.t.wait(0.5);
            await g.t.guard(
                fx.fly('admin', council.anchors.operations, gate.anchors.plaque, {
                    duration: 1.4,
                    height: 4,
                    trail: '#cfe3ff',
                    scale: 1.4,
                }),
            );
            apply();
            gate.setPaused(false);
            g.audio.play('correct');
            g.look('venue', { span: 16 });
            adminTx(g, gate.anchors.plaque);
            g.overlay.showTags('none');
            await g.caption(1);
            council.setVotes('operations', 0, 3);
            council.setTimeLock('operations', 0);
            break;
        }
        case 'recovery': {
            // On the pool's vault: the stock leaves it for the issuer, off to the upper left.
            g.look('pool');
            g.world.find('issuer')?.act('stamp');
            issuer.press();
            g.audio.play('press');
            await g.t.wait(0.6);
            const flights: Promise<void>[] = [];
            for (let i = 0; i < 4; i += 1) {
                flights.push(
                    fx.fly('stock', pool.anchors.stockVault, issuer.anchors.output, {
                        duration: 1.5,
                        height: 4.2,
                        trail: '#ffd3df',
                    }),
                );
                await g.t.wait(0.22);
            }
            await g.caption(0);
            await g.t.guard(Promise.all(flights));
            apply();
            g.syncBoard();
            g.audio.play('alarm', { volume: 0.7 });
            fx.ring(pool.anchors.door, '#ee5d50', 2.6);
            g.overlay.float(
                pool.anchors.stockVault,
                `Vault ${amount(g.venue.pool.vaultTsa, 1)} · books ${amount(g.venue.pool.tsa, 1)}`,
                'bad',
                3,
            );
            adminTx(g, issuer.anchors.output);
            await g.t.wait(1.2);
            // Anyone may run the reconciliation; it records the shortfall and flags the pool.
            adminTx(g, pool.anchors.board);
            g.overlay.float(pool.anchors.board, 'Reconciled: 20 TSA short · pool flagged', 'bad', 3);
            g.audio.play('stampRefuse', { volume: 0.6 });
            await g.caption(1);
            break;
        }
        case 'reconcile': {
            g.look('pool');
            const flights: Promise<void>[] = [];
            for (let i = 0; i < 4; i += 1) {
                flights.push(
                    fx.fly('stock', issuer.anchors.output, pool.anchors.stockVault, {
                        duration: 1.4,
                        height: 4.2,
                        trail: '#ffd3df',
                    }),
                );
                await g.t.wait(0.2);
            }
            await g.t.guard(Promise.all(flights));
            apply();
            g.syncBoard();
            g.audio.play('coin');
            await g.caption(0);
            council.setVotes('operations', 2, 3);
            council.gong();
            g.audio.play('gong', { volume: 0.7 });
            fx.burst(pool.anchors.board, 'sparkle', 16);
            g.audio.play('correct');
            g.overlay.float(pool.anchors.board, 'In balance', 'good', 2.4);
            adminTx(g, pool.anchors.board);
            await g.caption(1);
            council.setVotes('operations', 0, 3);
            break;
        }
        case 'budget': {
            g.look('venue', { span: 16 });
            apply();
            g.audio.play('tick');
            await g.caption(0);
            g.overlay.float(
                gate.anchors.plaque,
                `Budget: ${amount(g.venue.budget.usedShares, 1)} of ${g.venue.budget.dailyShares} shares used`,
                'info',
                3,
            );
            await g.caption(1);
            break;
        }
        case 'closing': {
            // The bell rings at four, in the day's last light; then night falls on the town.
            g.look('clock');
            apply();
            g.touch();
            exchange.ringBell();
            exchange.setTicker('CLOSED', 'regular session over');
            g.audio.play('bell');
            await g.caption(0);
            g.stage.setDaytime(1);
            g.world.fx.setFireflies(5);
            g.audio.setMood('night');
            g.venue.now = EVENING;
            g.touch();
            g.look('town');
            for (let i = 0; i < 3; i += 1) {
                fx.burst(v((Math.random() - 0.5) * 12, 6, (Math.random() - 0.5) * 12), 'confetti');
                g.audio.play('pop', { pitch: 0.8 + i * 0.2 });
                await g.t.wait(0.4);
            }
            await g.caption(1);
            break;
        }
    }
}
