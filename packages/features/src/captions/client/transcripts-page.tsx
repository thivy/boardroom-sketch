import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/components/components/alert-dialog";
import { Button, buttonVariants } from "@app/components/components/button";
import { Empty, EmptyDescription, EmptyHeader } from "@app/components/components/empty";
import { cn } from "@app/components/lib/utils";
import type { SessionTranscript, StoredMeeting, StoredSession } from "@app/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "../../app-header";

const stamp = (at: number) => new Date(at).toLocaleString();
const time = (at: number) => new Date(at).toLocaleTimeString();

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error((body as { error: string }).error);
  return body as T;
}

function sessionLabel({ startedAt, endedAt, captionCount }: StoredSession) {
  const range = endedAt
    ? `${stamp(startedAt)} – ${time(endedAt)}`
    : `${stamp(startedAt)} · recording`;
  return `${range} · ${captionCount} lines`;
}

function Detail({ sessionId, onDelete }: { sessionId: number; onDelete: () => void }) {
  const transcript = useQuery({
    queryKey: ["transcripts", "session", sessionId],
    queryFn: () => request<SessionTranscript>(`/api/transcripts/session?session=${sessionId}`),
    // A session that is still recording keeps growing.
    refetchInterval: (query) => (query.state.data?.session.endedAt === null ? 3000 : false),
  });

  if (transcript.isError) {
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {transcript.error.message}
      </p>
    );
  }
  if (!transcript.data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  const { meeting, session, captions } = transcript.data;
  const download = (format: string) =>
    `/api/transcripts/export?session=${session.id}&format=${format}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-[560]">{meeting.title}</div>
          <div className="text-xs text-muted-foreground">{sessionLabel(session)}</div>
        </div>
        <div className="flex items-center gap-1">
          {(["txt", "md", "json"] as const).map((format) => (
            <a
              key={format}
              href={download(format)}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <DownloadIcon />
              {format}
            </a>
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete session"
            disabled={session.endedAt === null}
            title={session.endedAt === null ? "Stop the recording first" : undefined}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {captions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No captions were captured.</p>
        ) : (
          <ul className="grid gap-3">
            {captions.map(({ id, speaker, text, at }) => (
              <li key={id}>
                <div className="text-xs font-[560] text-muted-foreground">
                  {speaker || "Unknown"} · {time(at)}
                </div>
                <div>{text}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function TranscriptsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number>();
  const [deleting, setDeleting] = useState<StoredSession>();

  const meetings = useQuery({
    queryKey: ["transcripts", "meetings"],
    queryFn: () => request<StoredMeeting[]>("/api/transcripts"),
    refetchOnMount: "always",
  });

  const deletion = useMutation({
    mutationKey: ["transcripts", "delete"],
    mutationFn: (sessionId: number) =>
      request(`/api/transcripts/session?session=${sessionId}`, { method: "DELETE" }),
    onSuccess: async (_, sessionId) => {
      if (selected === sessionId) setSelected(undefined);
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: ["transcripts"] });
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Transcripts" />

      {meetings.isError && (
        <p role="alert" className="p-4 text-sm text-destructive">
          {meetings.error.message}
        </p>
      )}

      {meetings.data?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              No transcripts yet. Start a recording on the Teams captions page.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {meetings.data && meetings.data.length > 0 && (
        <div className="grid min-h-0 flex-1 md:grid-cols-[22rem_1fr]">
          <div className="min-h-0 overflow-y-auto border-b md:border-r md:border-b-0">
            {meetings.data.map((meeting) => (
              <section key={meeting.id} className="border-b p-3">
                <h2 className="px-2 pb-1 text-[13px] font-[560]">{meeting.title}</h2>
                <ul className="grid gap-0.5">
                  {meeting.sessions.map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        aria-current={session.id === selected ? "true" : undefined}
                        onClick={() => setSelected(session.id)}
                        className={cn(
                          "w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                          session.id === selected && "bg-muted text-foreground",
                        )}
                      >
                        {sessionLabel(session)}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="min-h-0">
            {selected === undefined ? (
              <p className="p-4 text-sm text-muted-foreground">Choose a session to read it.</p>
            ) : (
              <Detail
                key={selected}
                sessionId={selected}
                onDelete={() => {
                  const session = meetings.data
                    .flatMap((meeting) => meeting.sessions)
                    .find((item) => item.id === selected);
                  if (session) {
                    deletion.reset();
                    setDeleting(session);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open && !deletion.isPending) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transcript?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && sessionLabel(deleting)} is removed from the database. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletion.isError && (
            <p role="alert" className="text-sm text-destructive">
              {deletion.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletion.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletion.isPending}
              onClick={() => deleting && deletion.mutate(deleting.id)}
            >
              {deletion.isPending && <LoaderCircleIcon className="animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
