/** A Teams meeting that captions can be read from. */
export type Meeting = {
  /** Opaque to callers; only the source that listed the meeting understands it. */
  id: string;
  title: string;
};

/** One closed-caption line. A line keeps its id while Teams extends its text. */
export type Caption = {
  id: string;
  speaker: string;
  text: string;
  /** Epoch milliseconds of the last change. */
  at: number;
};

export type CaptionStatus = {
  /** Whether live captions are switched on in the meeting. */
  captionsVisible: boolean;
};

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
}
