import { Button } from "@app/components/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@app/components/components/combobox";
import { Textarea } from "@app/components/components/textarea";
import { cn } from "@app/components/lib/utils";
import type { ChatStatus, StoredMeeting } from "@app/contracts";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon, SendIcon, SquareIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AppHeader } from "../../app-header";
import { useChat } from "./use-chat";

type TranscriptChoice = { id: number; label: string };

const SUGGESTIONS = [
  "Summarise this meeting in five bullet points.",
  "List the action items and who owns them.",
  "What decisions were made?",
  "What questions were left unanswered?",
];

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error((body as { error: string }).error);
  return body as T;
}

function toChoices(meetings: StoredMeeting[]): TranscriptChoice[] {
  return meetings.flatMap((meeting) =>
    meeting.sessions.map((session) => ({
      id: session.id,
      label: `${meeting.title} · ${new Date(session.startedAt).toLocaleString()} · ${session.captionCount} lines`,
    })),
  );
}

export function ChatPage() {
  const [transcript, setTranscript] = useState<TranscriptChoice | null>(null);
  const [draft, setDraft] = useState("");
  const chat = useChat(transcript?.id);
  const end = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: ["chat", "status"],
    queryFn: () => getJson<ChatStatus>("/api/chat/status"),
    staleTime: 60_000,
    retry: false,
  });
  const meetings = useQuery({
    queryKey: ["transcripts", "meetings"],
    queryFn: () => getJson<StoredMeeting[]>("/api/transcripts"),
    refetchOnMount: "always",
  });
  const choices = useMemo(() => toChoices(meetings.data ?? []), [meetings.data]);
  const started = chat.messages.length > 0;
  const unavailable = status.data?.available === false;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.messages]);

  function submit(text: string) {
    if (!text.trim() || chat.busy || unavailable) return;
    setDraft("");
    void chat.send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Analysis chat" />

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Combobox
          items={choices}
          value={transcript}
          onValueChange={(item) => setTranscript(item)}
          itemToStringLabel={(item: TranscriptChoice) => item.label}
          isItemEqualToValue={(a: TranscriptChoice, b: TranscriptChoice) => a.id === b.id}
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
            <ComboboxList>
              {(item: TranscriptChoice) => (
                <ComboboxItem key={item.id} value={item}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Button variant="outline" disabled={!started} onClick={chat.reset}>
          <PlusIcon />
          New chat
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {status.isLoading ? "Checking Copilot…" : (status.data?.account ?? "")}
        </span>
      </div>

      {unavailable && (
        <p role="alert" className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {status.data?.message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!started ? (
          <div className="mx-auto grid max-w-2xl gap-3 pt-8">
            <p className="text-sm text-muted-foreground">
              {transcript
                ? "Ask about the transcript you chose, or start with one of these."
                : "Ask anything, or choose a saved transcript above to analyse it."}
            </p>
            {transcript && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((text) => (
                  <Button key={text} variant="outline" size="sm" onClick={() => submit(text)}>
                    {text}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ul className="mx-auto grid max-w-3xl gap-4">
            {chat.messages.map(({ id, role, text, failed }) => (
              <li key={id} className={cn("flex", role === "user" && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
                    role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                    failed && "bg-destructive/10 text-destructive",
                  )}
                >
                  {text || <span className="text-muted-foreground">Thinking…</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={end} />
      </div>

      <div className="border-t p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            aria-label="Message"
            placeholder={
              unavailable
                ? "Copilot is not available"
                : "Message (Enter to send, Shift+Enter for a new line)"
            }
            className="max-h-40 min-h-10 flex-1 resize-none"
            rows={1}
            value={draft}
            disabled={unavailable}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {chat.busy ? (
            <Button variant="secondary" size="icon" aria-label="Stop" onClick={chat.stop}>
              <SquareIcon />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label="Send"
              disabled={!draft.trim() || unavailable}
              onClick={() => submit(draft)}
            >
              <SendIcon />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
