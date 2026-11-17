import type { ModelTier, StructuredModel } from "@app/contracts";
import type { ModelInfo } from "@github/copilot-sdk";
import { NO_TOOLS, copilotClient, emptyWorkingDirectory } from "./runtime";

export type CopilotModelOptions = {
  /**
   * The model for each tier. A tier falls back to `COPILOT_FAST_MODEL` / `COPILOT_SMART_MODEL`, then to
   * the first of `PREFERRED` the account can use, then to the runtime's own choice (which in practice is
   * a weak model that answers these prompts poorly).
   */
  models?: Partial<Record<ModelTier, string>>;
  /**
   * How hard each tier's model thinks before answering (`none`, `low`, `medium`...). A tier falls back to
   * `COPILOT_FAST_EFFORT` / `COPILOT_SMART_EFFORT`, then to `none`. It is only sent when the chosen
   * model lists it as supported; otherwise the model's own default applies.
   */
  efforts?: Partial<Record<ModelTier, string>>;
  /** How long one call may take. Default 90 seconds. */
  timeoutMs?: number;
};

/**
 * Models that answered the graph prompts well in testing, best first for each tier. Names change;
 * override with the env vars. `claude-haiku-5.5` is left out: it answered the typed prompts with
 * empty placeholders (it picks the smallest branch of an `anyOf`).
 */
const PREFERRED: Record<ModelTier, string[]> = {
  fast: ["gpt-5.6-luna", "mai-code-2-flash", "claude-haiku-4.5"],
  smart: ["gpt-5.6-luna", "mai-code-2-flash", "gpt-5.6-sol-fast"],
};

/**
 * Measured on `gpt-5.6-luna` with a 7-turn extraction: `none` took 8 to 11 seconds, `low` about 13 and the
 * default 15 to 18, with answers of the same quality. The graph steps are reading and labelling, not
 * puzzles, so they do not need to think first.
 */
const DEFAULT_EFFORT = "none";

type Resolved = { model: string | undefined; effort: string | undefined };

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
  models = {},
  efforts = {},
  timeoutMs = 90_000,
}: CopilotModelOptions = {}): StructuredModel {
  const resolved = new Map<ModelTier, Promise<Resolved>>();
  let catalog: Promise<ModelInfo[]> | undefined;
  const available = () =>
    (catalog ??= copilotClient()
      .then((client) => client.listModels())
      .catch(() => [] as ModelInfo[]));

  /** The model and reasoning effort for a tier, worked out once. */
  function settingsFor(tier: ModelTier): Promise<Resolved> {
    let found = resolved.get(tier);
    if (!found) {
      found = (async () => {
        const asked =
          models[tier] ||
          (tier === "fast" ? process.env.COPILOT_FAST_MODEL : process.env.COPILOT_SMART_MODEL) ||
          undefined;
        const list = await available();
        const ids = new Set(list.map((item) => item.id));
        const model = asked ?? PREFERRED[tier].find((id) => ids.has(id));

        const wanted =
          efforts[tier] ||
          (tier === "fast" ? process.env.COPILOT_FAST_EFFORT : process.env.COPILOT_SMART_EFFORT) ||
          DEFAULT_EFFORT;
        const supported = list.find((item) => item.id === model)?.supportedReasoningEfforts;
        return { model, effort: supported?.includes(wanted) ? wanted : undefined };
      })();
      resolved.set(tier, found);
    }
    return found;
  }

  return {
    async complete({ tier, instructions, prompt, schema }, signal) {
      signal?.throwIfAborted();
      const started = Date.now();
      const { model, effort } = await settingsFor(tier);
      const session = await (
        await copilotClient()
      ).createSession({
        model,
        ...(effort ? { reasoningEffort: effort } : {}),
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
        return { value: parseJson(content), durationMs: Date.now() - started, model, effort };
      } finally {
        signal?.removeEventListener("abort", abort);
        void session.disconnect().catch(() => {});
      }
    },
  };
}
