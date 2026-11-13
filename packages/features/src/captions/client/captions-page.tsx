import { Button } from "@app/components/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@app/components/components/combobox";
import type { ActiveRecording, Caption, Meeting } from "@app/contracts";
import { AppHeader } from "../../app-header";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PowerIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCaptionStream, type StreamState } from "./use-caption-stream";

const STATE_LABEL: Record<StreamState, string> = {
  idle: "Not recording",
  connecting: "Connecting…",
  live: "Recording · saved to Transcripts",
  closed: "Recording ended",
  error: "Could not connect",
};

async function fetchMeetings(): Promise<Meeting[]> {
  const response = await fetch("/api/captions/meetings");
  const body = await response.json();
  if (!response.ok) throw new Error((body as { error: string }).error);
  return body as Meeting[];
}

async function fetchRecordings(): Promise<ActiveRecording[]> {
  const response = await fetch("/api/captions/recordings");
  return (await response.json()) as ActiveRecording[];
}

async function startRecording(meetingId: string) {
  const response = await fetch("/api/captions/recordings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingId }),
  });
  if (!response.ok) throw new Error(((await response.json()) as { error: string }).error);
}

async function stopRecording(meetingId: string) {
  await fetch(`/api/captions/recordings?meeting=${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
  });
}

async function restartTeams() {
  const response = await fetch("/api/captions/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(((await response.json()) as { error: string }).error);
}

function toTranscript(captions: Caption[]) {
  return captions
    .map(({ speaker, text, at }) => {
      const time = new Date(at).toLocaleTimeString();
      return `[${time}] ${speaker ? `${speaker}: ` : ""}${text}`;
    })
    .join("\n");
}

export function CaptionsPage() {
  const [selected, setSelected] = useState<string>();
  const stream = useCaptionStream();
  const end = useRef<HTMLDivElement>(null);

  const targets = useQuery({
    queryKey: ["captions", "meetings"],
    queryFn: fetchMeetings,
    enabled: false,
    retry: false,
  });

  const target = selected ?? targets.data?.[0]?.id;
  const restart = useMutation({
    mutationKey: ["captions", "restart-teams"],
    mutationFn: restartTeams,
    onSuccess: () => void targets.refetch(),
  });
  const connected = stream.state === "connecting" || stream.state === "live";
  const [recordingId, setRecordingId] = useState<string>();

  const start = useMutation({
    mutationKey: ["captions", "start-recording"],
    mutationFn: startRecording,
    onSuccess: (_, meetingId) => {
      setRecordingId(meetingId);
      stream.follow(meetingId);
    },
  });
  const stop = useMutation({
    mutationKey: ["captions", "stop-recording"],
    mutationFn: stopRecording,
  });

  // A recording keeps running on the server when this page closes; pick it up again on return.
  const resumed = useRef(false);
  const running = useQuery({
    queryKey: ["captions", "recordings"],
    queryFn: fetchRecordings,
    staleTime: 0,
    gcTime: 0,
  });
  const runningTitle = running.data?.find((item) => item.meetingId === recordingId)?.title;
  useEffect(() => {
    const active = running.data?.[0];
    if (!active || resumed.current) return;
    resumed.current = true;
    setRecordingId(active.meetingId);
    setSelected(active.meetingId);
    stream.follow(active.meetingId);
  }, [running.data, stream]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [stream.captions]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Teams captions" />

      <div className="grid gap-3 border-b p-4">
        <p className="text-sm text-muted-foreground">
          Join the meeting and turn on live captions, then find the meeting and start recording.
          Captions are saved on the server as they arrive, so closing this page does not stop the
          recording. If Teams is not reachable, restart it from here.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={restart.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "This quits Microsoft Teams (leaving any meeting) and starts it again with debugging on. Continue?",
                )
              ) {
                restart.mutate();
              }
            }}
          >
            {restart.isPending ? <LoaderCircleIcon className="animate-spin" /> : <PowerIcon />}
            Restart Teams
          </Button>
          <Button
            variant="outline"
            disabled={targets.isFetching}
            onClick={() => void targets.refetch()}
          >
            <RefreshCwIcon className={targets.isFetching ? "animate-spin" : undefined} />
            Find meetings
          </Button>

          {targets.data && targets.data.length > 0 && (
            <Combobox
              items={targets.data}
              value={targets.data.find((item) => item.id === target) ?? null}
              onValueChange={(item) => item && setSelected(item.id)}
              itemToStringLabel={(item: Meeting) => item.title || item.id}
              isItemEqualToValue={(a: Meeting, b: Meeting) => a.id === b.id}
              disabled={connected || start.isPending}
            >
              <ComboboxInput
                aria-label="Meeting tab"
                placeholder="Choose a meeting"
                className="min-w-64 max-w-sm flex-1"
              />
              <ComboboxContent>
                <ComboboxEmpty>No meetings found.</ComboboxEmpty>
                <ComboboxList>
                  {(item: Meeting) => (
                    <ComboboxItem key={item.id} value={item}>
                      {item.title || item.id}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}

          {connected && recordingId ? (
            <Button variant="secondary" onClick={() => stop.mutate(recordingId)}>
              <SquareIcon />
              Stop recording
            </Button>
          ) : (
            <Button
              disabled={!target || start.isPending}
              onClick={() => target && start.mutate(target)}
            >
              {start.isPending && <LoaderCircleIcon className="animate-spin" />}
              Start recording
            </Button>
          )}
        </div>

        {start.isError && (
          <p role="alert" className="text-sm text-destructive">
            {start.error.message}
          </p>
        )}
        {restart.isError && (
          <p role="alert" className="text-sm text-destructive">
            {restart.error.message}
          </p>
        )}
        {targets.isError && (
          <p role="alert" className="text-sm text-destructive">
            {targets.error.message}
          </p>
        )}
        {targets.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chrome is reachable, but no Teams tab is open.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-[13px]">
        <span className="text-muted-foreground">
          {STATE_LABEL[stream.state]}
          {runningTitle && connected && <> · {runningTitle}</>}
          {stream.state === "live" && stream.captionsVisible === false && (
            <> · turn on live captions in the meeting</>
          )}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy transcript"
            disabled={stream.captions.length === 0}
            onClick={() => void navigator.clipboard.writeText(toTranscript(stream.captions))}
          >
            <CopyIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download transcript"
            disabled={stream.captions.length === 0}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([toTranscript(stream.captions)], { type: "text/plain" }),
              );
              const link = Object.assign(document.createElement("a"), {
                href: url,
                download: "teams-captions.txt",
              });
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <DownloadIcon />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {stream.captions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Captions appear here as people speak.</p>
        ) : (
          <ul className="grid gap-3">
            {stream.captions.map(({ id, speaker, text }) => (
              <li key={id}>
                {speaker && (
                  <div className="text-xs font-[560] text-muted-foreground">{speaker}</div>
                )}
                <div>{text}</div>
              </li>
            ))}
          </ul>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}
