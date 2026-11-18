import {
  SSE_HEADERS,
  errorMessage,
  json,
  queryParam,
  readJson,
  rejectNonJson,
  sseFrame,
  sseKeepAlive,
} from "../../shared/server/http";
import type { Recorder } from "./recorder";

const HEARTBEAT_MS = 15_000;

/** `GET`: the recordings running on the server. */
export function listRecordings(recorder: Recorder): Response {
  return json(recorder.active());
}

/** `POST {meetingId}`: starts recording a meeting (or returns the recording already running). */
export async function startRecording(request: Request, recorder: Recorder): Promise<Response> {
  const rejected = rejectNonJson(request);
  if (rejected) return rejected;
  const { meetingId } = await readJson<{ meetingId: string }>(request);
  if (!meetingId) return json({ error: "Missing meetingId" }, 400);
  try {
    return json(await recorder.start(meetingId));
  } catch (error) {
    return json({ error: errorMessage(error, "Could not start recording") }, 502);
  }
}

/** `DELETE ?meeting=<id>`: stops a recording; what was captured is kept. */
export function stopRecording(request: Request, recorder: Recorder): Response {
  const meetingId = queryParam(request, "meeting");
  if (!meetingId) return json({ error: "Missing meeting" }, 400);
  return recorder.stop(meetingId) ? json({}) : json({ error: "Not recording" }, 404);
}

/** `GET ?meeting=<id>`: a server-sent event stream of a running recording. */
export async function streamRecording(request: Request, recorder: Recorder): Promise<Response> {
  const meetingId = queryParam(request, "meeting");
  if (!meetingId) return json({ error: "Missing meeting" }, 400);
  if (!recorder.active().some((recording) => recording.meetingId === meetingId)) {
    return json({ error: "Not recording" }, 404);
  }

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(sseFrame(event, data));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        controller.close();
      };

      request.signal.addEventListener("abort", close, { once: true });
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(sseKeepAlive());
      }, HEARTBEAT_MS);

      unsubscribe = await recorder.subscribe(
        meetingId,
        (captions, captionsVisible) => {
          if (captionsVisible !== undefined) send("status", { captionsVisible });
          for (const caption of captions) send("caption", caption);
        },
        (event) => {
          if (event.type === "closed") {
            send("closed", {});
            close();
          } else if (event.type === "status") {
            send("status", { captionsVisible: event.captionsVisible });
          } else {
            send("caption", event.caption);
          }
        },
      );
      if (!unsubscribe) {
        send("closed", {});
        close();
      }
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
