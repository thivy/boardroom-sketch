import { Button, buttonVariants } from "@app/ui/components/button";
import type { Meeting, SessionTranscript, StoredSession } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { request } from "../../shared/client/api-request";
import { sessionLabel, time } from "./session-label";

/** What the page offers on a session besides export and delete; the app decides what goes here. */
export type SessionActions = (context: { session: StoredSession; meeting: Meeting }) => ReactNode;

const FORMATS = ["txt", "md", "json"] as const;

export function SessionDetail({
  sessionId,
  onDelete,
  actions,
}: {
  sessionId: number;
  onDelete: () => void;
  actions?: SessionActions;
}) {
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
        <div className="flex flex-wrap items-center gap-1">
          {actions?.({ session, meeting })}
          {FORMATS.map((format) => (
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
