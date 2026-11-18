import { createStore } from "../../shared/client/create-store";

const builds = createStore({
  /** The session whose "replace this graph?" confirmation is open. */
  confirmingSessionId: undefined as number | undefined,
});

export const useGraphBuildStore = builds.useStore;

export const askToReplaceGraph = (confirmingSessionId: number) =>
  builds.set({ confirmingSessionId });

export const closeReplaceGraph = builds.reset;
