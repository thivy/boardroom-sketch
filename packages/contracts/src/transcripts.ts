import type { Caption, Meeting } from "./captions";

/** One recording of one meeting: from a Connect to a Disconnect, or until the meeting ends. */
export type StoredSession = {
  id: number;
  meetingId: string;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Epoch milliseconds; null while the session is still being recorded. */
  endedAt: number | null;
  captionCount: number;
};

export type StoredMeeting = Meeting & {
  /** Epoch milliseconds of the most recent session start. */
  lastRecordedAt: number;
  sessions: StoredSession[];
};

export type SessionTranscript = {
  session: StoredSession;
  meeting: Meeting;
  captions: Caption[];
};

/**
 * Where transcripts are kept. The captions feature depends only on this port; an adapter
 * (today `@app/transcripts-sqlite`) implements it.
 */
export interface TranscriptStore {
  /** Starts a session; the meeting is created or its title refreshed. */
  startSession(meeting: Meeting, at: number): Promise<StoredSession>;

  /** Inserts a caption line, or updates its text when `caption.id` was already saved in this session. */
  saveCaption(sessionId: number, caption: Caption): Promise<void>;

  endSession(sessionId: number, at: number): Promise<void>;

  /** Meetings that have at least one session, most recently recorded first. */
  listMeetings(): Promise<StoredMeeting[]>;

  /** The session's captions in the order they first appeared. */
  getSession(sessionId: number): Promise<SessionTranscript | undefined>;

  /** Removes the session and its captions; a meeting left without sessions is removed too. */
  deleteSession(sessionId: number): Promise<void>;
}

/** A recording that is running on the server right now. */
export type ActiveRecording = {
  meetingId: string;
  title: string;
  session: StoredSession;
  /** Whether live captions are switched on, once the source has said. */
  captionsVisible?: boolean;
};
