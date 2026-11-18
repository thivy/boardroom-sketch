import type { Recorder } from "./recorder";
import { errorMessage, isJsonRequest, json } from "./http";

const HEARTBEAT_MS = 15_000;

/** `GET`: the recordings running on the server. */
export function listRecordings(recorder: Recorder): Response {
  return json(recorder.active());
}

/** `POST {meetingId}`: starts recording a meeting (or returns the recording already running). */
export async function startRecording(request: Request, recorder: Recorder): Promise<Response> {
  if (!isJsonRequest(request)) return json({ error: "Expected application/json" }, 415);
  const { meetingId } = (await request.json().catch(() => ({}))) as { meetingId?: string };
  if (!meetingId) return json({ error: "Missing meetingId" }, 400);
  try {
    return json(await recorder.start(meetingId));
  } catch (error) {
    return json({ error: errorMessage(error, "Could not start recording") }, 502);
  }
}

/** `DELETE ?meeting=<id>`: stops a recording; what was captured is kept. */
export function stopRecording(request: Request, recorder: Recorder): Response {
  const meetingId = new URL(request.url).searchParams.get("meeting");
  if (!meetingId) return json({ error: "Missing meeting" }, 400);
  return recorder.stop(meetingId) ? json({}) : json({ error: "Not recording" }, 404);
}

/** `GET ?meeting=<id>`: a server-sent event stream of a running recording. */
export async function streamRecording(request: Request, recorder: Recorder): Promise<Response> {
  const meetingId = new URL(request.url).searchParams.get("meeting");
  if (!meetingId) return json({ error: "Missing meeting" }, 400);
  if (!recorder.active().some((recording) => recording.meetingId === meetingId)) {
    return json({ error: "Not recording" }, 404);
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
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
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
