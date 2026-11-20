import { Button } from "@app/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxList,
} from "@app/ui/components/combobox";
import type { StoredMeeting } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { request } from "../../shared/client/api-request";
import { setChatTranscript, startNewChat, useChatStore, type TranscriptChoice } from "./chat-store";
import { useChatStatus } from "./use-chat-status";

function toChoices(meetings: StoredMeeting[]): TranscriptChoice[] {
  return meetings.flatMap((meeting) =>
    meeting.sessions.map((session) => ({
      id: session.id,
      label: `${meeting.title} · ${new Date(session.startedAt).toLocaleString()} · ${session.captionCount} lines`,
    })),
  );
}

export function ChatToolbar() {
  const transcript = useChatStore((state) => state.transcript);
  const started = useChatStore((state) => state.messages.length > 0);
  const status = useChatStatus();
  const meetings = useQuery({
    queryKey: ["transcripts", "meetings"],
    queryFn: () => request<StoredMeeting[]>("/api/transcripts"),
    refetchOnMount: "always",
  });
  const choices = useMemo(() => toChoices(meetings.data ?? []), [meetings.data]);
  const transcriptOptions = choices.map((item) => ({ value: item.id, label: item.label }));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <Combobox
        items={transcriptOptions}
        value={transcript?.id ?? null}
        onValueChange={(id) => setChatTranscript(choices.find((item) => item.id === id) ?? null)}
        disabled={started}
      >
        <ComboboxInput
          aria-label="Transcript to analyse"
          placeholder="Transcript to analyse (optional)"
          showClear
          className="min-w-72 max-w-xl flex-1"
        />
        <ComboboxContent>
          <ComboboxEmpty>No transcripts saved yet.</ComboboxEmpty>
          <ComboboxList items={transcriptOptions} />
        </ComboboxContent>
      </Combobox>
      <Button variant="outline" disabled={!started} onClick={startNewChat}>
        <PlusIcon />
        New chat
      </Button>
      <span className="ml-auto text-xs text-muted-foreground">
        {status.isLoading ? "Checking Copilot…" : (status.data?.account ?? "")}
      </span>
    </div>
  );
}
