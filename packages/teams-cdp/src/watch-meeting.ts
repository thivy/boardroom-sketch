import type { Caption, CaptionEvent, CaptionStatus } from "@app/contracts";
import { CdpSession } from "./cdp";
import { isPageOfMeeting, listMeetingGroups, listTeamsPages } from "./list-meetings";
import { BINDING, observerScript } from "./observer-script";

type PageMessage = ({ type: "status" } & CaptionStatus) | { type: "caption"; caption: Caption };

const SIBLING_POLL_MS = 3000;

/**
 * Reads one meeting. The captions can live in the meeting window or in a popped-out window, which
 * is a separate page with the same title, so every page of the meeting is observed, including
 * ones that appear later. Resolves once the first page is attached.
 */
export async function watchMeeting(
  port: number,
  meetingId: string,
  signal: AbortSignal,
): Promise<AsyncIterable<CaptionEvent>> {
  const meeting = (await listMeetingGroups(port)).find((group) => group.id === meetingId);
  if (!meeting) throw new Error("That meeting is gone. Find meetings again.");
  const firstPageId = meeting.pageIds[0];

  const queue: CaptionEvent[] = [];
  const sessions = new Map<string, CdpSession>();
  const visible = new Map<string, boolean>();
  const attaching = new Set<string>();
  let ended = false;
  let lastVisible: boolean | undefined;
  let wake: (() => void) | undefined;

  const push = (event: CaptionEvent) => {
    queue.push(event);
    wake?.();
  };
  const finish = () => {
    ended = true;
    clearInterval(poll);
    for (const session of sessions.values()) session.close();
    wake?.();
  };
  // Captions are on if any page of the meeting shows them.
  const reportStatus = () => {
    const any = [...visible.values()].some(Boolean);
    if (any !== lastVisible) {
      lastVisible = any;
      push({ type: "status", captionsVisible: any });
    }
  };

  async function attach(pageId: string) {
    attaching.add(pageId);
    try {
      const session = await CdpSession.connect(`ws://127.0.0.1:${port}/devtools/page/${pageId}`);
      if (ended) {
        session.close();
        return;
      }

      // Listeners come first: the observer reports the lines already on screen as soon as it starts.
      session.on("Runtime.bindingCalled", (params) => {
        const { name, payload } = params as { name: string; payload: string };
        if (name !== BINDING) return;
        const message = JSON.parse(payload) as PageMessage;
        if (message.type === "caption") {
          push({ type: "caption", caption: message.caption });
        } else {
          visible.set(pageId, message.captionsVisible);
          reportStatus();
        }
      });
      // A reload or navigation clears the page; observe the new document too.
      session.on("Runtime.executionContextsCleared", () => {
        void session.send("Runtime.evaluate", { expression: observerScript }).catch(() => {});
      });
      session.onClose(() => {
        sessions.delete(pageId);
        visible.delete(pageId);
        if (ended) return;
        if (sessions.size === 0) finish();
        else reportStatus();
      });

      sessions.set(pageId, session);
      try {
        await session.send("Runtime.enable");
        await session.send("Runtime.addBinding", { name: BINDING });
        await session.send("Runtime.evaluate", { expression: observerScript });
      } catch (error) {
        sessions.delete(pageId);
        session.close();
        throw error;
      }
    } finally {
      attaching.delete(pageId);
    }
  }

  const poll = setInterval(() => {
    void listTeamsPages(port)
      .then((pages) => {
        for (const page of pages) {
          if (
            isPageOfMeeting(page.title, meeting.title) &&
            !sessions.has(page.id) &&
            !attaching.has(page.id)
          ) {
            void attach(page.id).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, SIBLING_POLL_MS);

  signal.addEventListener("abort", finish, { once: true });

  try {
    await attach(firstPageId);
  } catch (error) {
    finish();
    throw error;
  }
  // The meeting's other pages, such as a popped-out captions window, join without waiting for the poll.
  for (const page of await listTeamsPages(port).catch(() => [])) {
    if (
      isPageOfMeeting(page.title, meeting.title) &&
      !sessions.has(page.id) &&
      !attaching.has(page.id)
    ) {
      await attach(page.id).catch(() => {});
    }
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
      finish();
    }
  })();
}
