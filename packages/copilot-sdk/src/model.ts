import type { StructuredModel } from "@app/contracts";
import { NO_TOOLS, copilotClient, emptyWorkingDirectory } from "./runtime";

export type CopilotModelOptions = {
  /**
   * The model id. Defaults to the first of `PREFERRED` the account can use, then to the runtime's own
   * choice (which in practice is a weak model that answers these prompts poorly).
   */
  model?: string;
  /** How long one call may take. Default 90 seconds. */
  timeoutMs?: number;
};

/**
 * Models that answered the graph prompts well in testing, best first. Names change. `claude-haiku-5.5`
 * is left out: it answered the typed prompts with empty placeholders (it picks the smallest branch of
 * an `anyOf`).
 */
const PREFERRED = ["gpt-5.6-luna", "mai-code-2-flash", "gpt-5.6-sol-fast"];

/** The answer, parsed; some models wrap JSON in a code fence even when asked for JSON only. */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    throw new Error(`The model did not answer with JSON: ${trimmed.slice(0, 200)}`);
  }
}

/**
 * Typed answers through the GitHub Copilot SDK. Each call is a session of its own with no tools, so
 * the model sees only what the call gives it. Calls count against the signed-in account's Copilot usage.
 */
export function copilotModel({
  model: asked,
  timeoutMs = 90_000,
}: CopilotModelOptions = {}): StructuredModel {
  let resolved: Promise<string | undefined> | undefined;

  /** The model to use, worked out once. */
  function chosenModel(): Promise<string | undefined> {
    return (resolved ??= asked
      ? Promise.resolve(asked)
      : copilotClient()
          .then((client) => client.listModels())
          .then((list) => {
            const ids = new Set(list.map((item) => item.id));
            return PREFERRED.find((id) => ids.has(id));
          })
          .catch(() => undefined));
  }

  return {
    async complete({ instructions, prompt, schema }, signal) {
      signal?.throwIfAborted();
      const started = Date.now();
      const model = await chosenModel();
      const session = await (
        await copilotClient()
      ).createSession({
        model,
        streaming: false,
        workingDirectory: emptyWorkingDirectory(),
        excludedTools: NO_TOOLS,
        onPermissionRequest: () => ({ kind: "reject" }),
        systemMessage: { mode: "replace", content: instructions },
      });

      const abort = () => void session.abort().catch(() => {});
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const reply = await session.sendAndWait({ prompt, responseSchema: schema }, timeoutMs);
        signal?.throwIfAborted();
        const content = reply?.data.content;
        if (!content) throw new Error("The model gave no answer");
        return { value: parseJson(content), durationMs: Date.now() - started, model };
      } finally {
        signal?.removeEventListener("abort", abort);
        void session.disconnect().catch(() => {});
      }
    },
  };
}
