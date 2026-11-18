import type { ActiveRecording, GraphOp, MeetingGraph, StoredMeeting } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { observeGraph, useGraphActivity } from "./graph-activity-store";
import { request } from "../../shared/client/api-request";

const POLL_MS = 1500;

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
    queryFn: async () => {
      const graph = await request<MeetingGraph>(
        `/api/graph?meeting=${encodeURIComponent(meetingId!)}`,
      );
      observeGraph(graph);
      return graph;
    },
    enabled: meetingId !== undefined,
    refetchInterval: POLL_MS,
    placeholderData: undefined,
  });

  const { activity, fresh, changedAt } = useGraphActivity(meetingId);
  const graph = query.data;

  return {
    graph: graph?.meetingId === meetingId ? graph : undefined,
    isError: query.isError,
    error: query.error,
    isLoading: meetingId !== undefined && query.isPending,
    activity,
    fresh,
    changedAt,
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
