import type { CaptionSource } from "@app/contracts";

const HEARTBEAT_MS = 15_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** The captions endpoints, as plain `(Request) => Response` handlers over any `CaptionSource`. */
export function createCaptionHandlers(source: CaptionSource) {
  return {
    /** `GET`: the meetings that can be read right now. */
    async meetings(): Promise<Response> {
      try {
        return json(await source.listMeetings());
      } catch (error) {
        return json({ error: message(error, "Could not list meetings") }, 502);
      }
    },

    /** `GET ?meeting=<id>`: a server-sent event stream of `status` and `caption` events. */
    async stream(request: Request): Promise<Response> {
      const meetingId = new URL(request.url).searchParams.get("meeting");
      if (!meetingId) return json({ error: "Missing meeting" }, 400);

      let iterator: AsyncIterator<unknown>;
      try {
        iterator = (await source.watch(meetingId, request.signal))[Symbol.asyncIterator]();
      } catch (error) {
        return json({ error: message(error, "Could not attach to the meeting") }, 502);
      }

      const encoder = new TextEncoder();
      const frame = (event: string, data: unknown) =>
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              clearInterval(heartbeat);
            }
          }, HEARTBEAT_MS);
        },
        async pull(controller) {
          try {
            const { done, value } = await iterator.next();
            if (done) {
              clearInterval(heartbeat);
              controller.enqueue(frame("closed", {}));
              controller.close();
              return;
            }
            const { type, ...data } = value as { type: string };
            controller.enqueue(
              frame(type, type === "caption" ? (data as { caption: unknown }).caption : data),
            );
          } catch {
            clearInterval(heartbeat);
            controller.close();
          }
        },
        async cancel() {
          clearInterval(heartbeat);
          await iterator.return?.();
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
      // A JSON body cannot be sent cross-site without a CORS preflight, so other pages cannot trigger this.
      if (!request.headers.get("content-type")?.includes("application/json")) {
        return json({ error: "Expected application/json" }, 415);
      }
      if (!source.prepare) return json({ error: "This source cannot restart Teams" }, 501);
      try {
        await source.prepare();
        return json({});
      } catch (error) {
        return json({ error: message(error, "Could not prepare Teams") }, 500);
      }
    },
  };
}
