/**
 * What floats over the 3D town in HTML: speech bubbles, name tags, the
 * setup's action buttons and little texts that rise and fade. Kept out of
 * React because they follow world positions every frame.
 */
import type * as THREE from 'three';

import type { AudioEngine } from '../audio/audio.ts';
import type { Stage } from '../scene/stage.ts';

export type Speaker = 'keeper' | 'visitor' | 'npc';
export type FloatTone = 'good' | 'bad' | 'info' | 'ice' | 'gold';

interface Bubble {
    key: string;
    element: HTMLElement;
    text: HTMLElement;
    full: string;
    shown: number;
    /** Characters per second. */
    rate: number;
    hold: number;
    held: number;
    pitch: number;
    lastBlip: number;
    untrack: () => void;
    done: () => void;
    closing: boolean;
}

interface Floating {
    element: HTMLElement;
    age: number;
    life: number;
    untrack: () => void;
}

export interface TagSpec {
    id: string;
    title: string;
    sub: string;
    /** live, review, planned or mock: colours the dot. */
    tone: string;
    anchor: THREE.Vector3;
}

export class Overlay {
    private readonly bubbles = new Map<string, Bubble>();
    private readonly floats: Floating[] = [];
    private readonly tags = new Map<string, { element: HTMLElement; untrack: () => void }>();
    private readonly actions = new Map<string, { element: HTMLElement; untrack: () => void }>();
    /** Called when a name tag is clicked. */
    onTag: ((id: string) => void) | undefined;
    private lastReal = performance.now();
    private shownTags: 'all' | 'none' | readonly string[] = 'none';
    private hovered: string | undefined;

    constructor(
        private readonly stage: Stage,
        private readonly root: HTMLElement,
        private readonly audio: () => AudioEngine,
    ) {
        stage.onUpdate((dt) => this.update(dt));
    }

    // ----- Speech -----

    /**
     * Shows a speech bubble over `anchor`, typing the text out, and resolves
     * once it has been read (typed, then held for `hold` seconds). A new
     * line from the same `key` replaces the old one.
     */
    say(
        key: string,
        anchor: () => THREE.Vector3 | undefined,
        text: string,
        opts: { speaker?: Speaker; hold?: number; pitch?: number; name?: string } = {},
    ): Promise<void> {
        this.hush(key);
        return new Promise<void>((done) => {
            const element = document.createElement('div');
            element.className = 'gk-pin';
            const bubble = document.createElement('div');
            bubble.className = `gk-bubble gk-bubble--${opts.speaker ?? 'visitor'}`;
            if (opts.name) {
                const name = document.createElement('div');
                name.className = 'gk-bubble__name';
                name.textContent = opts.name;
                bubble.append(name);
            }
            const body = document.createElement('div');
            body.className = 'gk-bubble__text';
            // The full text holds the bubble's size from the first letter; the typed part shows on top.
            const ghost = document.createElement('span');
            ghost.className = 'gk-bubble__ghost';
            ghost.textContent = text;
            const typed = document.createElement('span');
            typed.className = 'gk-bubble__typed';
            body.append(ghost, typed);
            bubble.append(body);
            element.append(bubble);
            this.root.append(element);
            // A bubble grows upwards from its pin: keep room for it under the top bar.
            const untrack = this.stage.track(element, anchor, -6, [170, 160, 40]);
            this.bubbles.set(key, {
                key,
                element,
                text: typed,
                full: text,
                shown: 0,
                rate: 46,
                hold: opts.hold ?? Math.min(1.1 + text.length * 0.028, 3.2),
                held: 0,
                pitch: opts.pitch ?? 1,
                lastBlip: 0,
                untrack,
                done,
                closing: false,
            });
        });
    }

    /** Removes a speaker's bubble, or every bubble. */
    hush(key?: string): void {
        const keys = key === undefined ? [...this.bubbles.keys()] : [key];
        for (const k of keys) {
            const bubble = this.bubbles.get(k);
            if (!bubble) continue;
            this.bubbles.delete(k);
            bubble.untrack();
            bubble.element.remove();
            bubble.done();
        }
    }

    /**
     * The player clicked to move on: lines still being typed appear in full, and lines already
     * read end now.
     */
    hurry(): void {
        for (const bubble of this.bubbles.values()) {
            if (bubble.shown < bubble.full.length) {
                bubble.shown = bubble.full.length;
                bubble.text.textContent = bubble.full;
                bubble.hold = Math.min(bubble.hold, 0.8);
            } else {
                bubble.held = Math.max(bubble.held, bubble.hold - 0.1);
            }
        }
    }

    // ----- Floating texts -----

    /** A short text that rises from a world position and fades: an amount, a code, a state change. */
    float(at: THREE.Vector3, text: string, tone: FloatTone = 'info', life = 1.9): void {
        const element = document.createElement('div');
        element.className = 'gk-pin';
        const inner = document.createElement('div');
        inner.className = `gk-float gk-float--${tone}`;
        inner.textContent = text;
        inner.style.animationDuration = `${life}s`;
        element.append(inner);
        this.root.append(element);
        const position = at.clone();
        const untrack = this.stage.track(element, () => position);
        this.floats.push({ element, age: 0, life, untrack });
    }

    // ----- Name tags -----

    /** Creates the places' name tags, hidden until `showTags`. */
    createTags(specs: readonly TagSpec[]): void {
        for (const spec of specs) {
            const element = document.createElement('div');
            element.className = 'gk-pin';
            const tag = document.createElement('button');
            tag.type = 'button';
            tag.className = 'gk-tag';
            tag.dataset.tone = spec.tone;
            const title = document.createElement('b');
            title.textContent = spec.title;
            const sub = document.createElement('span');
            sub.textContent = spec.sub;
            tag.append(title, sub);
            tag.addEventListener('click', () => this.onTag?.(spec.id));
            element.append(tag);
            this.root.append(element);
            // A tag grows upwards from its pin: keep it clear of the top bar and the screen's sides.
            const untrack = this.stage.track(element, () => spec.anchor, 0, [104, 70, 16]);
            this.tags.set(spec.id, { element, untrack });
        }
    }

    /** Shows all name tags, none, or only the listed ones. The place under the pointer always shows its tag. */
    showTags(which: 'all' | 'none' | readonly string[]): void {
        this.shownTags = which;
        this.refreshTags();
    }

    /** The place under the pointer, whose tag shows while it is hovered. */
    hoverTag(id: string | undefined): void {
        this.hovered = id;
        this.refreshTags();
    }

    private refreshTags(): void {
        const which = this.shownTags;
        for (const [id, tag] of this.tags) {
            const visible = id === this.hovered || which === 'all' || (which !== 'none' && which.includes(id));
            tag.element.classList.toggle('gk-pin--shown', visible);
            tag.element.classList.toggle('gk-pin--hover', id === this.hovered);
        }
    }

    // ----- Action buttons -----

    /** Pins a call-to-action button over a world position. */
    action(
        id: string,
        anchor: THREE.Vector3,
        label: string,
        onClick: () => void,
        variant: 'primary' | 'wrong' = 'primary',
    ): void {
        this.clearAction(id);
        const element = document.createElement('div');
        element.className = 'gk-pin gk-pin--shown';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `gk-action gk-action--${variant}`;
        button.dataset.action = id;
        button.textContent = label;
        button.addEventListener('click', () => {
            this.audio().play('click');
            onClick();
        });
        element.append(button);
        this.root.append(element);
        // The button must stay clickable wherever the camera is.
        const untrack = this.stage.track(element, () => anchor, 0, [130, 150, 190]);
        this.actions.set(id, { element, untrack });
    }

    clearAction(id?: string): void {
        const ids = id === undefined ? [...this.actions.keys()] : [id];
        for (const key of ids) {
            const entry = this.actions.get(key);
            if (!entry) continue;
            entry.untrack();
            entry.element.remove();
            this.actions.delete(key);
        }
    }

    /** Removes everything the overlay put on the page, when the game shuts down. */
    dispose(): void {
        this.clear();
        for (const tag of this.tags.values()) {
            tag.untrack();
            tag.element.remove();
        }
        this.tags.clear();
    }

    /** Removes everything transient (bubbles, floats, actions), for a restart. */
    clear(): void {
        this.hush();
        this.clearAction();
        for (const item of this.floats) {
            item.untrack();
            item.element.remove();
        }
        this.floats.length = 0;
    }

    private update(dt: number): void {
        for (const bubble of [...this.bubbles.values()]) {
            if (bubble.shown < bubble.full.length) {
                bubble.shown = Math.min(bubble.full.length, bubble.shown + bubble.rate * dt);
                const count = Math.floor(bubble.shown);
                bubble.text.textContent = bubble.full.slice(0, count);
                if (count - bubble.lastBlip >= 3) {
                    bubble.lastBlip = count;
                    const letter = bubble.full.charAt(count - 1);
                    if (letter.trim() !== '')
                        this.audio().play('blip', {
                            pitch: bubble.pitch * (0.94 + (letter.charCodeAt(0) % 7) * 0.02),
                            volume: 0.5,
                        });
                }
            } else {
                bubble.held += dt;
                if (bubble.held >= bubble.hold && !bubble.closing) {
                    bubble.closing = true;
                    // Resolve now so the script moves on; the bubble lingers a moment and fades.
                    bubble.done();
                    bubble.done = () => {};
                    const key = bubble.key;
                    bubble.element.classList.add('gk-pin--leaving');
                    window.setTimeout(() => {
                        if (this.bubbles.get(key) === bubble) this.hush(key);
                    }, 900);
                }
            }
        }
        // Floating texts fade on the browser's clock (a CSS animation), so they age in real time
        // whatever the game's speed.
        const now = performance.now();
        const real = Math.min((now - this.lastReal) / 1000, 0.1);
        this.lastReal = now;
        for (let i = this.floats.length - 1; i >= 0; i -= 1) {
            const item = this.floats[i] as Floating;
            item.age += real;
            if (item.age >= item.life) {
                item.untrack();
                item.element.remove();
                this.floats.splice(i, 1);
            }
        }
    }
}
