/**
 * Whose key is it? Space and Enter are the game's keys (ask for papers, move
 * on), but they are also how a keyboard user presses the button they tabbed
 * to. A button that only holds the focus because the pointer clicked it a
 * moment ago is not a choice: the key still belongs to the game.
 */

/** The button the pointer last clicked, while it still holds the focus. */
let byPointer: Element | null = null;
let watching = false;

function watch(): void {
    if (watching || typeof window === 'undefined') return;
    watching = true;
    window.addEventListener(
        'pointerdown',
        (event) => {
            byPointer = (event.target as Element | null)?.closest('button') ?? null;
        },
        true,
    );
    // Moving the focus with the keyboard is a choice: the control it lands on owns the keys again.
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Tab') byPointer = null;
        },
        true,
    );
}

/**
 * True when Space or Enter should be left to the control that has the focus.
 * A button focused by a click gives the key up: it loses the focus, and the
 * key's own effect on it is cancelled, so it does not fire a second time.
 */
export function controlOwnsKey(event: KeyboardEvent): boolean {
    watch();
    const control = (event.target as Element | null)?.closest('button, a[href], input, select, textarea, summary');
    if (!control) return false;
    if (control === byPointer) {
        event.preventDefault();
        (control as HTMLElement).blur();
        return false;
    }
    return true;
}

/** Starts watching the pointer; call once when the game mounts, before the first click. */
export function watchPointerFocus(): void {
    watch();
}
