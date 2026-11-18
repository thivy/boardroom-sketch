import type { NodeType } from "@app/contracts";
import { createStore } from "../../shared/client/create-store";

const view = createStore({
  /** The meeting picked in the menu; until then the page opens the one it was linked to, or the first. */
  chosenMeetingId: undefined as string | undefined,
  selectedNodeId: undefined as string | undefined,
  hiddenTypes: new Set<NodeType>() as ReadonlySet<NodeType>,
  query: "",
});

export const useGraphViewStore = view.useStore;

export const chooseMeeting = (chosenMeetingId: string) =>
  view.set({ chosenMeetingId, selectedNodeId: undefined });

export const selectNode = (selectedNodeId: string | undefined) => view.set({ selectedNodeId });

export const toggleNodeType = (type: NodeType) =>
  view.set((state) => {
    const hiddenTypes = new Set(state.hiddenTypes);
    if (!hiddenTypes.delete(type)) hiddenTypes.add(type);
    return { hiddenTypes };
  });

export const setGraphQuery = (query: string) => view.set({ query });

export const resetGraphViewStore = view.reset;
