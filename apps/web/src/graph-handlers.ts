import { copilotModel } from "@app/copilot-sdk";
import {
  createGraphBuilder,
  createGraphHandlers,
  createGraphPipeline,
} from "@app/features/graph/server";
import { graphStore, pipelineLog, transcriptStore } from "./storage";

// "Generate graph" on a saved transcript. It runs only when someone asks for it, whatever
// GRAPH_PIPELINE says, and counts against the signed-in Copilot account.
const builder = createGraphBuilder({
  graph: graphStore,
  log: pipelineLog,
  model: copilotModel(),
  transcripts: transcriptStore,
});

export const graphHandlers = createGraphHandlers(graphStore, pipelineLog, builder);

// Building the graph asks a model about the meeting as it happens and counts against the signed-in
// Copilot account, so it is off until GRAPH_PIPELINE=on. Swap `copilotModel()` to use another model.
export const recordingObservers =
  process.env.GRAPH_PIPELINE === "on"
    ? [createGraphPipeline({ graph: graphStore, log: pipelineLog, model: copilotModel() })]
    : [];
