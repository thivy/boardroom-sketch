import type { Migration } from "./database";

/** Append a step to change the schema; never edit one that has shipped. */
const steps: string[] = [
  `
  CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    last_recorded_at INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );
  CREATE INDEX sessions_by_meeting ON sessions(meeting_id, started_at);

  CREATE TABLE speakers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE captions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    speaker_id TEXT NOT NULL REFERENCES speakers(id),
    text TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (session_id, source_id)
  );
  CREATE INDEX captions_by_session ON captions(session_id, id);
  `,
];

/** Databases made before shared storage tracked this module in PRAGMA user_version. */
export const transcriptsMigration: Migration = {
  module: "transcripts",
  steps,
  adoptUserVersion: true,
};
