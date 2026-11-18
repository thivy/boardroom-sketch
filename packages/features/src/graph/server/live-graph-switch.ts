import { DEFAULT_SETTINGS, type SettingsStore } from "@app/contracts";

/**
 * Whether the live graph is on. The pipeline asks on every caption, so the answer is kept in memory
 * and the store is only read once, at the start, and written when the person changes it.
 */
export function createLiveGraphSwitch(store: SettingsStore) {
  let on = DEFAULT_SETTINGS.liveGraph;
  const loaded = store.get().then(
    (settings) => {
      on = settings.liveGraph;
    },
    () => {},
  );

  return {
    enabled: () => on,

    async get(): Promise<boolean> {
      await loaded;
      return on;
    },

    async set(value: boolean): Promise<boolean> {
      await loaded;
      on = (await store.update({ liveGraph: value })).liveGraph;
      return on;
    },
  };
}

export type LiveGraphSwitch = ReturnType<typeof createLiveGraphSwitch>;
