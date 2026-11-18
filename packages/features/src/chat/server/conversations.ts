import type { ChatSession, CreateChatSession, TranscriptStore } from "@app/contracts";
import { renderTranscript } from "../../shared/server/transcript-export";

/** A long meeting can run to hundreds of thousands of characters; this is what a chat is given of it. */
const MAX_CONTEXT = 300_000;
const MAX_CONVERSATIONS = 20;
const IDLE_MS = 30 * 60_000;
const SWEEP_MS = 5 * 60_000;

const INSTRUCTIONS = `You help the user analyse transcripts of their meetings.
Answer from the transcript when one is given, and say so when it does not contain the answer.
Keep answers concise and use plain text or simple lists.
You have no tools: you cannot run commands, read or write files, or browse. Never write tool calls or tool output; if asked to do any of that, say you cannot.`;

export type Conversation = { session: ChatSession; lastUsed: number; busy: boolean; key?: string };

/** A conversation that was started, or why it could not be. */
export type Opened = { id: string; conversation: Conversation } | { status: number; error: string };

/**
 * The conversations the server keeps open: at most `MAX_CONVERSATIONS`, the oldest let go when a new
 * one needs room, and any that sits unused for `IDLE_MS` let go too. A meeting has one conversation.
 */
export function createConversations(createChatSession: CreateChatSession, store: TranscriptStore) {
  const conversations = new Map<string, Conversation>();

  async function release(id: string) {
    const conversation = conversations.get(id);
    conversations.delete(id);
    await conversation?.session.close().catch(() => {});
  }

  setInterval(() => {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, conversation] of conversations) {
      if (!conversation.busy && conversation.lastUsed < cutoff) void release(id);
    }
  }, SWEEP_MS).unref();

  async function transcriptContext(sessionId: number) {
    const transcript = await store.getSession(sessionId);
    if (!transcript) return undefined;
    const text = renderTranscript(transcript, "txt");
    const body =
      text.length > MAX_CONTEXT
        ? `${text.slice(0, MAX_CONTEXT)}\n[The transcript was cut here because it is too long.]`
        : text;
    return {
      context: `The user is asking about this meeting transcript:\n\n${body}`,
      key: `meeting:${transcript.session.meetingId}`,
    };
  }

  return {
    get: (id: string) => conversations.get(id),

    /** Starts a conversation, about a saved transcript when `transcriptSessionId` is given. */
    async open(transcriptSessionId?: number): Promise<Opened> {
      const found =
        transcriptSessionId === undefined
          ? undefined
          : await transcriptContext(transcriptSessionId);
      if (transcriptSessionId !== undefined && !found) {
        return { status: 404, error: "No such transcript" };
      }

      const key = found?.key;
      const open = key ? [...conversations].find(([, item]) => item.key === key) : undefined;
      if (open?.[1].busy) return { status: 409, error: "Still answering the last message" };
      if (open) await release(open[0]);

      try {
        const session = await createChatSession({
          instructions: found ? `${INSTRUCTIONS}\n\n${found.context}` : INSTRUCTIONS,
          effort: "high",
          key,
        });
        if (conversations.size >= MAX_CONVERSATIONS) {
          const oldest = [...conversations].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
          if (oldest) await release(oldest[0]);
        }
        const id = crypto.randomUUID();
        const conversation: Conversation = { session, lastUsed: Date.now(), busy: false, key };
        conversations.set(id, conversation);
        return { id, conversation };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not start the assistant";
        return { status: 502, error: message };
      }
    },

    /** Ends a conversation; false when there is no such one. */
    close(id: string): boolean {
      if (!conversations.has(id)) return false;
      void release(id);
      return true;
    },
  };
}
