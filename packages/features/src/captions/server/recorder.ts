import type {
  ActiveRecording,
  Caption,
  CaptionEvent,
  CaptionSource,
  TranscriptStore,
} from "@app/contracts";

type Listener = (event: CaptionEvent | { type: "closed" }) => void;

type Recording = ActiveRecording & {
  stop: AbortController;
  listeners: Set<Listener>;
  saved: Promise<void>;
};

/**
 * Records meetings on the server, so a recording does not depend on a browser being open: it runs
 * from `start` until `stop` or until the meeting goes away. Browsers follow it with `subscribe`.
 */
export function createRecorder(source: CaptionSource, store: TranscriptStore) {
  const recordings = new Map<string, Recording>();

  async function run(recording: Recording, events: AsyncIterable<CaptionEvent>) {
    try {
      for await (const event of events) {
        if (event.type === "status") recording.captionsVisible = event.captionsVisible;
        else
          recording.saved = recording.saved.then(() =>
            store.saveCaption(recording.session.id, event.caption),
          );
        for (const listener of recording.listeners) listener(event);
      }
    } catch {
      // The source failed mid-recording; what was saved so far is kept.
    } finally {
      await recording.saved.catch(() => {});
      await store.endSession(recording.session.id, Date.now());
      recordings.delete(recording.meetingId);
      for (const listener of recording.listeners) listener({ type: "closed" });
    }
  }

  const view = ({ meetingId, title, session, captionsVisible }: Recording): ActiveRecording => ({
    meetingId,
    title,
    session,
    captionsVisible,
  });

  return {
    active(): ActiveRecording[] {
      return [...recordings.values()].map(view);
    },

    /** Starts recording a meeting, or returns the recording already running for it. */
    async start(meetingId: string): Promise<ActiveRecording> {
      const running = recordings.get(meetingId);
      if (running) return view(running);

      const meeting = (await source.listMeetings()).find((item) => item.id === meetingId);
      if (!meeting) throw new Error("That meeting is gone. Find meetings again.");

      const stop = new AbortController();
      const events = await source.watch(meetingId, stop.signal);
      const session = await store.startSession(meeting, Date.now());
      const recording: Recording = {
        meetingId,
        title: meeting.title,
        session,
        captionsVisible: undefined,
        stop,
        listeners: new Set(),
        saved: Promise.resolve(),
      };
      recordings.set(meetingId, recording);
      void run(recording, events);
      return view(recording);
    },

    stop(meetingId: string): boolean {
      const recording = recordings.get(meetingId);
      recording?.stop.abort();
      return recording !== undefined;
    },

    /**
     * Follows a recording: `onSnapshot` gets the captions saved so far, then `listener` gets every
     * event until the recording ends. Returns undefined when the meeting is not being recorded.
     */
    async subscribe(
      meetingId: string,
      onSnapshot: (captions: Caption[], captionsVisible: boolean | undefined) => void,
      listener: Listener,
    ): Promise<(() => void) | undefined> {
      const recording = recordings.get(meetingId);
      if (!recording) return undefined;

      // Events that arrive while the snapshot is read are held back, so no line is lost or shown twice.
      const pending: Parameters<Listener>[0][] = [];
      let ready = false;
      const hold: Listener = (event) => (ready ? listener(event) : pending.push(event));
      recording.listeners.add(hold);

      await recording.saved.catch(() => {});
      const saved = await store.getSession(recording.session.id);
      onSnapshot(saved?.captions ?? [], recording.captionsVisible);
      ready = true;
      for (const event of pending) listener(event);

      return () => recording.listeners.delete(hold);
    },
  };
}
