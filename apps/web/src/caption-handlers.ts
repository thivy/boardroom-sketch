import { createCaptionHandlers } from "@app/features/captions/server";
import { openDatabase, transcriptsSqlite } from "@app/storage-sqlite";
import { teamsCdp } from "@app/teams-cdp";

// The one place the captions feature meets its adapters: where captions come from, and where
// transcripts are kept. Swap `teamsCdp()` or `transcriptsSqlite()` to change either.
export const database = openDatabase();
export const transcriptStore = transcriptsSqlite(database);
export const captionHandlers = createCaptionHandlers(teamsCdp(), transcriptStore);
