/** A Chrome tab that looks like a Teams page, found through the DevTools endpoint. */
export type MeetingTarget = {
  id: string;
  title: string;
  url: string;
};

/** One closed-caption line. A line keeps its id while Teams extends its text. */
export type Caption = {
  id: string;
  speaker: string;
  text: string;
  /** Epoch milliseconds of the last change. */
  at: number;
};

export type CaptionStatus = {
  /** Whether the Teams live-captions panel is on screen in the meeting. */
  captionsVisible: boolean;
};
