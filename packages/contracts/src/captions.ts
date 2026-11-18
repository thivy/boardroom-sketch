/** A Teams meeting that captions can be read from. */
export type Meeting = {
  /** Unique and stable for the meeting, so it tells meetings apart. For Teams it is the meeting thread id, `19:meeting_…@thread.v2`. */
  id: string;
  title: string;
};

/** One closed-caption line. A line keeps its id while Teams extends its text. */
export type Caption = {
  id: string;
  speaker: string;
  /** Stable id of the speaker (for Teams, `8:orgid:<Entra object id>`); empty when the source cannot tell. */
  speakerId: string;
  text: string;
  /** Epoch milliseconds of the last change. */
  at: number;
};

export type CaptionStatus = {
  /** Whether live captions are switched on in the meeting. */
  captionsVisible: boolean;
};

/** Captions without a speaker id are keyed by name, so one person stays one speaker. */
export const speakerKey = ({ speakerId, speaker }: Pick<Caption, "speakerId" | "speaker">) =>
  speakerId || `name:${speaker}`;

export type CaptionEvent =
  | ({ type: "status" } & CaptionStatus)
  | { type: "caption"; caption: Caption };

/**
 * Where captions come from. The Teams captions feature depends only on this port; an adapter
 * (today `@app/teams-cdp`, later perhaps an official SDK) implements it.
 */
export interface CaptionSource {
  /** Meetings that can be read right now. Rejects with a readable message when the source is unreachable. */
  listMeetings(): Promise<Meeting[]>;

  /**
   * Starts reading one meeting. Resolves once attached, so a failure to attach rejects here. The
   * events end when the meeting goes away or `signal` aborts; stopping iteration releases the meeting.
   */
  watch(meetingId: string, signal: AbortSignal): Promise<AsyncIterable<CaptionEvent>>;

  /** Optional: gets the Teams client into a state where it can be read, for example restarting it. */
  prepare?(): Promise<void>;

  /**
   * Optional: the windows the source can see, as short labels. It explains why a meeting was not found,
   * for example because its window is not exposed or is titled differently from what was expected.
   */
  listWindows?(): Promise<string[]>;
}
