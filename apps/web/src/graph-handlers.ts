import { copilotModel } from "@app/copilot-sdk";
import {
  createGraphBuilder,
  createGraphHandlers,
  createGraphPipeline,
  createLiveGraphSwitch,
} from "@app/features/graph/server";
import { graphStore, pipelineLog, settingsStore, transcriptStore } from "./storage";

// "Generate graph" on a saved transcript. It runs only when someone asks for it, whatever the live
// graph switch says, and counts against the signed-in Copilot account.
const builder = createGraphBuilder({
  graph: graphStore,
  log: pipelineLog,
  model: copilotModel(),
  transcripts: transcriptStore,
});

// Building the graph while a meeting is recorded asks a model about it as it happens and counts
// against the signed-in Copilot account, so it is off until the person switches it on in the app.
const liveGraph = createLiveGraphSwitch(settingsStore);

export const graphHandlers = createGraphHandlers(graphStore, pipelineLog, builder, liveGraph);

// Swap `copilotModel()` to use another model.
export const recordingObservers = [
  createGraphPipeline({
    graph: graphStore,
    log: pipelineLog,
    model: copilotModel(),
    enabled: liveGraph.enabled,
  }),
];
