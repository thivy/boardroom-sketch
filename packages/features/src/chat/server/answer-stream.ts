import { SSE_HEADERS, sseFrame } from "../../shared/server/http";
import type { Conversation } from "./conversations";

/**
 * Sends `message` to the conversation and streams the answer as server-sent events: `conversation`
 * (its id), then `delta`s, then `done`, or `error`. The conversation is busy until the stream ends,
 * and stops answering when the request is abandoned.
 */
export function answerStream(
  conversation: Conversation,
  conversationId: string,
  message: string,
  requestSignal: AbortSignal,
): Response {
  conversation.busy = true;
  conversation.lastUsed = Date.now();

  const stop = new AbortController();
  requestSignal.addEventListener("abort", () => stop.abort(), { once: true });
  const finish = () => {
    conversation.busy = false;
    conversation.lastUsed = Date.now();
  };
  let iterator: AsyncIterator<{ type: string }>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sseFrame("conversation", { conversationId }));
      iterator = conversation.session.send(message, stop.signal)[Symbol.asyncIterator]();
    },
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) {
          finish();
          controller.enqueue(sseFrame("done", {}));
          controller.close();
          return;
        }
        controller.enqueue(sseFrame(value.type, value));
      } catch (error) {
        finish();
        const message = error instanceof Error ? error.message : "The assistant failed";
        controller.enqueue(sseFrame("error", { message }));
        controller.close();
      }
    },
    async cancel() {
      stop.abort();
      await iterator.return?.();
      finish();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
