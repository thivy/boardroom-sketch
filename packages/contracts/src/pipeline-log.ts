export type PipelineEventKind =
  /** A triage verdict for a turn. */
  | "triage"
  /** One extraction run: what it was given and how many changes were accepted. */
  | "extract"
  /** A change that was dropped, and why. */
  | "rejection"
  /** A model call or a step that failed. */
  | "error";

export type PipelineEvent = {
  id: number;
  meetingId: string;
  kind: PipelineEventKind;
  detail: Record<string, unknown>;
  /** Epoch milliseconds. */
  createdAt: number;
};

/**
 * What the graph pipeline did and decided, kept so its choices can be scored afterwards (did Triage
 * skip something that mattered? what did validation reject?). Deleted with the meeting.
 */
export interface PipelineLog {
  record(
    meetingId: string,
    kind: PipelineEventKind,
    detail: Record<string, unknown>,
  ): Promise<void>;
  list(
    meetingId: string,
    filter?: { kind?: PipelineEventKind; limit?: number },
  ): Promise<PipelineEvent[]>;
}
