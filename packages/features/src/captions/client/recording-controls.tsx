import { Button } from "@app/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@app/ui/components/combobox";
import type { Meeting } from "@app/contracts";
import { jsonRequest, request } from "../../shared/client/api-request";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon, PowerIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { useEffect } from "react";
import { followRecording, markResumed, selectMeeting, useCaptionStore } from "./caption-store";
import { useRunningRecordings } from "./use-running-recordings";

const fetchMeetings = () => request<Meeting[]>("/api/captions/meetings");
const fetchWindows = () => request<string[]>("/api/captions/windows");

const startRecording = (meetingId: string) =>
  request("/api/captions/recordings", jsonRequest("POST", { meetingId }));

async function stopRecording(meetingId: string) {
  await fetch(`/api/captions/recordings?meeting=${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
  });
}

const restartTeams = () => request("/api/captions/prepare", jsonRequest("POST", {}));

/** `options` is shown beside the recording buttons, for whatever the app wants to offer there. */
export function RecordingControls({ options }: { options?: React.ReactNode }) {
  const selected = useCaptionStore((state) => state.selectedMeetingId);
  const recordingId = useCaptionStore((state) => state.recordingId);
  const resumed = useCaptionStore((state) => state.resumed);
  const connected = useCaptionStore(
    (state) => state.state === "connecting" || state.state === "live",
  );

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

  const start = useMutation({
    mutationKey: ["captions", "start-recording"],
    mutationFn: startRecording,
    onSuccess: (_, meetingId) => followRecording(meetingId),
  });
  const stop = useMutation({
    mutationKey: ["captions", "stop-recording"],
    mutationFn: stopRecording,
  });

  const running = useRunningRecordings();
  useEffect(() => {
    const active = running.data?.[0];
    if (!active || resumed) return;
    markResumed();
    selectMeeting(active.meetingId);
    followRecording(active.meetingId);
  }, [running.data, resumed]);

  return (
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
                A meeting window is titled with the meeting&apos;s name. If yours is not here, Teams
                is not exposing it for reading.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
