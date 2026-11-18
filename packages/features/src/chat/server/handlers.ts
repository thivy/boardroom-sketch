import type { CreateChatSession, GetChatStatus, TranscriptStore } from "@app/contracts";
import { json, queryParam, readJson, rejectNonJson } from "../../shared/server/http";
import { answerStream } from "./answer-stream";
import { createConversations } from "./conversations";

const MAX_MESSAGE = 20_000;

/**
 * The chat endpoints, as plain `(Request) => Response` handlers over a way to read the assistant's
 * status, a way to start a conversation, and a `TranscriptStore`.
 */
export function createChatHandlers(
  getChatStatus: GetChatStatus,
  createChatSession: CreateChatSession,
  store: TranscriptStore,
) {
  const conversations = createConversations(createChatSession, store);

  return {
    /** `GET`: whether the assistant can be used, and as whom. */
    async status(): Promise<Response> {
      return json(await getChatStatus());
    },

    /**
     * `POST { message, conversationId?, transcriptSessionId? }`: sends a message and streams the answer
     * as server-sent events: `conversation` (its id), then `delta`s, then `done`, or `error`.
     * Without a `conversationId` a conversation starts, and `transcriptSessionId` gives it a transcript.
     */
    async message(request: Request): Promise<Response> {
      const rejected = rejectNonJson(request);
      if (rejected) return rejected;
      const body = await readJson<{
        message: unknown;
        conversationId: unknown;
        transcriptSessionId: unknown;
      }>(request);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json({ error: "Missing message" }, 400);
      if (message.length > MAX_MESSAGE) return json({ error: "That message is too long" }, 413);

      let id = typeof body.conversationId === "string" ? body.conversationId : undefined;
      let conversation = id ? conversations.get(id) : undefined;
      if (id && !conversation) return json({ error: "That conversation has ended" }, 404);

      if (!conversation) {
        const transcriptSessionId =
          body.transcriptSessionId === undefined || body.transcriptSessionId === null
            ? undefined
            : Number(body.transcriptSessionId);
        const opened = await conversations.open(transcriptSessionId);
        if ("error" in opened) return json({ error: opened.error }, opened.status);
        ({ id, conversation } = opened);
      }
      if (conversation.busy) return json({ error: "Still answering the last message" }, 409);

      return answerStream(conversation, id!, message, request.signal);
    },

    /** `DELETE ?conversation=<id>`: ends a conversation. */
    close(request: Request): Response {
      const id = queryParam(request, "conversation");
      if (!id || !conversations.close(id)) return json({ error: "No such conversation" }, 404);
      return json({});
    },
  };
}
