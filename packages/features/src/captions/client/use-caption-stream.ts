import type { Caption, CaptionStatus } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

export type StreamState = "idle" | "connecting" | "live" | "closed" | "error";

/**
 * Follows a recording that is running on the server. The stream starts with what is already saved,
 * so following again after a reload shows the whole transcript; a caption keeps its place while
 * its text grows. Not following never stops the recording.
 */
export function useCaptionStream() {
  const source = useRef<EventSource | null>(null);
  const [state, setState] = useState<StreamState>("idle");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [captionsVisible, setCaptionsVisible] = useState<boolean>();

  const unfollow = useCallback(() => {
    source.current?.close();
    source.current = null;
    setState("idle");
  }, []);

  const follow = useCallback((meetingId: string) => {
    source.current?.close();
    setState("connecting");
    setCaptions([]);
    setCaptionsVisible(undefined);

    const stream = new EventSource(`/api/captions/stream?meeting=${encodeURIComponent(meetingId)}`);
    source.current = stream;

    stream.addEventListener("open", () => setState("live"));
    stream.addEventListener("status", (event) =>
      setCaptionsVisible((JSON.parse(event.data) as CaptionStatus).captionsVisible),
    );
    stream.addEventListener("caption", (event) => {
      const caption = JSON.parse(event.data) as Caption;
      setCaptions((current) => {
        const index = current.findIndex((item) => item.id === caption.id);
        if (index === -1) return [...current, caption];
        const next = [...current];
        next[index] = caption;
        return next;
      });
    });
    stream.addEventListener("closed", () => {
      stream.close();
      setState("closed");
    });
    // The server answers an unknown recording with an HTTP error, which EventSource reports as an error.
    stream.addEventListener("error", () => {
      if (stream.readyState === EventSource.CLOSED) setState("error");
    });
  }, []);

  useEffect(() => () => source.current?.close(), []);

  return { state, captions, captionsVisible, follow, unfollow };
}
