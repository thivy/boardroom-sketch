import type { ActiveRecording, GraphOp, MeetingGraph, StoredMeeting } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type Activity, diffGraphs } from "./activity";

const POLL_MS = 1500;
const FRESH_MS = 6000;
const MAX_ACTIVITY = 60;

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error((body as { error: string }).error);
  return body as T;
}

type Tracker = {
  meetingId: string | undefined;
  activity: Activity[];
  /** Nodes that appeared or moved on lately, with when. */
  fresh: Map<string, number>;
  changedAt?: number;
};

const emptyTracker = (meetingId: string | undefined): Tracker => ({
  meetingId,
  activity: [],
  fresh: new Map(),
});

export type MeetingChoice = { id: string; title: string; live: boolean };

/** Every meeting that has a transcript or is recording now, live ones first and then newest. */
export function useMeetings() {
  const stored = useQuery({
    queryKey: ["graph", "meetings"],
    queryFn: () => request<StoredMeeting[]>("/api/transcripts"),
    refetchInterval: 10_000,
  });
  const recordings = useQuery({
    queryKey: ["graph", "recordings"],
    queryFn: () => request<ActiveRecording[]>("/api/captions/recordings"),
    refetchInterval: 4000,
  });

  const live = new Set(recordings.data?.map((item) => item.meetingId));
  const meetings = new Map<string, MeetingChoice & { at: number }>();
  for (const { id, title, lastRecordedAt } of stored.data ?? []) {
    meetings.set(id, { id, title, live: live.has(id), at: lastRecordedAt });
  }
  for (const { meetingId, title, session } of recordings.data ?? []) {
    meetings.set(meetingId, { id: meetingId, title, live: true, at: session.startedAt });
  }

  const choices = [...meetings.values()].sort(
    (a, b) => Number(b.live) - Number(a.live) || b.at - a.at,
  );
  return { meetings: choices, loading: stored.isPending, error: stored.error };
}

/**
 * Follows a meeting's graph while the pipeline builds it. Each poll is compared with the last one,
 * so the page can show what just changed: `fresh` holds the nodes that appeared or moved on in the
 * last few seconds and `activity` is the running list of changes.
 */
export function useLiveGraph(meetingId: string | undefined) {
  const query = useQuery({
    queryKey: ["graph", "meeting", meetingId],
    queryFn: () => request<MeetingGraph>(`/api/graph?meeting=${encodeURIComponent(meetingId!)}`),
    enabled: meetingId !== undefined,
    refetchInterval: POLL_MS,
    placeholderData: undefined,
  });

  const previous = useRef<{ meetingId?: string; graph?: MeetingGraph }>({});
  const [tracker, setTracker] = useState<Tracker>(() => emptyTracker(meetingId));
  // Switching meetings starts a clean slate without an effect to reset it.
  const current = tracker.meetingId === meetingId ? tracker : emptyTracker(meetingId);

  const graph = query.data;
  useEffect(() => {
    if (!graph || graph.meetingId !== meetingId) return;
    const last = previous.current;
    previous.current = { meetingId, graph };
    // The first poll for a meeting is the baseline, not news.
    if (!last.graph || last.meetingId !== meetingId || last.graph === graph) return;

    const now = Date.now();
    const found = diffGraphs(last.graph, graph, now);
    if (found.length === 0) return;
    setTracker((existing) => {
      const base = existing.meetingId === meetingId ? existing : emptyTracker(meetingId);
      const fresh = new Map(base.fresh);
      for (const item of found) if (item.nodeId) fresh.set(item.nodeId, now);
      return {
        meetingId,
        changedAt: now,
        activity: [...found.reverse(), ...base.activity].slice(0, MAX_ACTIVITY),
        fresh,
      };
    });
  }, [graph, meetingId]);

  // Fresh marks fade by themselves.
  const freshCount = current.fresh.size;
  useEffect(() => {
    if (freshCount === 0) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - FRESH_MS;
      setTracker((existing) =>
        existing.meetingId === meetingId
          ? {
              ...existing,
              fresh: new Map([...existing.fresh].filter(([, at]) => at > cutoff)),
            }
          : existing,
      );
    }, FRESH_MS);
    return () => clearTimeout(timer);
  }, [freshCount, current.changedAt, meetingId]);

  return {
    graph: graph?.meetingId === meetingId ? graph : undefined,
    isError: query.isError,
    error: query.error,
    isLoading: meetingId !== undefined && query.isPending,
    activity: current.activity,
    fresh: current.fresh,
    changedAt: current.changedAt,
  };
}

/** What happened to one node, with the quotes behind it. */
export function useNodeHistory(nodeId: string | undefined, updatedAt: number | undefined) {
  return useQuery({
    queryKey: ["graph", "history", nodeId, updatedAt],
    queryFn: () => request<GraphOp[]>(`/api/graph/history?node=${encodeURIComponent(nodeId!)}`),
    enabled: nodeId !== undefined,
  });
}
