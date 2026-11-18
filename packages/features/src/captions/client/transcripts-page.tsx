import { Empty, EmptyDescription, EmptyHeader } from "@app/ui/components/empty";
import type { StoredMeeting } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppHeader } from "../../app-header";
import { request } from "../../shared/client/api-request";
import { DeleteTranscriptDialog } from "./delete-transcript-dialog";
import { SessionDetail, type SessionActions } from "./session-detail";
import { SessionList } from "./session-list";
import { askToDelete, resetTranscriptStore, useTranscriptStore } from "./transcript-store";

export type { SessionActions } from "./session-detail";

export function TranscriptsPage({ actions }: { actions?: SessionActions } = {}) {
  const selected = useTranscriptStore((state) => state.selectedSessionId);

  useEffect(() => resetTranscriptStore, []);

  const meetings = useQuery({
    queryKey: ["transcripts", "meetings"],
    queryFn: () => request<StoredMeeting[]>("/api/transcripts"),
    refetchOnMount: "always",
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
          <SessionList meetings={meetings.data} />

          <div className="min-h-0">
            {selected === undefined ? (
              <p className="p-4 text-sm text-muted-foreground">Choose a session to read it.</p>
            ) : (
              <SessionDetail
                key={selected}
                sessionId={selected}
                actions={actions}
                onDelete={() => {
                  const session = meetings.data
                    .flatMap((meeting) => meeting.sessions)
                    .find((item) => item.id === selected);
                  if (session) askToDelete(session);
                }}
              />
            )}
          </div>
        </div>
      )}

      <DeleteTranscriptDialog />
    </div>
  );
}
