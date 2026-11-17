import type { Caption } from "@app/contracts";

/** One person speaking, from their first caption line to the last, ended by another speaker or by silence. */
export type Turn = {
  id: string;
  sessionId: number;
  speakerId: string;
  speaker: string;
  /** The caption lines in order, with the text each had when the turn ended. */
  lines: { id: string; text: string }[];
  startedAt: number;
  endedAt: number;
};

export type TurnBuilderOptions = {
  /** Silence after which a turn is over when nobody else has spoken. Default 4 seconds. */
  idleMs?: number;
  /** A long monologue is cut into turns of about this length at a line break. Default 45 seconds. */
  maxMs?: number;
  onTurn: (turn: Turn) => void;
  now?: () => number;
};

type Open = {
  speakerKey: string;
  speakerId: string;
  speaker: string;
  lines: Map<string, string>;
  startedAt: number;
};

const speakerKey = ({ speakerId, speaker }: Pick<Caption, "speakerId" | "speaker">) =>
  speakerId || `name:${speaker}`;

/**
 * The turns of a transcript that is already complete: runs of lines by one speaker, cut where another
 * speaker starts, or after about `maxChars` of text so that a monologue does not become one huge turn.
 * (Nothing is live here, so there is no silence to wait for.)
 */
export function turnsFromCaptions(
  sessionId: number,
  captions: readonly Caption[],
  { maxChars = 1_200 }: { maxChars?: number } = {},
): Turn[] {
  const turns: Turn[] = [];
  let open: Turn | undefined;
  let who = "";
  let chars = 0;
  for (const caption of captions) {
    const text = caption.text.trim();
    if (!text) continue;
    const key = speakerKey(caption);
    if (!open || key !== who || chars + text.length > maxChars) {
      open = {
        id: `${sessionId}:${caption.id}`,
        sessionId,
        speakerId: caption.speakerId,
        speaker: caption.speaker,
        lines: [],
        startedAt: caption.at,
        endedAt: caption.at,
      };
      turns.push(open);
      who = key;
      chars = 0;
    }
    open.lines.push({ id: caption.id, text });
    open.endedAt = caption.at;
    chars += text.length;
  }
  return turns;
}

/**
 * Turns caption lines into finished turns. Teams keeps rewriting a line while it is spoken and gives
 * no sign that a person has finished, so a turn ends when someone else starts or after a pause. Only
 * finished turns go on to the pipeline, and a line already handed on is never handed on again.
 */
export function createTurnBuilder(sessionId: number, options: TurnBuilderOptions) {
  const { idleMs = 4_000, maxMs = 45_000, onTurn, now = Date.now } = options;
  let open: Open | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const handedOn = new Set<string>();

  function close() {
    clearTimeout(timer);
    timer = undefined;
    if (!open) return;
    const finished = open;
    open = undefined;
    const lines = [...finished.lines].map(([id, text]) => ({ id, text }));
    for (const line of lines) handedOn.add(line.id);
    onTurn({
      id: `${sessionId}:${lines[0].id}`,
      sessionId,
      speakerId: finished.speakerId,
      speaker: finished.speaker,
      lines,
      startedAt: finished.startedAt,
      endedAt: now(),
    });
  }

  return {
    /** A caption line arrived, or its text grew. */
    add(caption: Caption) {
      if (handedOn.has(caption.id) || !caption.text.trim()) return;
      const key = speakerKey(caption);
      const tooLong = open && now() - open.startedAt > maxMs && !open.lines.has(caption.id);
      if (open && (open.speakerKey !== key || tooLong)) close();
      open ??= {
        speakerKey: key,
        speakerId: caption.speakerId,
        speaker: caption.speaker,
        lines: new Map(),
        startedAt: now(),
      };
      open.lines.set(caption.id, caption.text);
      clearTimeout(timer);
      timer = setTimeout(close, idleMs);
      timer.unref?.();
    },

    /** Ends the turn in progress, for example when the recording ends. */
    flush: close,

    /** Drops the turn in progress without handing it on. */
    cancel() {
      clearTimeout(timer);
      open = undefined;
    },
  };
}
