import { createCaptionHandlers } from "@app/features/captions/server";
import { teamsCdp } from "@app/teams-cdp";
import { recordingObservers } from "./graph-handlers";
import { transcriptStore } from "./storage";

// The one place the captions feature meets its adapters: where captions come from, and where
// transcripts are kept. Swap `teamsCdp()` to read captions from somewhere else.
export const captionHandlers = createCaptionHandlers(
  teamsCdp(),
  transcriptStore,
  recordingObservers,
);
