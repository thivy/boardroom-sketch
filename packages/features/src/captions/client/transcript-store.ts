import type { StoredSession } from "@app/contracts";
import { createStore } from "../../shared/client/create-store";

const transcripts = createStore({
  /** The session open on the right. */
  selectedSessionId: undefined as number | undefined,
  /** The session the delete confirmation is about. */
  deleting: undefined as StoredSession | undefined,
});

export const useTranscriptStore = transcripts.useStore;

export const selectSession = (selectedSessionId: number) => transcripts.set({ selectedSessionId });

export const askToDelete = (deleting: StoredSession) => transcripts.set({ deleting });

export const cancelDelete = () => transcripts.set({ deleting: undefined });

/** A session was deleted: close the confirmation, and the transcript too if it was the open one. */
export const finishDelete = (sessionId: number) =>
  transcripts.set((state) => ({
    deleting: undefined,
    selectedSessionId: state.selectedSessionId === sessionId ? undefined : state.selectedSessionId,
  }));
