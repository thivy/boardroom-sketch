import type { PipelineEvent, PipelineEventKind, PipelineLog } from "@app/contracts";
import type { DatabaseSync } from "node:sqlite";
import { migrate, type Migration } from "./database";
import { transcriptsMigration } from "./transcripts-schema";

const KINDS: PipelineEventKind[] = ["triage", "extract", "rejection", "error"];

/** Append a step to change the schema; never edit one that has shipped. */
const migration: Migration = {
  module: "pipeline_log",
  steps: [
    `
    CREATE TABLE pipeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN (${KINDS.map((kind) => `'${kind}'`).join(", ")})),
      detail TEXT NOT NULL CHECK (json_valid(detail)),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX pipeline_events_by_meeting ON pipeline_events(meeting_id, kind, id);
    `,
  ],
};

/** Keeps the graph pipeline's decisions in the shared database, next to the transcripts they are about. */
export function pipelineLogSqlite(db: DatabaseSync): PipelineLog {
  // Events point at meetings, so the transcripts tables come first.
  migrate(db, transcriptsMigration);
  migrate(db, migration);

  const insert = db.prepare(
    "INSERT INTO pipeline_events (meeting_id, kind, detail, created_at) VALUES (?, ?, ?, ?)",
  );
  const select = db.prepare(`
    SELECT id, meeting_id, kind, detail, created_at FROM pipeline_events
    WHERE meeting_id = ? AND (? IS NULL OR kind = ?)
    ORDER BY id DESC LIMIT ?`);

  return {
    async record(meetingId, kind, detail) {
      insert.run(meetingId, kind, JSON.stringify(detail), Date.now());
    },

    async list(meetingId, filter) {
      const kind = filter?.kind ?? null;
      const rows = select.all(meetingId, kind, kind, filter?.limit ?? 500) as {
        id: number;
        meeting_id: string;
        kind: PipelineEventKind;
        detail: string;
        created_at: number;
      }[];
      return rows
        .map((row): PipelineEvent => ({
          id: row.id,
          meetingId: row.meeting_id,
          kind: row.kind,
          detail: JSON.parse(row.detail),
          createdAt: row.created_at,
        }))
        .reverse();
    },
  };
}
