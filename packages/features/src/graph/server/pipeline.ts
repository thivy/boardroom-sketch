import type {
  ActiveRecording,
  Caption,
  GraphStore,
  PipelineEventKind,
  PipelineLog,
  RecordingObserver,
  StructuredModel,
} from "@app/contracts";
import { createAliases, openThreads } from "./context";
import { EXTRACT_MAX_TURNS, EXTRACT_TIMEOUT_MS, extractTurns } from "./extraction";
import {
  TRIAGE_INSTRUCTIONS,
  TRIAGE_SCHEMA,
  holdToRules,
  parseVerdict,
  triagePrompt,
  type Verdict,
} from "./triage";
import { createTurnBuilder, type Turn } from "./turns";

export type GraphPipelineOptions = {
  graph: GraphStore;
  log: PipelineLog;
  model: StructuredModel;
  /**
   * Asked on every caption. While it is false nothing new is followed, and a recording that was being
   * followed is finished off.
   */
  enabled: () => boolean;
};

type Entry = { turn: Turn; queuedAt: number; verdict?: Verdict; attempts: number };

const MAX_ATTEMPTS = 2;
/** How long turns wait for company before being extracted. */
const FLUSH_MS = 20_000;
/** Triage calls in flight at once. */
const TRIAGE_CONCURRENCY = 2;
/** Turns waiting for Triage beyond this go on without a verdict. */
const TRIAGE_BACKLOG = 6;
const TRIAGE_TIMEOUT_MS = 30_000;
/** A ceiling on model calls per recording, so a long meeting cannot run up usage unnoticed. */
const MAX_MODEL_CALLS = 400;

/**
 * Builds a meeting's graph while it is recorded. Finished turns go to Triage, which runs beside
 * everything else and only advises, and in batches to Extract, which proposes changes that plain
 * code checks and saves. One recording has one writer, so changes land in order.
 */
export function createGraphPipeline({ graph, log, model, enabled }: GraphPipelineOptions) {
  const runs = new Map<number, ReturnType<typeof createRun>>();

  function finish(sessionId: number) {
    const run = runs.get(sessionId);
    if (!run) return;
    runs.delete(sessionId);
    void run.end();
  }

  function createRun(recording: ActiveRecording) {
    const meetingId = recording.meetingId;
    const stop = new AbortController();
    const recent: Turn[] = [];
    const pending: Entry[] = [];
    const triageQueue: { entry: Entry; before: Turn[] }[] = [];
    let triageActive = 0;
    let extracting: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timerDue = Infinity;
    let calls = 0;
    let overBudget = false;
    let ended = false;
    let drained: Promise<void> | undefined;

    const emit = (kind: PipelineEventKind, detail: Record<string, unknown>) =>
      log.record(meetingId, kind, detail).catch(() => {});

    /** Counts a model call against the ceiling; false once it is spent. */
    function spend(step: string): boolean {
      if (calls < MAX_MODEL_CALLS) {
        calls++;
        return true;
      }
      if (!overBudget) {
        overBudget = true;
        void emit("error", {
          step,
          message: `Reached the limit of ${MAX_MODEL_CALLS} model calls for this recording`,
        });
      }
      return false;
    }

    // ---- Triage: advice only, never in the way ----

    async function triage(entry: Entry, before: Turn[]) {
      if (!spend("triage")) return;
      const started = Date.now();
      try {
        const current = await graph.getGraph(meetingId);
        const aliases = createAliases();
        const prompt = triagePrompt(entry.turn, before, openThreads(current), aliases);
        const answer = await model.complete(
          { instructions: TRIAGE_INSTRUCTIONS, prompt, schema: TRIAGE_SCHEMA },
          AbortSignal.any([stop.signal, AbortSignal.timeout(TRIAGE_TIMEOUT_MS)]),
        );
        const verdict = parseVerdict(answer.value, aliases);
        if (!verdict) throw new Error("The verdict was not one of the allowed shapes");
        const held = holdToRules(verdict, before.at(-1));
        entry.verdict = held.verdict;
        await emit("triage", {
          turnId: entry.turn.id,
          speaker: entry.turn.speaker,
          ...held.verdict,
          modelRoute: verdict.route,
          overridden: held.overridden,
          model: answer.model,
          ms: Date.now() - started,
        });
        if (held.verdict.route === "extract_now") schedule(0);
      } catch (error) {
        // Fail open: with no verdict the turn goes to Extract like any other.
        await emit("error", {
          step: "triage",
          turnId: entry.turn.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    function pumpTriage() {
      while (triageActive < TRIAGE_CONCURRENCY && triageQueue.length > 0) {
        const next = triageQueue.shift()!;
        triageActive++;
        void triage(next.entry, next.before).finally(() => {
          triageActive--;
          pumpTriage();
        });
      }
    }

    // ---- Extract: one batch at a time ----

    function schedule(ms: number) {
      const due = Date.now() + ms;
      if (timer && due >= timerDue) return;
      clearTimeout(timer);
      timerDue = due;
      timer = setTimeout(() => void flush(false), ms);
      timer.unref?.();
    }

    function flush(force: boolean): Promise<void> {
      clearTimeout(timer);
      timer = undefined;
      timerDue = Infinity;
      if (extracting) return extracting;
      if (pending.length === 0) return Promise.resolve();

      const oldest = Math.min(...pending.map((entry) => entry.queuedAt));
      const wait = FLUSH_MS - (Date.now() - oldest);
      const urgent = pending.some((entry) => entry.verdict?.route === "extract_now");
      if (!force && !ended && !urgent && wait > 0) {
        schedule(wait);
        return Promise.resolve();
      }
      extracting = extract().finally(() => {
        extracting = undefined;
        if (pending.length > 0 && !stop.signal.aborted) schedule(ended ? 0 : 1_000);
      });
      return extracting;
    }

    async function extract() {
      // Triage's skips are honoured; the words stay in the transcript for Wrap-up to read again.
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].verdict?.route === "skip") pending.splice(i, 1);
      }
      const batch = pending.slice(0, EXTRACT_MAX_TURNS);
      if (batch.length === 0) return;
      if (!spend("extract")) {
        pending.length = 0;
        return;
      }

      try {
        await extractTurns(
          { graph, log, model, meetingId },
          batch.map((entry) => entry.turn),
          [...new Set(batch.flatMap((entry) => entry.verdict?.touches ?? []))],
          AbortSignal.any([stop.signal, AbortSignal.timeout(EXTRACT_TIMEOUT_MS)]),
        );
        pending.splice(0, batch.length);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const entry of batch) entry.attempts++;
        const exhausted = batch.filter((entry) => entry.attempts >= MAX_ATTEMPTS);
        for (const entry of exhausted) pending.splice(pending.indexOf(entry), 1);
        await emit("error", {
          step: "extract",
          turnIds: batch.map((entry) => entry.turn.id),
          message,
          gaveUp: exhausted.length,
        });
      }
    }

    // ---- Turns ----

    const builder = createTurnBuilder(recording.session.id, (turn) => {
      const entry: Entry = { turn, queuedAt: Date.now(), attempts: 0 };
      const before = recent.slice(-2);
      recent.push(turn);
      if (recent.length > 6) recent.shift();
      pending.push(entry);
      triageQueue.push({ entry, before });
      while (triageQueue.length > TRIAGE_BACKLOG) {
        const dropped = triageQueue.shift()!;
        void emit("error", {
          step: "triage",
          turnId: dropped.entry.turn.id,
          message: "Skipped: Triage was behind",
        });
      }
      pumpTriage();
      schedule(FLUSH_MS);
    });

    return {
      add: (caption: Caption) => {
        if (!ended) builder.add(caption);
      },

      /** Ends the recording: the turn in progress is finished, then everything pending is extracted. */
      end(): Promise<void> {
        if (drained) return drained;
        ended = true;
        builder.flush();
        drained = (async () => {
          for (let round = 0; pending.length > 0 && round < 20; round++) await flush(true);
          stop.abort();
        })();
        return drained;
      },
    };
  }

  const observer: RecordingObserver = {
    caption(recording, caption) {
      const id = recording.session.id;
      if (!enabled()) {
        // Switched off part-way: what was already read still gets extracted.
        finish(id);
        return;
      }
      let run = runs.get(id);
      if (!run) {
        // Switched on part-way: the graph follows the meeting from here.
        run = createRun(recording);
        runs.set(id, run);
      }
      run.add(caption);
    },
    ended(recording) {
      finish(recording.session.id);
    },
  };

  return observer;
}
