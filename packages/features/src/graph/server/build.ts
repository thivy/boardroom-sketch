import type {
  GraphBuildStatus,
  GraphStore,
  PipelineLog,
  StructuredModel,
  TranscriptStore,
} from "@app/contracts";
import { extractTurns } from "./extraction";
import { turnsFromCaptions, type Turn } from "./turns";

/** A request the builder will not carry out, with the HTTP status that suits it. */
export class BuildError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "BuildError";
    this.status = status;
    this.code = code;
  }
}

export type GraphBuilderOptions = {
  graph: GraphStore;
  log: PipelineLog;
  model: StructuredModel;
  transcripts: TranscriptStore;
  /** The most turns read in one extraction call. Default 8. */
  maxBatch?: number;
  /** About this much text at most per call. Default 6,000 characters. */
  maxBatchChars?: number;
  /** A transcript needing more calls than this is refused. Default 300. */
  maxBatches?: number;
  extractTimeoutMs?: number;
};

type Job = { status: Omit<GraphBuildStatus, "nodes">; stop: AbortController };

/** Groups turns into the batches sent to the model: not too many turns, not too much text. */
function batchesOf(turns: Turn[], maxTurns: number, maxChars: number): Turn[][] {
  const batches: Turn[][] = [];
  let current: Turn[] = [];
  let chars = 0;
  for (const turn of turns) {
    const size = turn.lines.reduce((sum, line) => sum + line.text.length, 0);
    if (current.length > 0 && (current.length >= maxTurns || chars + size > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(turn);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Builds a meeting's graph from a transcript that is already saved: its turns are read in order, a few
 * at a time, through the same Extract step the live pipeline uses. There is no Triage here, since with
 * nobody waiting it would cost one call per turn to save a fraction of the extraction calls. One build
 * runs per meeting, and the graph fills in as it goes, so the graph page can show it happening.
 */
export function createGraphBuilder({
  graph,
  log,
  model,
  transcripts,
  maxBatch = 8,
  maxBatchChars = 6_000,
  maxBatches = 300,
  extractTimeoutMs = 120_000,
}: GraphBuilderOptions) {
  const jobs = new Map<number, Job>();

  const nodesOf = async (meetingId: string) => (await graph.getGraph(meetingId)).nodes.length;

  async function run(job: Job, batches: Turn[][], meetingId: string) {
    const { status } = job;
    const deps = { graph, log, model, meetingId };
    let consecutive = 0;

    try {
      for (const batch of batches) {
        if (job.stop.signal.aborted) break;

        let succeeded = false;
        let lastError = "";
        for (let attempt = 0; attempt < 2 && !succeeded; attempt++) {
          try {
            const result = await extractTurns(
              deps,
              batch,
              [],
              AbortSignal.any([job.stop.signal, AbortSignal.timeout(extractTimeoutMs)]),
            );
            status.accepted += result.accepted;
            status.rejected += result.rejected;
            succeeded = true;
          } catch (error) {
            if (job.stop.signal.aborted) break;
            lastError = error instanceof Error ? error.message : String(error);
            await log
              .record(meetingId, "error", {
                step: "build",
                turnIds: batch.map((turn) => turn.id),
                message: lastError,
                attempt: attempt + 1,
              })
              .catch(() => {});
          }
        }
        if (job.stop.signal.aborted) break;

        status.batches++;
        status.processed += batch.length;
        if (succeeded) {
          consecutive = 0;
        } else {
          status.failedBatches++;
          if (++consecutive >= 3) {
            throw new Error(`Three batches in a row failed. The last error: ${lastError}`);
          }
        }
      }
      status.state = job.stop.signal.aborted ? "cancelled" : "done";
    } catch (error) {
      status.state = "failed";
      status.error = error instanceof Error ? error.message : String(error);
    } finally {
      status.finishedAt = Date.now();
    }
  }

  return {
    /**
     * Starts building the graph from a saved transcript. Refuses when the recording is still running,
     * when a build for the meeting is already going, when the meeting already has a graph (unless
     * `replace`, which clears it first), or when the transcript is empty or too long.
     */
    async start(sessionId: number, { replace = false }: { replace?: boolean } = {}) {
      const transcript = await transcripts.getSession(sessionId);
      if (!transcript) throw new BuildError(404, "No such transcript");
      const { session, captions } = transcript;
      const meetingId = session.meetingId;

      if (session.endedAt === null) {
        throw new BuildError(409, "That recording is still running. Stop it first.", "recording");
      }
      for (const job of jobs.values()) {
        if (job.status.meetingId === meetingId && job.status.state === "running") {
          throw new BuildError(409, "A graph is already being built for this meeting.", "running");
        }
      }
      const existing = await nodesOf(meetingId);
      if (existing > 0 && !replace) {
        throw new BuildError(
          409,
          `This meeting already has a graph of ${existing} nodes. Building again replaces it.`,
          "graph_exists",
        );
      }

      const turns = turnsFromCaptions(session.id, captions);
      if (turns.length === 0) throw new BuildError(422, "This transcript has no captions.");
      const batches = batchesOf(turns, maxBatch, maxBatchChars);
      if (batches.length > maxBatches) {
        throw new BuildError(
          413,
          `This transcript needs ${batches.length} model calls, more than the limit of ${maxBatches}.`,
        );
      }

      if (existing > 0) await graph.clearGraph(meetingId);
      const job: Job = {
        stop: new AbortController(),
        status: {
          sessionId,
          meetingId,
          state: "running",
          turns: turns.length,
          processed: 0,
          batches: 0,
          failedBatches: 0,
          accepted: 0,
          rejected: 0,
          startedAt: Date.now(),
        },
      };
      jobs.set(sessionId, job);
      void run(job, batches, meetingId);
      return { ...job.status, nodes: 0 } satisfies GraphBuildStatus;
    },

    /** Where a build is, or `idle` (with the size of the meeting's current graph) if none has run. */
    async status(sessionId: number, meetingId: string): Promise<GraphBuildStatus> {
      const nodes = await nodesOf(meetingId);
      const job = jobs.get(sessionId);
      if (job) return { ...job.status, nodes };
      return {
        sessionId,
        meetingId,
        state: "idle",
        turns: 0,
        processed: 0,
        batches: 0,
        failedBatches: 0,
        accepted: 0,
        rejected: 0,
        nodes,
      };
    },

    /** Stops a running build after the call in flight; what was built so far is kept. */
    cancel(sessionId: number): boolean {
      const job = jobs.get(sessionId);
      if (!job || job.status.state !== "running") return false;
      job.stop.abort();
      return true;
    },
  };
}

export type GraphBuilder = ReturnType<typeof createGraphBuilder>;
