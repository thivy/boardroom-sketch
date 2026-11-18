import { Button } from "@app/ui/components/button";
import type { Caption } from "@app/contracts";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { getCaptions, useCaptionStore, type StreamState } from "./caption-store";
import { useRunningRecordings } from "./use-running-recordings";

const STATE_LABEL: Record<StreamState, string> = {
  idle: "Not recording",
  connecting: "Connecting…",
  live: "Recording · saved to Transcripts",
  closed: "Recording ended",
  error: "Could not connect",
};

function toTranscript(captions: Caption[]) {
  return captions
    .map(({ speaker, text, at }) => {
      const time = new Date(at).toLocaleTimeString();
      return `[${time}] ${speaker ? `${speaker}: ` : ""}${text}`;
    })
    .join("\n");
}

// Read on click so the bar does not re-render for every incoming caption.
const currentTranscript = () => toTranscript(getCaptions());

export function CaptionStatusBar() {
  const recordingId = useCaptionStore((state) => state.recordingId);
  const streamState = useCaptionStore((state) => state.state);
  const captionsVisible = useCaptionStore((state) => state.captionsVisible);
  const empty = useCaptionStore((state) => state.captions.length === 0);
  const connected = streamState === "connecting" || streamState === "live";

  const running = useRunningRecordings();
  const runningTitle = running.data?.find((item) => item.meetingId === recordingId)?.title;

  return (
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
          disabled={empty}
          onClick={() => void navigator.clipboard.writeText(currentTranscript())}
        >
          <CopyIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Download transcript"
          disabled={empty}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([currentTranscript()], { type: "text/plain" }),
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
  );
}
