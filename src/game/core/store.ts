/**
 * A tiny observable store: the game writes its state here and the React
 * interface re-renders from it.
 */
export class Store<T extends object> {
    private state: T;
    private readonly listeners = new Set<() => void>();

    constructor(initial: T) {
        this.state = initial;
    }

    get = (): T => this.state;

    /** Replaces some fields and notifies. */
    set(patch: Partial<T> | ((state: T) => Partial<T>)): void {
        const next = typeof patch === 'function' ? patch(this.state) : patch;
        this.state = { ...this.state, ...next };
        for (const listener of this.listeners) listener();
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
}
