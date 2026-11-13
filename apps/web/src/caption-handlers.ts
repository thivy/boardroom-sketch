import { createCaptionHandlers } from "@app/features/captions/server";
import { teamsCdp } from "@app/teams-cdp";
import { transcriptsSqlite } from "@app/transcripts-sqlite";

// The one place the captions feature meets its adapters: where captions come from, and where
// transcripts are kept. Swap `teamsCdp()` or `transcriptsSqlite()` to change either.
export const transcriptStore = transcriptsSqlite();
export const captionHandlers = createCaptionHandlers(teamsCdp(), transcriptStore);
