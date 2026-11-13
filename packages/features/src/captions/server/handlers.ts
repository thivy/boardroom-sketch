import type { CaptionSource, TranscriptStore } from "@app/contracts";
import { EXPORT_TYPES, exportFileName, isExportFormat, renderTranscript } from "./export";
import { createRecorder } from "./recorder";

const HEARTBEAT_MS = 15_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// A JSON body cannot be sent cross-site without a CORS preflight, so other pages cannot start a recording.
const isJson = (request: Request) =>
  request.headers.get("content-type")?.includes("application/json") ?? false;

function sessionId(request: Request): number | undefined {
  const value = Number(new URL(request.url).searchParams.get("session"));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** The captions endpoints, as plain `(Request) => Response` handlers over a `CaptionSource` and a `TranscriptStore`. */
export function createCaptionHandlers(source: CaptionSource, store: TranscriptStore) {
  const recorder = createRecorder(source, store);

  return {
    /** `GET`: the meetings that can be read right now. */
    async meetings(): Promise<Response> {
      try {
        return json(await source.listMeetings());
      } catch (error) {
        return json({ error: message(error, "Could not list meetings") }, 502);
      }
    },

    /** `GET`: the recordings running on the server. */
    recordings(): Response {
      return json(recorder.active());
    },

    /** `POST {meetingId}`: starts recording a meeting (or returns the recording already running). */
    async startRecording(request: Request): Promise<Response> {
      if (!isJson(request)) return json({ error: "Expected application/json" }, 415);
      const { meetingId } = (await request.json().catch(() => ({}))) as { meetingId?: string };
      if (!meetingId) return json({ error: "Missing meetingId" }, 400);
      try {
        return json(await recorder.start(meetingId));
      } catch (error) {
        return json({ error: message(error, "Could not start recording") }, 502);
      }
    },

    /** `DELETE ?meeting=<id>`: stops a recording; what was captured is kept. */
    stopRecording(request: Request): Response {
      const meetingId = new URL(request.url).searchParams.get("meeting");
      if (!meetingId) return json({ error: "Missing meeting" }, 400);
      return recorder.stop(meetingId) ? json({}) : json({ error: "Not recording" }, 404);
    },

    /** `GET ?meeting=<id>`: a server-sent event stream of a running recording: what is saved, then live events. */
    async stream(request: Request): Promise<Response> {
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
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
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
    },

    /** `POST`: lets the source get Teams ready to be read, if it has a way to. */
    async prepare(request: Request): Promise<Response> {
      if (!isJson(request)) return json({ error: "Expected application/json" }, 415);
      if (!source.prepare) return json({ error: "This source cannot restart Teams" }, 501);
      try {
        await source.prepare();
        return json({});
      } catch (error) {
        return json({ error: message(error, "Could not prepare Teams") }, 500);
      }
    },

    /** `GET`: every meeting with saved sessions, and its sessions. */
    async transcripts(): Promise<Response> {
      return json(await store.listMeetings());
    },

    /** `GET ?session=<id>`: one session with its captions. */
    async transcript(request: Request): Promise<Response> {
      const id = sessionId(request);
      if (id === undefined) return json({ error: "Missing or invalid session" }, 400);
      const transcript = await store.getSession(id);
      return transcript ? json(transcript) : json({ error: "No such session" }, 404);
    },

    /** `GET ?session=<id>&format=txt|md|json`: one session as a downloadable file. */
    async exportTranscript(request: Request): Promise<Response> {
      const id = sessionId(request);
      const format = new URL(request.url).searchParams.get("format") ?? "txt";
      if (id === undefined || !isExportFormat(format)) {
        return json({ error: "Missing or invalid session or format" }, 400);
      }
      const transcript = await store.getSession(id);
      if (!transcript) return json({ error: "No such session" }, 404);
      return new Response(renderTranscript(transcript, format), {
        headers: {
          "Content-Type": EXPORT_TYPES[format],
          "Content-Disposition": `attachment; filename="${exportFileName(transcript, format)}"`,
        },
      });
    },

    /** `DELETE ?session=<id>`: removes a saved session. A session still recording cannot be deleted. */
    async deleteTranscript(request: Request): Promise<Response> {
      const id = sessionId(request);
      if (id === undefined) return json({ error: "Missing or invalid session" }, 400);
      if (recorder.active().some((recording) => recording.session.id === id)) {
        return json({ error: "Stop the recording before deleting it" }, 409);
      }
      await store.deleteSession(id);
      return json({});
    },
  };
}
