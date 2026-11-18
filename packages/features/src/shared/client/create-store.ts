import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import { createStore as createVanillaStore, type StoreApi } from "zustand/vanilla";

type Changes<State> = Partial<State> | ((state: State) => Partial<State>);

type Options<State> = {
  /**
   * Runs while at least one component is using the store, and returns what to undo when the last one
   * leaves. This is where a store's timers, streams and polling live, so components need no effects.
   */
  whileUsed?: (store: { get: () => State; set: (changes: Changes<State>) => void }) => () => void;
  /** Called when the last component using the store leaves. By default the state goes back to its start. */
  onUnused?: (reset: () => void) => void;
};

/**
 * A store for client state, with the plumbing every store here needs: a hook for atomic selectors,
 * `set` for decoupled actions to call, and `reset` back to the initial state. Keep actions out of the
 * state: export them as plain functions beside the store, so components never subscribe to them.
 *
 * A store knows when it is in use, because a component using it subscribes on mount and unsubscribes
 * on unmount. `whileUsed` and `onUnused` hang off that, which replaces `useEffect` in components.
 */
export function createStore<State extends object>(
  initialState: State,
  options: Options<State> = {},
) {
  const api = createVanillaStore<State>()(subscribeWithSelector(() => ({ ...initialState })));
  const get = api.getState;
  const set = (changes: Changes<State>) => api.setState(changes);
  const reset = () => api.setState({ ...initialState });

  let users = 0;
  let stop: (() => void) | undefined;
  const observed: Pick<StoreApi<State>, "getState" | "getInitialState" | "subscribe"> = {
    getState: get,
    getInitialState: api.getInitialState,
    subscribe(listener: (state: State, previous: State) => void) {
      if (users++ === 0) stop = options.whileUsed?.({ get, set });
      const unsubscribe = api.subscribe(listener);
      return () => {
        unsubscribe();
        if (--users > 0) return;
        stop?.();
        stop = undefined;
        (options.onUnused ?? ((undo) => undo()))(reset);
      };
    },
  };

  function useStoreHook<Slice>(selector: (state: State) => Slice): Slice {
    return useStore(observed, selector);
  }

  return { useStore: useStoreHook, get, set, reset };
}
