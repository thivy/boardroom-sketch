import { json, queryParam, readJson, rejectNonJson } from "../../shared/server/http";
import { answerStream } from "./answer-stream";
import type { createConversations } from "./conversations";

const MAX_MESSAGE = 20_000;

type Conversations = ReturnType<typeof createConversations>;

/**
 * `POST { message, conversationId?, transcriptSessionId? }`: sends a message and streams the answer
 * as server-sent events: `conversation` (its id), then `delta`s, then `done`, or `error`.
 * Without a `conversationId` a conversation starts, and `transcriptSessionId` gives it a transcript.
 */
export async function sendMessage(
  request: Request,
  conversations: Conversations,
): Promise<Response> {
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
}

/** `DELETE ?conversation=<id>`: ends a conversation. */
export function closeConversation(request: Request, conversations: Conversations): Response {
  const id = queryParam(request, "conversation");
  if (!id || !conversations.close(id)) return json({ error: "No such conversation" }, 404);
  return json({});
}
