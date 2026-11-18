import { createStore } from "../../shared/client/create-store";
import type { Activity } from "./activity";

const MAX_ACTIVITY = 60;
const EMPTY_ACTIVITY: Activity[] = [];
const EMPTY_FRESH: ReadonlyMap<string, number> = new Map();

const tracker = createStore({
  /** The meeting the rest belongs to; another meeting starts from a clean slate. */
  meetingId: undefined as string | undefined,
  activity: EMPTY_ACTIVITY,
  /** Nodes that appeared or moved on lately, with when. */
  fresh: EMPTY_FRESH,
  changedAt: undefined as number | undefined,
});

/** What changed lately in a meeting's graph: the running list, the fresh nodes, and when it last changed. */
export function useGraphActivity(meetingId: string | undefined) {
  const activity = tracker.useStore((s) =>
    s.meetingId === meetingId ? s.activity : EMPTY_ACTIVITY,
  );
  const fresh = tracker.useStore((s) => (s.meetingId === meetingId ? s.fresh : EMPTY_FRESH));
  const changedAt = tracker.useStore((s) => (s.meetingId === meetingId ? s.changedAt : undefined));
  return { activity, fresh, changedAt };
}

/** Adds what a poll found; `found` is newest last. */
export function recordGraphChanges(meetingId: string, found: Activity[], now: number) {
  tracker.set((state) => {
    const same = state.meetingId === meetingId;
    const fresh = new Map(same ? state.fresh : EMPTY_FRESH);
    for (const item of found) if (item.nodeId) fresh.set(item.nodeId, now);
    return {
      meetingId,
      changedAt: now,
      activity: [...[...found].reverse(), ...(same ? state.activity : EMPTY_ACTIVITY)].slice(
        0,
        MAX_ACTIVITY,
      ),
      fresh,
    };
  });
}

/** Lets nodes marked fresh before `cutoff` fade. */
export const expireFreshNodes = (meetingId: string, cutoff: number) =>
  tracker.set((state) =>
    state.meetingId === meetingId
      ? { fresh: new Map([...state.fresh].filter(([, at]) => at > cutoff)) }
      : {},
  );

export const resetGraphActivityStore = tracker.reset;
