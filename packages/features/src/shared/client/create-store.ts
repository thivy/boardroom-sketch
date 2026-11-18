import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

/**
 * A store for client state, with the plumbing every store here needs: a hook for atomic selectors,
 * `set` for decoupled actions to call, and `reset` back to the initial state. Keep actions out of the
 * state: export them as plain functions beside the store, so components never subscribe to them.
 */
export function createStore<State extends object>(initialState: State) {
  const useStore = create<State>()(subscribeWithSelector(() => ({ ...initialState })));

  return {
    useStore,
    get: useStore.getState,
    set: (changes: Partial<State> | ((state: State) => Partial<State>)) =>
      useStore.setState(changes),
    reset: () => useStore.setState({ ...initialState }),
  };
}
