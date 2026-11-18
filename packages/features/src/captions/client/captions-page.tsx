import { Button } from "@app/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@app/ui/components/combobox";
import type { ActiveRecording, Caption, Meeting } from "@app/contracts";
import { AppHeader } from "../../app-header";
import { jsonRequest, request } from "../../shared/client/api-request";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PowerIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import {
  followRecording,
  markResumed,
  resetCaptionStore,
  selectMeeting,
  useCaptionStore,
  type StreamState,
} from "./caption-store";

const STATE_LABEL: Record<StreamState, string> = {
  idle: "Not recording",
  connecting: "Connecting…",
  live: "Recording · saved to Transcripts",
  closed: "Recording ended",
  error: "Could not connect",
};

const fetchMeetings = () => request<Meeting[]>("/api/captions/meetings");
const fetchWindows = () => request<string[]>("/api/captions/windows");
const fetchRecordings = () => request<ActiveRecording[]>("/api/captions/recordings");

const startRecording = (meetingId: string) =>
  request("/api/captions/recordings", jsonRequest("POST", { meetingId }));

async function stopRecording(meetingId: string) {
  await fetch(`/api/captions/recordings?meeting=${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
  });
}

const restartTeams = () => request("/api/captions/prepare", jsonRequest("POST", {}));

function toTranscript(captions: Caption[]) {
  return captions
    .map(({ speaker, text, at }) => {
      const time = new Date(at).toLocaleTimeString();
      return `[${time}] ${speaker ? `${speaker}: ` : ""}${text}`;
    })
    .join("\n");
}

/** `options` is shown beside the recording buttons, for whatever the app wants to offer there. */
export function CaptionsPage({ options }: { options?: React.ReactNode } = {}) {
  const selected = useCaptionStore((state) => state.selectedMeetingId);
  const recordingId = useCaptionStore((state) => state.recordingId);
  const resumed = useCaptionStore((state) => state.resumed);
  const streamState = useCaptionStore((state) => state.state);
  const captions = useCaptionStore((state) => state.captions);
  const captionsVisible = useCaptionStore((state) => state.captionsVisible);
  const end = useRef<HTMLDivElement>(null);

  // Leaving the page stops following; the recording itself keeps running on the server.
  useEffect(() => resetCaptionStore, []);

  const targets = useQuery({
    queryKey: ["captions", "meetings"],
    queryFn: fetchMeetings,
    enabled: false,
    retry: false,
  });

  const target = selected ?? targets.data?.[0]?.id;
  // What Teams exposes, fetched only when no meeting was found, so the user can see why.
  const noMeetings = targets.data?.length === 0;
  const windows = useQuery({
    queryKey: ["captions", "windows", targets.dataUpdatedAt],
    queryFn: fetchWindows,
    enabled: noMeetings,
    retry: false,
  });
  const restart = useMutation({
    mutationKey: ["captions", "restart-teams"],
    mutationFn: restartTeams,
    onSuccess: () => void targets.refetch(),
  });
  const connected = streamState === "connecting" || streamState === "live";

  const start = useMutation({
    mutationKey: ["captions", "start-recording"],
    mutationFn: startRecording,
    onSuccess: (_, meetingId) => followRecording(meetingId),
  });
  const stop = useMutation({
    mutationKey: ["captions", "stop-recording"],
    mutationFn: stopRecording,
  });

  // A recording keeps running on the server when this page closes; pick it up again on return.
  const running = useQuery({
    queryKey: ["captions", "recordings"],
    queryFn: fetchRecordings,
    staleTime: 0,
    gcTime: 0,
  });
  const runningTitle = running.data?.find((item) => item.meetingId === recordingId)?.title;
  useEffect(() => {
    const active = running.data?.[0];
    if (!active || resumed) return;
    markResumed();
    selectMeeting(active.meetingId);
    followRecording(active.meetingId);
  }, [running.data, resumed]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [captions]);

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
              onValueChange={(item) => item && selectMeeting(item.id)}
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
          {options}
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
        {noMeetings && (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              Teams is connected, but no meeting was found. Join the meeting in its own window, turn
              on live captions, then choose Find meetings again.
            </p>
            {windows.data && (
              <details>
                <summary className="cursor-pointer text-xs">
                  Windows Teams exposes ({windows.data.length})
                </summary>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {windows.data.map((label, index) => (
                    <li key={`${index}-${label}`} className="break-all">
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">
                  A meeting window is titled with the meeting&apos;s name. If yours is not here,
                  Teams is not exposing it for reading.
                </p>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-[13px]">
        <span className="text-muted-foreground">
          {STATE_LABEL[streamState]}
          {runningTitle && connected && <> · {runningTitle}</>}
          {streamState === "live" && captionsVisible === false && (
            <> · turn on live captions in the meeting</>
          )}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy transcript"
            disabled={captions.length === 0}
            onClick={() => void navigator.clipboard.writeText(toTranscript(captions))}
          >
            <CopyIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Download transcript"
            disabled={captions.length === 0}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([toTranscript(captions)], { type: "text/plain" }),
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
        {captions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Captions appear here as people speak.</p>
        ) : (
          <ul className="grid gap-3">
            {captions.map(({ id, speaker, text }) => (
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
