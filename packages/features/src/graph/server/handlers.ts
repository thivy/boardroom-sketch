import {
  GraphRuleError,
  type GraphStore,
  type PipelineEventKind,
  type PipelineLog,
} from "@app/contracts";
import { BuildError, type GraphBuilder } from "./build";
import type { LiveGraphSwitch } from "./live-graph-switch";
import { idParam, json, queryParam, readJson, rejectNonJson } from "../../shared/server/http";

const KINDS: PipelineEventKind[] = ["triage", "extract", "rejection", "error"];

/**
 * The graph endpoints, as plain `(Request) => Response` handlers over a `GraphStore`, a `PipelineLog`,
 * a `GraphBuilder` and the live-graph switch.
 */
export function createGraphHandlers(
  graph: GraphStore,
  log: PipelineLog,
  builder: GraphBuilder,
  liveGraph: LiveGraphSwitch,
) {
  return {
    /** `GET`: whether the graph is built while a meeting is recorded. */
    async liveStatus(): Promise<Response> {
      return json({ enabled: await liveGraph.get() });
    },

    /** `PUT { enabled }`: turns building the graph during a recording on or off. */
    async liveUpdate(request: Request): Promise<Response> {
      const rejected = rejectNonJson(request);
      if (rejected) return rejected;
      const body = await readJson<{ enabled: unknown }>(request);
      if (typeof body.enabled !== "boolean") return json({ error: "Missing enabled" }, 400);
      return json({ enabled: await liveGraph.set(body.enabled) });
    },

    /** `GET ?session=<id>&meeting=<id>`: where building the graph from that transcript is. */
    async buildStatus(request: Request): Promise<Response> {
      const session = idParam(request, "session");
      const meeting = queryParam(request, "meeting");
      if (session === undefined || !meeting)
        return json({ error: "Missing session or meeting" }, 400);
      return json(await builder.status(session, meeting));
    },

    /**
     * `POST { sessionId, replace? }`: starts building the graph from a saved transcript. Answers 409 with
     * code `graph_exists` when the meeting already has a graph and `replace` was not set.
     */
    async buildStart(request: Request): Promise<Response> {
      const rejected = rejectNonJson(request);
      if (rejected) return rejected;
      const body = await readJson<{ sessionId: unknown; replace: unknown }>(request);
      if (!Number.isInteger(body.sessionId) || (body.sessionId as number) <= 0) {
        return json({ error: "Missing sessionId" }, 400);
      }
      try {
        const status = await builder.start(body.sessionId as number, {
          replace: body.replace === true,
        });
        return json(status, 202);
      } catch (error) {
        if (error instanceof BuildError) {
          return json({ error: error.message, code: error.code }, error.status);
        }
        throw error;
      }
    },

    /** `DELETE ?session=<id>`: stops a running build; what was built so far is kept. */
    buildCancel(request: Request): Response {
      const session = idParam(request, "session");
      if (session === undefined) return json({ error: "Missing session" }, 400);
      return builder.cancel(session) ? json({}) : json({ error: "No build is running" }, 404);
    },

    /**
     * `GET ?meeting=<id>`: the meeting's graph. Add `asOfOp=<n>` or `asOfTime=<epoch ms>` to see it as
     * it stood then.
     */
    async graph(request: Request): Promise<Response> {
      const meeting = queryParam(request, "meeting");
      if (!meeting) return json({ error: "Missing meeting" }, 400);
      const op = queryParam(request, "asOfOp");
      const time = queryParam(request, "asOfTime");
      if (op !== null && !Number.isInteger(Number(op))) return json({ error: "Bad asOfOp" }, 400);
      if (time !== null && !Number.isFinite(Number(time)))
        return json({ error: "Bad asOfTime" }, 400);
      if (op !== null) return json(await graph.asOf(meeting, { opId: Number(op) }));
      if (time !== null) return json(await graph.asOf(meeting, { at: Number(time) }));
      return json(await graph.getGraph(meeting));
    },

    /** `GET ?node=<id>` or `?edge=<id>`: what happened to a node or an edge, with the quotes behind it. */
    async history(request: Request): Promise<Response> {
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
    },

    /** `GET ?meeting=<id>[&kind=triage|extract|rejection|error][&limit=<n>]`: what the pipeline did and decided. */
    async events(request: Request): Promise<Response> {
      const meeting = queryParam(request, "meeting");
      if (!meeting) return json({ error: "Missing meeting" }, 400);
      const kind = queryParam(request, "kind");
      if (kind !== null && !(KINDS as string[]).includes(kind))
        return json({ error: "Bad kind" }, 400);
      const limit = Number(queryParam(request, "limit") ?? 500);
      return json(
        await log.list(meeting, {
          kind: (kind as PipelineEventKind | null) ?? undefined,
          limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 5_000) : 500,
        }),
      );
    },
  };
}
