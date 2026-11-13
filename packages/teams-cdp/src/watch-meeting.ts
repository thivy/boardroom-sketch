import type { CaptionEvent, Caption, CaptionStatus } from "@app/contracts";
import { CdpSession } from "./cdp";
import { BINDING, observerScript } from "./observer-script";

type PageMessage = ({ type: "status" } & CaptionStatus) | { type: "caption"; caption: Caption };

/** Attaches to one page and returns its caption events; resolves once the observer is injected. */
export async function watchMeeting(
  port: number,
  meetingId: string,
  signal: AbortSignal,
): Promise<AsyncIterable<CaptionEvent>> {
  if (!/^[A-Za-z0-9-]+$/.test(meetingId)) throw new Error("Invalid meeting id");

  const session = await CdpSession.connect(`ws://127.0.0.1:${port}/devtools/page/${meetingId}`);

  const queue: CaptionEvent[] = [];
  let ended = false;
  let wake: (() => void) | undefined;
  const push = (event: CaptionEvent) => {
    queue.push(event);
    wake?.();
  };
  const end = () => {
    ended = true;
    wake?.();
  };

  // Listeners come first: the observer reports the lines already on screen as soon as it starts.
  session.on("Runtime.bindingCalled", (params) => {
    const { name, payload } = params as { name: string; payload: string };
    if (name !== BINDING) return;
    const message = JSON.parse(payload) as PageMessage;
    if (message.type === "caption") push({ type: "caption", caption: message.caption });
    else push({ type: "status", captionsVisible: message.captionsVisible });
  });
  // A reload or navigation clears the page; observe the new document too.
  session.on("Runtime.executionContextsCleared", () => {
    void session.send("Runtime.evaluate", { expression: observerScript }).catch(() => {});
  });
  session.onClose(end);
  signal.addEventListener("abort", () => session.close(), { once: true });

  try {
    await session.send("Runtime.enable");
    await session.send("Runtime.addBinding", { name: BINDING });
    await session.send("Runtime.evaluate", { expression: observerScript });
  } catch (error) {
    session.close();
    throw error;
  }

  return (async function* () {
    try {
      while (true) {
        const next = queue.shift();
        if (next) yield next;
        else if (ended) return;
        else await new Promise<void>((resolve) => (wake = resolve));
      }
    } finally {
      session.close();
    }
  })();
}
