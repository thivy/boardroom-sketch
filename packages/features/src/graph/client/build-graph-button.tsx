import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/ui/components/alert-dialog";
import { Button, buttonVariants } from "@app/ui/components/button";
import type { GraphBuildStatus, StoredSession } from "@app/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, NetworkIcon, SquareIcon } from "lucide-react";
import { useEffect } from "react";
import { request, jsonRequest } from "../../shared/client/api-request";
import { askToReplaceGraph, closeReplaceGraph, useGraphBuildStore } from "./graph-build-store";

/**
 * Builds the meeting's graph from one saved transcript: the model reads the transcript in order, a few
 * speaker turns at a time, and the graph fills in as it goes (the graph page shows it happening). The
 * meeting has one graph, so building again replaces it, after asking.
 */
export function BuildGraphButton({
  session,
  meetingId,
}: {
  session: StoredSession;
  meetingId: string;
}) {
  const queryClient = useQueryClient();
  const confirming = useGraphBuildStore((state) => state.confirmingSessionId === session.id);
  const key = ["graph", "build", session.id];

  useEffect(() => closeReplaceGraph, []);

  const status = useQuery({
    queryKey: key,
    queryFn: () =>
      request<GraphBuildStatus>(
        `/api/graph/build?session=${session.id}&meeting=${encodeURIComponent(meetingId)}`,
      ),
    refetchInterval: (query) => (query.state.data?.state === "running" ? 1500 : false),
  });

  const start = useMutation({
    mutationFn: (replace: boolean) =>
      request<GraphBuildStatus>(
        "/api/graph/build",
        jsonRequest("POST", { sessionId: session.id, replace }),
      ),
    onSuccess: (data) => {
      closeReplaceGraph();
      queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });

  const cancel = useMutation({
    mutationFn: () => request(`/api/graph/build?session=${session.id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const current = status.data;
  const running = current?.state === "running";
  const hasGraph = (current?.nodes ?? 0) > 0;
  const recording = session.endedAt === null;
  const watch = `/graph?meeting=${encodeURIComponent(meetingId)}`;

  return (
    <>
      {running ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            Reading turn {Math.min(current.processed + 1, current.turns)} of {current.turns}
            {" · "}
            {current.nodes} nodes
          </span>
          <a href={watch} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Watch
          </a>
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            <SquareIcon />
            Stop
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={recording || status.isPending || start.isPending}
          title={
            recording
              ? "Stop the recording first"
              : "Reads the transcript with the Copilot model, about one call for every 8 speaker turns"
          }
          onClick={() => (hasGraph ? askToReplaceGraph(session.id) : start.mutate(false))}
        >
          {start.isPending ? <LoaderCircleIcon className="animate-spin" /> : <NetworkIcon />}
          {hasGraph ? "Rebuild graph" : "Generate graph"}
        </Button>
      )}

      {!running && current?.state === "done" && (
        <a href={watch} className="text-xs text-muted-foreground underline underline-offset-2">
          View graph · {current.nodes} nodes
          {current.failedBatches > 0 && ` · ${current.failedBatches} calls failed`}
        </a>
      )}
      {!running && current?.state === "cancelled" && (
        <span className="text-xs text-muted-foreground">
          Stopped after {current.processed} of {current.turns} turns
        </span>
      )}
      {!running && current?.state === "failed" && (
        <span role="alert" className="text-xs text-destructive">
          Stopped: {current.error}
        </span>
      )}
      {start.isError && !confirming && (
        <span role="alert" className="text-xs text-destructive">
          {start.error.message}
        </span>
      )}

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !start.isPending) closeReplaceGraph();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this meeting&apos;s graph?</AlertDialogTitle>
            <AlertDialogDescription>
              The meeting already has a graph of {current?.nodes} nodes. Building again deletes it
              and its history, then reads this transcript from the start. That makes new calls to
              the Copilot model.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {start.isError && (
            <p role="alert" className="text-sm text-destructive">
              {start.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={start.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={start.isPending}
              onClick={() => start.mutate(true)}
            >
              {start.isPending && <LoaderCircleIcon className="animate-spin" />}
              Replace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
