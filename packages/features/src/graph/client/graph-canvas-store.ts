import { createStore } from "../../shared/client/create-store";

const canvas = createStore({
  /** Whether the view keeps fitting the whole graph as it grows; panning or zooming turns it off. */
  following: true,
  hoveredNodeId: undefined as string | undefined,
});

export const useGraphCanvasStore = canvas.useStore;

export const setFollowing = (following: boolean) => canvas.set({ following });

export const setHoveredNode = (hoveredNodeId: string | undefined) => canvas.set({ hoveredNodeId });

export const resetGraphCanvasStore = canvas.reset;
