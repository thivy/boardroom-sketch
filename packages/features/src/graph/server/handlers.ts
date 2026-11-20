import type { GraphStore, PipelineLog } from "@app/contracts";
import type { GraphBuilder } from "./build";
import { buildCancel, buildStart, buildStatus } from "./build-handlers";
import { getGraph, getHistory, listEvents } from "./graph-handlers";
import { liveStatus, liveUpdate } from "./live-handlers";
import type { LiveGraphSwitch } from "./live-graph-switch";

/**
 * Composes the graph endpoint groups into plain `(Request) => Response` handlers over a `GraphStore`,
 * a `PipelineLog`, a `GraphBuilder` and the live-graph switch.
 */
export function createGraphHandlers(
  graph: GraphStore,
  log: PipelineLog,
  builder: GraphBuilder,
  liveGraph: LiveGraphSwitch,
) {
  return {
    liveStatus: () => liveStatus(liveGraph),
    liveUpdate: (request: Request) => liveUpdate(request, liveGraph),
    buildStatus: (request: Request) => buildStatus(request, builder),
    buildStart: (request: Request) => buildStart(request, builder),
    buildCancel: (request: Request) => buildCancel(request, builder),
    graph: (request: Request) => getGraph(request, graph),
    history: (request: Request) => getHistory(request, graph),
    events: (request: Request) => listEvents(request, log),
  };
}
