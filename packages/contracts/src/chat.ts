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
  /** What the assistant is told before the first question: its role and any background, such as a transcript. */
  instructions?: string;
  /** The model id. Omitted, the runtime picks one. */
  model?: string;
  /**
   * How hard the model thinks before answering (`low`, `medium`, `high`...). Applies when the session is
   * created and again when it is resumed. Omitted, the model's own default applies.
   */
  effort?: string;
  /**
   * A stable identity for the conversation, such as a meeting id. Creating a session with a key that was
   * used before resumes that conversation, earlier turns included.
   */
  key?: string;
};

/** One conversation. It remembers earlier turns, so each `send` is a follow-up. */
export interface ChatSession {
  /** Sends a message and streams the answer; the events end when the answer is complete or `signal` aborts. */
  send(prompt: string, signal: AbortSignal): AsyncIterable<ChatEvent>;

  /** Releases the conversation. */
  close(): Promise<void>;
}

/**
 * Where answers come from: the chat feature depends only on these two ports, which an adapter (today
 * `@app/copilot-sdk`) provides. This one tells whether the assistant can be used right now, and as whom.
 */
export type GetChatStatus = () => Promise<ChatStatus>;

/** Starts a conversation, or resumes the one that `options.key` names. */
export type CreateChatSession = (options?: ChatSessionOptions) => Promise<ChatSession>;
