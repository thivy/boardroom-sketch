import type { Caption, CaptionStatus } from "@app/contracts";
import { createStore } from "../../shared/client/create-store";

export type StreamState = "idle" | "connecting" | "live" | "closed" | "error";

const captions = createStore({
  state: "idle" as StreamState,
  captions: [] as Caption[],
  captionsVisible: undefined as boolean | undefined,
  /** The meeting chosen in the picker; undefined until the user picks one. */
  selectedMeetingId: undefined as string | undefined,
  /** The meeting being recorded and followed. */
  recordingId: undefined as string | undefined,
  /** Whether a recording already running on the server has been picked up again. */
  resumed: false,
});

export const useCaptionStore = captions.useStore;

let source: EventSource | null = null;

export const selectMeeting = (selectedMeetingId: string) => captions.set({ selectedMeetingId });

export const markResumed = () => captions.set({ resumed: true });

/**
 * Follows a recording that is running on the server. The stream starts with what is already saved,
 * so following again after a reload shows the whole transcript; a caption keeps its place while
 * its text grows. Not following never stops the recording.
 */
export function followRecording(meetingId: string) {
  source?.close();
  captions.set({
    state: "connecting",
    captions: [],
    captionsVisible: undefined,
    recordingId: meetingId,
  });

  const stream = new EventSource(`/api/captions/stream?meeting=${encodeURIComponent(meetingId)}`);
  source = stream;

  stream.addEventListener("open", () => captions.set({ state: "live" }));
  stream.addEventListener("status", (event) =>
    captions.set({ captionsVisible: (JSON.parse(event.data) as CaptionStatus).captionsVisible }),
  );
  stream.addEventListener("caption", (event) => {
    const caption = JSON.parse(event.data) as Caption;
    captions.set((current) => {
      const index = current.captions.findIndex((item) => item.id === caption.id);
      if (index === -1) return { captions: [...current.captions, caption] };
      const next = [...current.captions];
      next[index] = caption;
      return { captions: next };
    });
  });
  stream.addEventListener("closed", () => {
    stream.close();
    captions.set({ state: "closed" });
  });
  // The server answers an unknown recording with an HTTP error, which EventSource reports as an error.
  stream.addEventListener("error", () => {
    if (stream.readyState === EventSource.CLOSED) captions.set({ state: "error" });
  });
}

/** Back to a blank page, for when the captions page is left. */
export function resetCaptionStore() {
  source?.close();
  source = null;
  captions.reset();
}
