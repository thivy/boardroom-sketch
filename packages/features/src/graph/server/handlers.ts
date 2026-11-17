import {
  GraphRuleError,
  type GraphStore,
  type PipelineEventKind,
  type PipelineLog,
} from "@app/contracts";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const param = (request: Request, name: string) => new URL(request.url).searchParams.get(name);
const KINDS: PipelineEventKind[] = ["triage", "extract", "rejection", "error"];

/** The graph endpoints, as plain `(Request) => Response` handlers over a `GraphStore` and a `PipelineLog`. */
export function createGraphHandlers(graph: GraphStore, log: PipelineLog) {
  return {
    /**
     * `GET ?meeting=<id>`: the meeting's graph. Add `asOfOp=<n>` or `asOfTime=<epoch ms>` to see it as
     * it stood then.
     */
    async graph(request: Request): Promise<Response> {
      const meeting = param(request, "meeting");
      if (!meeting) return json({ error: "Missing meeting" }, 400);
      const op = param(request, "asOfOp");
      const time = param(request, "asOfTime");
      if (op !== null && !Number.isInteger(Number(op))) return json({ error: "Bad asOfOp" }, 400);
      if (time !== null && !Number.isFinite(Number(time)))
        return json({ error: "Bad asOfTime" }, 400);
      if (op !== null) return json(await graph.asOf(meeting, { opId: Number(op) }));
      if (time !== null) return json(await graph.asOf(meeting, { at: Number(time) }));
      return json(await graph.getGraph(meeting));
    },

    /** `GET ?node=<id>` or `?edge=<id>`: what happened to a node or an edge, with the quotes behind it. */
    async history(request: Request): Promise<Response> {
      const nodeId = param(request, "node");
      const edgeId = param(request, "edge");
      if (!nodeId && !edgeId) return json({ error: "Give node or edge" }, 400);
      try {
        return json(await graph.history(nodeId ? { nodeId } : { edgeId: edgeId! }));
      } catch (error) {
        if (error instanceof GraphRuleError && error.code === "not_found") {
          return json({ error: error.message }, 404);
        }
        throw error;
      }
    },

    /** `GET ?meeting=<id>[&kind=triage|extract|rejection|error][&limit=<n>]`: what the pipeline did and decided. */
    async events(request: Request): Promise<Response> {
      const meeting = param(request, "meeting");
      if (!meeting) return json({ error: "Missing meeting" }, 400);
      const kind = param(request, "kind");
      if (kind !== null && !(KINDS as string[]).includes(kind))
        return json({ error: "Bad kind" }, 400);
      const limit = Number(param(request, "limit") ?? 500);
      return json(
        await log.list(meeting, {
          kind: (kind as PipelineEventKind | null) ?? undefined,
          limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 5_000) : 500,
        }),
      );
    },
  };
}
