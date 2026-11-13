import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  failed?: boolean;
};

type Frame = { event: string; data: string };

/** Splits server-sent events out of a text stream; `rest` is the unfinished tail to carry over. */
function parseFrames(buffer: string): { frames: Frame[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames = parts.flatMap((part) => {
    const event = /^event: (.*)$/m.exec(part)?.[1];
    const data = /^data: (.*)$/m.exec(part)?.[1];
    return event && data !== undefined ? [{ event, data }] : [];
  });
  return { frames, rest };
}

/**
 * One chat. `transcriptSessionId` is read when the conversation starts, so it can only change by
 * starting over. The conversation lives on the server; `reset` ends it.
 */
export function useChat(transcriptSessionId: number | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string>(undefined);
  const abort = useRef<AbortController>(undefined);
  const nextId = useRef(1);

  const update = useCallback((id: number, change: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((item) => (item.id === id ? change(item) : item)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt || busy) return;

      const answerId = nextId.current + 1;
      setMessages((current) => [
        ...current,
        { id: nextId.current, role: "user", text: prompt },
        { id: answerId, role: "assistant", text: "" },
      ]);
      nextId.current += 2;
      setBusy(true);

      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: prompt,
            conversationId: conversationId.current,
            transcriptSessionId: conversationId.current ? undefined : transcriptSessionId,
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
            if (event === "conversation") conversationId.current = payload.conversationId;
            else if (event === "delta") {
              update(answerId, (item) => ({ ...item, text: item.text + (payload.text ?? "") }));
            } else if (event === "error") {
              update(answerId, (item) => ({
                ...item,
                text: payload.message ?? "Failed",
                failed: true,
              }));
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          update(answerId, (item) => ({
            ...item,
            text: error instanceof Error ? error.message : "Failed",
            failed: true,
          }));
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, transcriptSessionId, update],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    const id = conversationId.current;
    conversationId.current = undefined;
    if (id) void fetch(`/api/chat?conversation=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMessages([]);
    setBusy(false);
  }, []);

  // Leaving the page ends the conversation on the server too.
  useEffect(
    () => () => {
      abort.current?.abort();
      const id = conversationId.current;
      if (id) void fetch(`/api/chat?conversation=${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [],
  );

  return { messages, busy, send, stop, reset };
}
