import type { ChatEvent, ChatSession, ChatSessionOptions } from "@app/contracts";
import type { CopilotSession, SessionConfig } from "@github/copilot-sdk";
import { createHash } from "node:crypto";
import { NO_TOOLS, copilotClient, emptyWorkingDirectory } from "./runtime";

/**
 * Starts a Copilot conversation, or resumes the one `key` names. The runtime picks the model unless
 * `model` is given.
 */
export async function createCopilotSession({
  instructions,
  model,
  effort,
  key,
}: ChatSessionOptions = {}): Promise<ChatSession> {
  const copilot = await copilotClient();
  const config: SessionConfig = {
    model,
    ...(effort && { reasoningEffort: effort }),
    streaming: true,
    workingDirectory: emptyWorkingDirectory(),
    excludedTools: NO_TOOLS,
    // Nothing is meant to ask, but if something does, the answer is no.
    onPermissionRequest: () => ({ kind: "reject" as const }),
    ...(instructions && { systemMessage: { mode: "append" as const, content: instructions } }),
  };
  if (!key) return wrap(await copilot.createSession(config));

  // The same key always maps to the same Copilot session, so a meeting keeps its conversation.
  const sessionId = `boardroom-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
  if (await copilot.getSessionMetadata(sessionId)) {
    return wrap(await copilot.resumeSession(sessionId, config));
  }
  return wrap(await copilot.createSession({ ...config, sessionId }));
}

function wrap(session: CopilotSession): ChatSession {
  return {
    send(prompt, signal) {
      return (async function* () {
        const queue: (ChatEvent | "end")[] = [];
        let wake: (() => void) | undefined;
        const push = (event: ChatEvent | "end") => {
          queue.push(event);
          wake?.();
        };

        // Models that do not stream send the whole answer at once; streamed ones also send it at the end.
        const streamed = new Set<string>();
        const unsubscribe = [
          session.on("assistant.message_delta", (event) => {
            streamed.add(event.data.messageId);
            push({ type: "delta", text: event.data.deltaContent });
          }),
          session.on("assistant.message", (event) => {
            if (!streamed.has(event.data.messageId) && event.data.content) {
              push({ type: "delta", text: event.data.content });
            }
          }),
          session.on("session.error", (event) =>
            push({ type: "error", message: event.data.message }),
          ),
          session.on("session.idle", () => push("end")),
        ];
        const abort = () => void session.abort().catch(() => {});
        signal.addEventListener("abort", abort, { once: true });

        try {
          await session.send(prompt);
          while (true) {
            const next = queue.shift();
            if (next === "end") return;
            if (next) yield next;
            else if (signal.aborted) return;
            else await new Promise<void>((resolve) => (wake = resolve));
          }
        } finally {
          signal.removeEventListener("abort", abort);
          for (const stop of unsubscribe) stop();
        }
      })();
    },

    close: () => session.disconnect(),
  };
}
