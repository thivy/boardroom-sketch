import type { CaptionSource } from "@app/contracts";
import { restartTeamsWithDebugging } from "./launch-teams";
import { listMeetings } from "./list-meetings";
import { watchMeeting } from "./watch-meeting";

export type TeamsCdpOptions = {
  /** The DevTools port of the Teams WebView2 or browser. Defaults to `TEAMS_CDP_PORT`, then 9222. */
  port?: number;
};

/**
 * Reads Teams live captions through the Chrome DevTools Protocol, by observing the caption DOM of
 * the Teams web client. An interim approach: it depends on Teams' markup, not on a supported API.
 */
export function teamsCdp({
  port = Number(process.env.TEAMS_CDP_PORT) || 9222,
}: TeamsCdpOptions = {}): CaptionSource {
  return {
    listMeetings: () => listMeetings(port),
    watch: (meetingId, signal) => watchMeeting(port, meetingId, signal),
    prepare: () => restartTeamsWithDebugging(port),
  };
}
