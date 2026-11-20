import {
  GraphRuleError,
  type GraphStore,
  type PipelineEventKind,
  type PipelineLog,
} from "@app/contracts";
import { json, queryParam } from "../../shared/server/http";

const KINDS: PipelineEventKind[] = ["triage", "extract", "rejection", "error"];

/**
 * `GET ?meeting=<id>`: the meeting's graph. Add `asOfOp=<n>` or `asOfTime=<epoch ms>` to see it as
 * it stood then.
 */
export async function getGraph(request: Request, graph: GraphStore): Promise<Response> {
  const meeting = queryParam(request, "meeting");
  if (!meeting) return json({ error: "Missing meeting" }, 400);
  const op = queryParam(request, "asOfOp");
  const time = queryParam(request, "asOfTime");
  if (op !== null && !Number.isInteger(Number(op))) return json({ error: "Bad asOfOp" }, 400);
  if (time !== null && !Number.isFinite(Number(time))) return json({ error: "Bad asOfTime" }, 400);
  if (op !== null) return json(await graph.asOf(meeting, { opId: Number(op) }));
  if (time !== null) return json(await graph.asOf(meeting, { at: Number(time) }));
  return json(await graph.getGraph(meeting));
}

/** `GET ?node=<id>` or `?edge=<id>`: what happened to a node or an edge, with the quotes behind it. */
export async function getHistory(request: Request, graph: GraphStore): Promise<Response> {
  const nodeId = queryParam(request, "node");
  const edgeId = queryParam(request, "edge");
  if (!nodeId && !edgeId) return json({ error: "Give node or edge" }, 400);
  try {
    return json(await graph.history(nodeId ? { nodeId } : { edgeId: edgeId! }));
  } catch (error) {
    if (error instanceof GraphRuleError && error.code === "not_found") {
      return json({ error: error.message }, 404);
    }
    throw error;
  }
}

/** `GET ?meeting=<id>[&kind=triage|extract|rejection|error][&limit=<n>]`: what the pipeline did and decided. */
export async function listEvents(request: Request, log: PipelineLog): Promise<Response> {
  const meeting = queryParam(request, "meeting");
  if (!meeting) return json({ error: "Missing meeting" }, 400);
  const kind = queryParam(request, "kind");
  if (kind !== null && !(KINDS as string[]).includes(kind)) return json({ error: "Bad kind" }, 400);
  const limit = Number(queryParam(request, "limit") ?? 500);
  return json(
    await log.list(meeting, {
      kind: (kind as PipelineEventKind | null) ?? undefined,
      limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 5_000) : 500,
    }),
  );
}
