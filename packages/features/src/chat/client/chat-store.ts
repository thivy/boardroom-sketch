import { createStore } from "../../shared/client/create-store";

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  failed?: boolean;
};

export type TranscriptChoice = { id: number; label: string };

type Frame = { event: string; data: string };

const EVENT_LINE = /^event: (.*)$/m;
const DATA_LINE = /^data: (.*)$/m;

const chat = createStore({
  messages: [] as ChatMessage[],
  busy: false,
  draft: "",
  /** The saved transcript the conversation is about; read when the conversation starts. */
  transcript: null as TranscriptChoice | null,
});

export const useChatStore = chat.useStore;

// What the stream needs but nothing renders.
let conversationId: string | undefined;
let abort: AbortController | undefined;
let nextId = 1;

/** Splits server-sent events out of a text stream; `rest` is the unfinished tail to carry over. */
function parseFrames(buffer: string): { frames: Frame[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames = parts.flatMap((part) => {
    const event = EVENT_LINE.exec(part)?.[1];
    const data = DATA_LINE.exec(part)?.[1];
    return event && data !== undefined ? [{ event, data }] : [];
  });
  return { frames, rest };
}

const updateMessage = (id: number, change: (message: ChatMessage) => ChatMessage) =>
  chat.set((state) => ({
    messages: state.messages.map((item) => (item.id === id ? change(item) : item)),
  }));

export const setChatDraft = (draft: string) => chat.set({ draft });

export const setChatTranscript = (transcript: TranscriptChoice | null) => chat.set({ transcript });

/** Sends a message and fills in the answer as it streams. Does nothing while an answer is coming. */
export async function sendChat(text: string) {
  const prompt = text.trim();
  if (!prompt || chat.get().busy) return;

  const questionId = nextId;
  const answerId = nextId + 1;
  nextId += 2;
  chat.set((state) => ({
    messages: [
      ...state.messages,
      { id: questionId, role: "user", text: prompt },
      { id: answerId, role: "assistant", text: "" },
    ],
    busy: true,
  }));

  const controller = new AbortController();
  abort = controller;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        conversationId,
        transcriptSessionId: conversationId ? undefined : chat.get().transcript?.id,
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "The assistant could not answer");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const parsed = parseFrames(buffer + value);
      buffer = parsed.rest;
      for (const { event, data } of parsed.frames) {
        const payload = JSON.parse(data) as {
          conversationId?: string;
          text?: string;
          message?: string;
        };
        if (event === "conversation") conversationId = payload.conversationId;
        else if (event === "delta") {
          updateMessage(answerId, (item) => ({ ...item, text: item.text + (payload.text ?? "") }));
        } else if (event === "error") {
          updateMessage(answerId, (item) => ({
            ...item,
            text: payload.message ?? "Failed",
            failed: true,
          }));
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      updateMessage(answerId, (item) => ({
        ...item,
        text: error instanceof Error ? error.message : "Failed",
        failed: true,
      }));
    }
  } finally {
    chat.set({ busy: false });
  }
}

export const stopChat = () => abort?.abort();

/** Sends what the user typed or picked, unless it is empty, an answer is coming, or chat is unavailable. */
export function submitChat(text: string, unavailable: boolean) {
  if (!text.trim() || chat.get().busy || unavailable) return;
  setChatDraft("");
  void sendChat(text);
}

/** Ends the conversation, on the server too, and clears the messages; the transcript choice stays. */
export function startNewChat() {
  abort?.abort();
  const id = conversationId;
  conversationId = undefined;
  if (id) void fetch(`/api/chat?conversation=${encodeURIComponent(id)}`, { method: "DELETE" });
  chat.set({ messages: [], busy: false });
}

/** Back to a blank page, for when the chat page is left. */
export function resetChatStore() {
  startNewChat();
  chat.reset();
}
