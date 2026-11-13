/** Whether the chat backend can be used right now, and as whom. */
export type ChatStatus = {
  available: boolean;
  /** The signed-in account, when there is one. */
  account?: string;
  /** A message fit to show the user, for example how to sign in. */
  message: string;
};

export type ChatEvent =
  /** A piece of the answer, to append to what was received so far. */
  { type: "delta"; text: string } | { type: "error"; message: string };

export type ChatSessionOptions = {
  /** Background the assistant is given before the first question, such as a transcript to analyse. */
  context?: string;
};

/** One conversation. It remembers earlier turns, so each `send` is a follow-up. */
export interface ChatSession {
  /** Sends a message and streams the answer; the events end when the answer is complete or `signal` aborts. */
  send(prompt: string, signal: AbortSignal): AsyncIterable<ChatEvent>;

  /** Releases the conversation. */
  close(): Promise<void>;
}

/**
 * Where answers come from. The chat feature depends only on this port; an adapter (today
 * `@app/copilot-sdk`) implements it.
 */
export interface ChatBackend {
  status(): Promise<ChatStatus>;
  createSession(options?: ChatSessionOptions): Promise<ChatSession>;
}
