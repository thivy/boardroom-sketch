import { createCaptionHandlers } from "@app/features/captions/server";
import { teamsCdp } from "@app/teams-cdp";

// The one place the captions feature meets a caption source. Swap `teamsCdp()` to change where captions come from.
export const captionHandlers = createCaptionHandlers(teamsCdp());
