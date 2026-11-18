import type { MeetingGraph } from "@app/contracts";
import { createStore } from "../../shared/client/create-store";
import { diffGraphs, type Activity } from "./activity";

const MAX_ACTIVITY = 60;
const FRESH_MS = 6000;
const SWEEP_MS = 1000;
const EMPTY_ACTIVITY: Activity[] = [];
const EMPTY_FRESH: ReadonlyMap<string, number> = new Map();

const tracker = createStore(
  {
    /** The meeting the rest belongs to; another meeting starts from a clean slate. */
    meetingId: undefined as string | undefined,
    activity: EMPTY_ACTIVITY,
    /** Nodes that appeared or moved on lately, with when. */
    fresh: EMPTY_FRESH,
    changedAt: undefined as number | undefined,
  },
  {
    // Fresh marks fade by themselves, while the graph page is showing them.
    whileUsed: ({ get, set }) => {
      const timer = setInterval(() => {
        const { fresh } = get();
        if (fresh.size === 0) return;
        const cutoff = Date.now() - FRESH_MS;
        const kept = [...fresh].filter(([, at]) => at > cutoff);
        if (kept.length !== fresh.size) set({ fresh: new Map(kept) });
      }, SWEEP_MS);
      return () => clearInterval(timer);
    },
    onUnused: () => {
      last = undefined;
      tracker.reset();
    },
  },
);

/** The previous poll, to compare the next one with. */
let last: MeetingGraph | undefined;

/** What changed lately in a meeting's graph: the running list, the fresh nodes, and when it last changed. */
export function useGraphActivity(meetingId: string | undefined) {
  const activity = tracker.useStore((s) =>
    s.meetingId === meetingId ? s.activity : EMPTY_ACTIVITY,
  );
  const fresh = tracker.useStore((s) => (s.meetingId === meetingId ? s.fresh : EMPTY_FRESH));
  const changedAt = tracker.useStore((s) => (s.meetingId === meetingId ? s.changedAt : undefined));
  return { activity, fresh, changedAt };
}

/** Compares a poll of the graph with the one before it and records what changed. */
export function observeGraph(graph: MeetingGraph) {
  const before = last;
  last = graph;
  // The first poll for a meeting is the baseline, not news.
  if (!before || before.meetingId !== graph.meetingId) return;

  const now = Date.now();
  const found = diffGraphs(before, graph, now);
  if (found.length === 0) return;

  tracker.set((state) => {
    const same = state.meetingId === graph.meetingId;
    const fresh = new Map(same ? state.fresh : EMPTY_FRESH);
    for (const item of found) if (item.nodeId) fresh.set(item.nodeId, now);
    return {
      meetingId: graph.meetingId,
      changedAt: now,
      activity: [...found.reverse(), ...(same ? state.activity : EMPTY_ACTIVITY)].slice(
        0,
        MAX_ACTIVITY,
      ),
      fresh,
    };
  });
}
