import type { GraphStore, PipelineEventKind, PipelineLog, StructuredModel } from "@app/contracts";
import { EXTRACT_INSTRUCTIONS, EXTRACT_SCHEMA, extractContext, planChanges } from "./extract";
import type { Rejection } from "./extract";
import type { Turn } from "./turns";

export type ExtractionDeps = {
  graph: GraphStore;
  log: PipelineLog;
  model: StructuredModel;
  meetingId: string;
};

export type ExtractionResult = {
  /** Changes the model proposed. */
  proposed: number;
  /** Changes the graph accepted. */
  accepted: number;
  /** Changes dropped by the checks or refused by the graph. */
  rejected: number;
};

const note = (log: PipelineLog, meetingId: string, kind: PipelineEventKind, detail: object) =>
  log.record(meetingId, kind, detail as Record<string, unknown>).catch(() => {});

/**
 * One Extract step: asks the model what a batch of turns changes in the graph, checks the answer, and
 * applies what survives in one transaction. Logs the run and every rejection. Rejects when the model
 * call fails, so the caller decides whether to retry.
 */
export async function extractTurns(
  { graph, log, model, meetingId }: ExtractionDeps,
  turns: Turn[],
  touches: string[],
  signal: AbortSignal,
): Promise<ExtractionResult> {
  const started = Date.now();
  const current = await graph.getGraph(meetingId);
  const context = extractContext(turns, current, touches);
  const answer = await model.complete(
    {
      tier: "smart",
      instructions: EXTRACT_INSTRUCTIONS,
      prompt: context.prompt,
      schema: EXTRACT_SCHEMA,
    },
    signal,
  );

  const plan = planChanges(answer.value, context.labels, meetingId, current);
  const results =
    plan.commands.length > 0 ? await graph.apply(plan.commands, { source: "stated" }) : [];
  const rejections: Rejection[] = [...plan.rejections];
  results.forEach((result, position) => {
    if (!result.ok) {
      rejections.push({
        index: plan.origins[position],
        op: plan.commands[position].kind,
        reason: `${result.code}: ${result.message}`,
        change: plan.commands[position],
      });
    }
  });

  const raw = (answer.value as { changes?: unknown } | null)?.changes;
  const result = {
    proposed: Array.isArray(raw) ? raw.length : 0,
    accepted: results.filter((item) => item.ok).length,
    rejected: rejections.length,
  };

  const turnIds = turns.map((turn) => turn.id);
  await note(log, meetingId, "extract", {
    turnIds,
    ...result,
    adjustments: plan.adjustments,
    promptChars: context.prompt.length,
    model: answer.model,
    effort: answer.effort,
    ms: Date.now() - started,
  });
  for (const rejection of rejections)
    await note(log, meetingId, "rejection", { turnIds, ...rejection });
  return result;
}
