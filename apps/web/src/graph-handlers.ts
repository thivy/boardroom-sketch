import { copilotModel } from "@app/copilot-sdk";
import {
  createGraphBuilder,
  createGraphHandlers,
  createGraphPipeline,
  createLiveGraphSwitch,
} from "@app/features/graph/server";
import { graphStore, pipelineLog, settingsStore, transcriptStore } from "./storage";

// Both ask the signed-in Copilot account's model, so they share one and its choice is made once.
const model = copilotModel();

// "Generate graph" on a saved transcript. It runs only when someone asks for it, whatever the live
// graph switch says, and counts against the signed-in Copilot account.
const builder = createGraphBuilder({
  graph: graphStore,
  log: pipelineLog,
  model,
  transcripts: transcriptStore,
});

// Building the graph while a meeting is recorded asks a model about it as it happens and counts
// against the signed-in Copilot account, so it is off until the person switches it on in the app.
const liveGraph = createLiveGraphSwitch(settingsStore);

export const graphHandlers = createGraphHandlers(graphStore, pipelineLog, builder, liveGraph);

export const recordingObservers = [
  createGraphPipeline({
    graph: graphStore,
    log: pipelineLog,
    model,
    enabled: liveGraph.enabled,
  }),
];
