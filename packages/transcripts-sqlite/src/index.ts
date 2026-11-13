import type {
  Caption,
  Meeting,
  SessionTranscript,
  StoredMeeting,
  StoredSession,
  TranscriptStore,
} from "@app/contracts";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./schema";

export type SqliteOptions = {
  /** The database file. Defaults to `TRANSCRIPTS_DB`, then `./data/transcripts.db`. */
  path?: string;
};

type SessionRow = {
  id: number;
  meeting_id: string;
  started_at: number;
  ended_at: number | null;
  caption_count: number;
};

const SESSION_COLUMNS = `
  s.id, s.meeting_id, s.started_at, s.ended_at,
  (SELECT COUNT(*) FROM captions c WHERE c.session_id = s.id) AS caption_count`;

const toSession = (row: SessionRow): StoredSession => ({
  id: row.id,
  meetingId: row.meeting_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  captionCount: row.caption_count,
});

/** Captions without a speaker id are keyed by name, so one person stays one speaker. */
const speakerKey = ({ speakerId, speaker }: Caption) => speakerId || `name:${speaker}`;

/** Stores transcripts in a SQLite file through Node's built-in `node:sqlite`. */
export function transcriptsSqlite({
  path = process.env.TRANSCRIPTS_DB || "./data/transcripts.db",
}: SqliteOptions = {}): TranscriptStore {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  migrate(db);

  // A crash or a killed server leaves sessions open; end them at their last caption.
  db.exec(`
    UPDATE sessions
    SET ended_at = COALESCE((SELECT MAX(updated_at) FROM captions WHERE session_id = sessions.id), started_at)
    WHERE ended_at IS NULL`);

  const upsertMeeting = db.prepare(`
    INSERT INTO meetings (id, title, first_seen_at, last_recorded_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, last_recorded_at = excluded.last_recorded_at`);
  const insertSession = db.prepare(
    "INSERT INTO sessions (meeting_id, started_at) VALUES (?, ?) RETURNING id",
  );
  const upsertSpeaker = db.prepare(`
    INSERT INTO speakers (id, name, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    WHERE excluded.name <> ''`);
  const upsertCaption = db.prepare(`
    INSERT INTO captions (session_id, source_id, speaker_id, text, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, source_id) DO UPDATE SET
      speaker_id = excluded.speaker_id, text = excluded.text, updated_at = excluded.updated_at`);
  const closeSession = db.prepare(
    "UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
  );
  const sessionById = db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.id = ?`);
  const allMeetings = db.prepare(
    "SELECT id, title, last_recorded_at FROM meetings ORDER BY last_recorded_at DESC",
  );
  const sessionsOf = db.prepare(
    `SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.meeting_id = ? ORDER BY s.started_at DESC`,
  );
  const meetingById = db.prepare("SELECT id, title FROM meetings WHERE id = ?");
  const captionsOf = db.prepare(`
    SELECT c.source_id, c.text, c.updated_at, c.speaker_id, p.name AS speaker
    FROM captions c JOIN speakers p ON p.id = c.speaker_id
    WHERE c.session_id = ? ORDER BY c.id`);
  const meetingOf = db.prepare("SELECT meeting_id FROM sessions WHERE id = ?");
  const deleteSessionRow = db.prepare("DELETE FROM sessions WHERE id = ?");
  const deleteEmptyMeeting = db.prepare(
    "DELETE FROM meetings WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE meeting_id = ?)",
  );

  return {
    async startSession(meeting: Meeting, at) {
      upsertMeeting.run(meeting.id, meeting.title, at, at);
      const { id } = insertSession.get(meeting.id, at) as { id: number };
      return toSession(sessionById.get(id) as SessionRow);
    },

    async saveCaption(sessionId, caption) {
      const key = speakerKey(caption);
      upsertSpeaker.run(key, caption.speaker, caption.at);
      upsertCaption.run(sessionId, caption.id, key, caption.text, caption.at, caption.at);
    },

    async endSession(sessionId, at) {
      closeSession.run(at, sessionId);
    },

    async listMeetings() {
      const meetings = allMeetings.all() as {
        id: string;
        title: string;
        last_recorded_at: number;
      }[];
      return meetings.map((meeting): StoredMeeting => ({
        id: meeting.id,
        title: meeting.title,
        lastRecordedAt: meeting.last_recorded_at,
        sessions: (sessionsOf.all(meeting.id) as SessionRow[]).map(toSession),
      }));
    },

    async getSession(sessionId): Promise<SessionTranscript | undefined> {
      const row = sessionById.get(sessionId) as SessionRow | undefined;
      if (!row) return undefined;
      const meeting = meetingById.get(row.meeting_id) as Meeting;
      const captions = (
        captionsOf.all(sessionId) as {
          source_id: string;
          text: string;
          updated_at: number;
          speaker_id: string;
          speaker: string;
        }[]
      ).map((line): Caption => ({
        id: line.source_id,
        speaker: line.speaker,
        speakerId: line.speaker_id.startsWith("name:") ? "" : line.speaker_id,
        text: line.text,
        at: line.updated_at,
      }));
      return { session: toSession(row), meeting, captions };
    },

    async deleteSession(sessionId) {
      const row = meetingOf.get(sessionId) as { meeting_id: string } | undefined;
      deleteSessionRow.run(sessionId);
      if (row) deleteEmptyMeeting.run(row.meeting_id, row.meeting_id);
    },
  };
}
