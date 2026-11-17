import { copilotModel } from "@app/copilot-sdk";
import { createGraphHandlers, createGraphPipeline } from "@app/features/graph/server";
import { graphStore, pipelineLog } from "./storage";

export const graphHandlers = createGraphHandlers(graphStore, pipelineLog);

// Building the graph asks a model about the meeting as it happens and counts against the signed-in
// Copilot account, so it is off until GRAPH_PIPELINE=on. Swap `copilotModel()` to use another model.
export const recordingObservers =
  process.env.GRAPH_PIPELINE === "on"
    ? [createGraphPipeline({ graph: graphStore, log: pipelineLog, model: copilotModel() })]
    : [];
