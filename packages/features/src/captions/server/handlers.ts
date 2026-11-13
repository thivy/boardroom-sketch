import type { Caption, CaptionStatus, MeetingTarget } from "@app/contracts";
import { CdpSession } from "./cdp";
import { restartTeamsWithDebugging } from "./launch-teams";
import { BINDING, observerScript } from "./observer-script";

const TEAMS_HOSTS = ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"];
const DEFAULT_PORT = 9222;
const HEARTBEAT_MS = 15_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

function readPort(url: URL): number | undefined {
  const raw = url.searchParams.get("port");
  if (raw === null) return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
}

function isTeams(url: string) {
  try {
    const { hostname } = new URL(url);
    return TEAMS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** DevTools is only ever reached on this machine, whatever the request asks for. */
async function listTargets(port: number): Promise<MeetingTarget[]> {
  const response = await fetch(`http://127.0.0.1:${port}/json`, {
    signal: AbortSignal.timeout(3000),
  });
  const pages = (await response.json()) as {
    id: string;
    type: string;
    title: string;
    url: string;
  }[];
  return pages
    .filter((page) => page.type === "page" && isTeams(page.url))
    .map(({ id, title, url }) => ({ id, title, url }));
}

/** `GET`: lists the Teams tabs of a Chrome started with `--remote-debugging-port`. */
export async function targetsHandler(request: Request): Promise<Response> {
  const port = readPort(new URL(request.url));
  if (port === undefined) return json({ error: "Invalid port" }, 400);
  try {
    return json(await listTargets(port));
  } catch {
    return json(
      {
        error: `Chrome is not reachable on port ${port}. Start it with --remote-debugging-port=${port}.`,
      },
      502,
    );
  }
}

/** `POST`: restarts the Teams desktop client with remote debugging on (Windows only). */
export async function launchHandler(request: Request): Promise<Response> {
  // A JSON body cannot be sent cross-site without a CORS preflight, so other pages cannot trigger this.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Expected application/json" }, 415);
  }
  const port = readPort(new URL(request.url));
  if (port === undefined) return json({ error: "Invalid port" }, 400);
  try {
    await restartTeamsWithDebugging(port);
    return json({ port });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not restart Teams" }, 500);
  }
}

type PageMessage = ({ type: "status" } & CaptionStatus) | { type: "caption"; caption: Caption };

/** `GET`: a server-sent event stream of `status` and `caption` events for one tab. */
export async function streamHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const port = readPort(url);
  const target = url.searchParams.get("target");
  if (port === undefined || !target || !/^[A-Za-z0-9-]+$/.test(target)) {
    return json({ error: "Invalid port or target" }, 400);
  }

  let session: CdpSession;
  try {
    session = await CdpSession.connect(`ws://127.0.0.1:${port}/devtools/page/${target}`);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not attach to the tab" },
      502,
    );
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!stopped) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeat);
        session.close();
        controller.close();
      };

      session.on("Runtime.bindingCalled", (params) => {
        const { name, payload } = params as { name: string; payload: string };
        if (name !== BINDING) return;
        const message = JSON.parse(payload) as PageMessage;
        if (message.type === "caption") send("caption", message.caption);
        else send("status", { captionsVisible: message.captionsVisible });
      });
      // A reload or navigation clears the page; observe the new document too.
      session.on("Runtime.executionContextsCleared", () => {
        void session.send("Runtime.evaluate", { expression: observerScript }).catch(() => {});
      });
      session.onClose(() => {
        send("closed", {});
        stop();
      });

      heartbeat = setInterval(() => {
        if (!stopped) controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);
      request.signal.addEventListener("abort", stop, { once: true });

      // Listeners are in place first: the observer reports the lines already on screen at once.
      try {
        await session.send("Runtime.enable");
        await session.send("Runtime.addBinding", { name: BINDING });
        await session.send("Runtime.evaluate", { expression: observerScript });
      } catch {
        stop();
      }
    },
    cancel() {
      stopped = true;
      clearInterval(heartbeat);
      session.close();
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
