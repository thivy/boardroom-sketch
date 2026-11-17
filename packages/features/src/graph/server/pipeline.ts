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
import {
  EXTRACT_INSTRUCTIONS,
  EXTRACT_SCHEMA,
  extractContext,
  planChanges,
  type Rejection,
} from "./extract";
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
  /** How long turns wait for company before being extracted. Default 20 seconds. */
  flushMs?: number;
  /** The most turns extracted in one call. Default 8. */
  maxBatch?: number;
  /** Triage calls in flight at once. Default 2. */
  triageConcurrency?: number;
  /** Turns waiting for Triage beyond this go on without a verdict. Default 6. */
  triageBacklog?: number;
  triageTimeoutMs?: number;
  extractTimeoutMs?: number;
  /** A ceiling on model calls per recording, so a long meeting cannot run up usage unnoticed. Default 400. */
  maxModelCalls?: number;
  /** Passed to the turn builder. */
  idleMs?: number;
  now?: () => number;
};

type Entry = { turn: Turn; queuedAt: number; verdict?: Verdict; attempts: number };

const MAX_ATTEMPTS = 2;

/**
 * Builds a meeting's graph while it is recorded. Finished turns go to Triage, which runs beside
 * everything else and only advises, and in batches to Extract, which proposes changes that plain
 * code checks and saves. One recording has one writer, so changes land in order.
 */
export function createGraphPipeline(options: GraphPipelineOptions) {
  const {
    graph,
    log,
    model,
    flushMs = 20_000,
    maxBatch = 8,
    triageConcurrency = 2,
    triageBacklog = 6,
    triageTimeoutMs = 30_000,
    extractTimeoutMs = 120_000,
    maxModelCalls = 400,
    idleMs,
    now = Date.now,
  } = options;

  const runs = new Map<number, ReturnType<typeof createRun>>();

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
      if (calls < maxModelCalls) {
        calls++;
        return true;
      }
      if (!overBudget) {
        overBudget = true;
        void emit("error", {
          step,
          message: `Reached the limit of ${maxModelCalls} model calls for this recording`,
        });
      }
      return false;
    }

    // ---- Triage: advice only, never in the way ----

    async function triage(entry: Entry, before: Turn[]) {
      if (!spend("triage")) return;
      const started = now();
      try {
        const current = await graph.getGraph(meetingId);
        const aliases = createAliases();
        const prompt = triagePrompt(entry.turn, before, openThreads(current), aliases);
        const answer = await model.complete(
          { tier: "fast", instructions: TRIAGE_INSTRUCTIONS, prompt, schema: TRIAGE_SCHEMA },
          AbortSignal.any([stop.signal, AbortSignal.timeout(triageTimeoutMs)]),
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
          effort: answer.effort,
          ms: now() - started,
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
      while (triageActive < triageConcurrency && triageQueue.length > 0) {
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
      const due = now() + ms;
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
      const wait = flushMs - (now() - oldest);
      if (!force && !ended && wait > 0) {
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
      const batch = pending.slice(0, maxBatch);
      if (batch.length === 0) return;
      if (!spend("extract")) {
        pending.length = 0;
        return;
      }

      const started = now();
      try {
        const current = await graph.getGraph(meetingId);
        const touches = [...new Set(batch.flatMap((entry) => entry.verdict?.touches ?? []))];
        const context = extractContext(
          batch.map((entry) => entry.turn),
          current,
          touches,
        );
        const answer = await model.complete(
          {
            tier: "smart",
            instructions: EXTRACT_INSTRUCTIONS,
            prompt: context.prompt,
            schema: EXTRACT_SCHEMA,
          },
          AbortSignal.any([stop.signal, AbortSignal.timeout(extractTimeoutMs)]),
        );

        const plan = planChanges(answer.value, context.labels, meetingId, current);
        const results =
          plan.commands.length > 0 ? await graph.apply(plan.commands, { source: "stated" }) : [];
        const rejections: Rejection[] = [...plan.rejections];
        results.forEach((result, position) => {
          if (!result.ok) {
            rejections.push({
              index: plan.origins[position],
              op: plan.commands[position].kind,
              reason: `${result.code}: ${result.message}`,
              change: plan.commands[position],
            });
          }
        });

        const turnIds = batch.map((entry) => entry.turn.id);
        await emit("extract", {
          turnIds,
          proposed: Array.isArray((answer.value as { changes?: unknown })?.changes)
            ? (answer.value as { changes: unknown[] }).changes.length
            : 0,
          accepted: results.filter((result) => result.ok).length,
          rejected: rejections.length,
          adjustments: plan.adjustments,
          promptChars: context.prompt.length,
          model: answer.model,
          effort: answer.effort,
          ms: now() - started,
        });
        for (const rejection of rejections) await emit("rejection", { turnIds, ...rejection });
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

    const builder = createTurnBuilder(recording.session.id, {
      idleMs,
      now,
      onTurn(turn) {
        const entry: Entry = { turn, queuedAt: now(), attempts: 0 };
        const before = recent.slice(-2);
        recent.push(turn);
        if (recent.length > 6) recent.shift();
        pending.push(entry);
        triageQueue.push({ entry, before });
        while (triageQueue.length > triageBacklog) {
          const dropped = triageQueue.shift()!;
          void emit("error", {
            step: "triage",
            turnId: dropped.entry.turn.id,
            message: "Skipped: Triage was behind",
          });
        }
        pumpTriage();
        schedule(flushMs);
      },
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

      drained: () => drained ?? Promise.resolve(),
    };
  }

  const observer: RecordingObserver = {
    caption(recording, caption) {
      let run = runs.get(recording.session.id);
      if (!run) {
        run = createRun(recording);
        runs.set(recording.session.id, run);
      }
      run.add(caption);
    },
    ended(recording) {
      const run = runs.get(recording.session.id);
      if (!run) return;
      void run.end().finally(() => runs.delete(recording.session.id));
    },
  };

  return Object.assign(observer, {
    /** Resolves when every recording that has ended has been fully extracted. */
    async idle() {
      await Promise.all([...runs.values()].map((run) => run.drained()));
    },
  });
}
