import type {
  ChatBackend,
  ChatEvent,
  ChatSession,
  ChatSessionOptions,
  ChatStatus,
} from "@app/contracts";
import { CopilotClient, type CopilotSession } from "@github/copilot-sdk";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CopilotChatOptions = {
  /** The model id. Defaults to `COPILOT_MODEL`, then the runtime's own choice. */
  model?: string;
};

const INSTRUCTIONS = `You help the user analyse transcripts of their meetings.
Answer from the transcript when one is given, and say so when it does not contain the answer.
Keep answers concise and use plain text or simple lists.
You have no tools: you cannot run commands, read or write files, or browse. Never write tool calls or tool output; if asked to do any of that, say you cannot.`;

/** This is a chat, not an agent: no shell, no files, no MCP servers, whatever the user has installed. */
const NO_TOOLS = ["builtin:*", "mcp:*", "custom:*"];

/** A folder with nothing in it, so the runtime does not pick up instructions from wherever the server runs. */
function emptyWorkingDirectory() {
  const directory = join(tmpdir(), "boardroom-sketch-chat");
  mkdirSync(directory, { recursive: true });
  return directory;
}

/**
 * Answers through the GitHub Copilot SDK, which drives the Copilot CLI runtime with the account the
 * machine is already signed in to (`gh auth login`, or `COPILOT_GITHUB_TOKEN`).
 */
export function copilotChat({
  model = process.env.COPILOT_MODEL || undefined,
}: CopilotChatOptions = {}): ChatBackend {
  let client: Promise<CopilotClient> | undefined;

  // One runtime serves every conversation; it starts with the first use.
  const getClient = () => {
    client ??= (async () => {
      const created = new CopilotClient();
      await created.start();
      return created;
    })().catch((error) => {
      client = undefined;
      throw error;
    });
    return client;
  };

  return {
    async status(): Promise<ChatStatus> {
      try {
        const auth = await (await getClient()).getAuthStatus();
        if (auth.isAuthenticated) {
          return {
            available: true,
            account: auth.login,
            message: auth.statusMessage ?? `Signed in as ${auth.login}`,
          };
        }
        return {
          available: false,
          message: "Not signed in to GitHub Copilot. Run `gh auth login` and try again.",
        };
      } catch (error) {
        return {
          available: false,
          message: error instanceof Error ? error.message : "Could not start the Copilot runtime.",
        };
      }
    },

    async createSession({ context }: ChatSessionOptions = {}): Promise<ChatSession> {
      const session = await (
        await getClient()
      ).createSession({
        model,
        streaming: true,
        workingDirectory: emptyWorkingDirectory(),
        excludedTools: NO_TOOLS,
        // Nothing is meant to ask, but if something does, the answer is no.
        onPermissionRequest: () => ({ kind: "reject" }),
        systemMessage: {
          mode: "append",
          content: context ? `${INSTRUCTIONS}\n\n${context}` : INSTRUCTIONS,
        },
      });
      return wrap(session);
    },
  };
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
