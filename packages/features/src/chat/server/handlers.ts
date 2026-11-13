import type { ChatBackend, ChatSession, TranscriptStore } from "@app/contracts";
import { renderTranscript } from "../../captions/server/export";

const MAX_MESSAGE = 20_000;
/** A long meeting can run to hundreds of thousands of characters; this is what a chat is given of it. */
const MAX_CONTEXT = 300_000;
const MAX_CONVERSATIONS = 20;
const IDLE_MS = 30 * 60_000;

type Conversation = { session: ChatSession; lastUsed: number; busy: boolean };

const json = (body: unknown, status = 200) => Response.json(body, { status });

// A JSON body cannot be sent cross-site without a CORS preflight, so other pages cannot post here.
const isJson = (request: Request) =>
  request.headers.get("content-type")?.includes("application/json") ?? false;

/** The chat endpoints, as plain `(Request) => Response` handlers over a `ChatBackend` and a `TranscriptStore`. */
export function createChatHandlers(backend: ChatBackend, store: TranscriptStore) {
  const conversations = new Map<string, Conversation>();

  const release = (id: string) => {
    const conversation = conversations.get(id);
    conversations.delete(id);
    void conversation?.session.close().catch(() => {});
  };

  setInterval(() => {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, conversation] of conversations) {
      if (!conversation.busy && conversation.lastUsed < cutoff) release(id);
    }
  }, 5 * 60_000).unref();

  async function transcriptContext(sessionId: number): Promise<string | undefined> {
    const transcript = await store.getSession(sessionId);
    if (!transcript) return undefined;
    const text = renderTranscript(transcript, "txt");
    const body =
      text.length > MAX_CONTEXT
        ? `${text.slice(0, MAX_CONTEXT)}\n[The transcript was cut here because it is too long.]`
        : text;
    return `The user is asking about this meeting transcript:\n\n${body}`;
  }

  return {
    /** `GET`: whether the assistant can be used, and as whom. */
    async status(): Promise<Response> {
      return json(await backend.status());
    },

    /**
     * `POST { message, conversationId?, transcriptSessionId? }`: sends a message and streams the answer
     * as server-sent events: `conversation` (its id), then `delta`s, then `done`, or `error`.
     * Without a `conversationId` a conversation starts, and `transcriptSessionId` gives it a transcript.
     */
    async message(request: Request): Promise<Response> {
      if (!isJson(request)) return json({ error: "Expected application/json" }, 415);
      const body = (await request.json().catch(() => ({}))) as {
        message?: unknown;
        conversationId?: unknown;
        transcriptSessionId?: unknown;
      };
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json({ error: "Missing message" }, 400);
      if (message.length > MAX_MESSAGE) return json({ error: "That message is too long" }, 413);

      let id = typeof body.conversationId === "string" ? body.conversationId : undefined;
      let conversation = id ? conversations.get(id) : undefined;
      if (id && !conversation) return json({ error: "That conversation has ended" }, 404);

      if (!conversation) {
        let context: string | undefined;
        if (body.transcriptSessionId !== undefined && body.transcriptSessionId !== null) {
          context = await transcriptContext(Number(body.transcriptSessionId));
          if (context === undefined) return json({ error: "No such transcript" }, 404);
        }
        try {
          const session = await backend.createSession({ context });
          if (conversations.size >= MAX_CONVERSATIONS) {
            const oldest = [...conversations].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
            if (oldest) release(oldest[0]);
          }
          id = crypto.randomUUID();
          conversation = { session, lastUsed: Date.now(), busy: false };
          conversations.set(id, conversation);
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Could not start the assistant" },
            502,
          );
        }
      }
      if (conversation.busy) return json({ error: "Still answering the last message" }, 409);

      const active = conversation;
      const conversationId = id!;
      active.busy = true;
      active.lastUsed = Date.now();

      const stop = new AbortController();
      request.signal.addEventListener("abort", () => stop.abort(), { once: true });
      const finish = () => {
        active.busy = false;
        active.lastUsed = Date.now();
      };
      const encoder = new TextEncoder();
      const frame = (event: string, data: unknown) =>
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      let iterator: AsyncIterator<{ type: string; text?: string; message?: string }>;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(frame("conversation", { conversationId }));
          iterator = active.session.send(message, stop.signal)[Symbol.asyncIterator]();
        },
        async pull(controller) {
          try {
            const { done, value } = await iterator.next();
            if (done) {
              finish();
              controller.enqueue(frame("done", {}));
              controller.close();
              return;
            }
            controller.enqueue(frame(value.type, value));
          } catch (error) {
            finish();
            controller.enqueue(
              frame("error", {
                message: error instanceof Error ? error.message : "The assistant failed",
              }),
            );
            controller.close();
          }
        },
        async cancel() {
          stop.abort();
          await iterator.return?.();
          finish();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    },

    /** `DELETE ?conversation=<id>`: ends a conversation. */
    close(request: Request): Response {
      const id = new URL(request.url).searchParams.get("conversation");
      if (!id || !conversations.has(id)) return json({ error: "No such conversation" }, 404);
      release(id);
      return json({});
    },
  };
}
