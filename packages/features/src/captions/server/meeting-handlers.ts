import type { CaptionSource } from "@app/contracts";
import { errorMessage, json, rejectNonJson } from "../../shared/server/http";

/** `GET`: the meetings that can be read right now. */
export async function listMeetings(source: CaptionSource): Promise<Response> {
  try {
    return json(await source.listMeetings());
  } catch (error) {
    return json({ error: errorMessage(error, "Could not list meetings") }, 502);
  }
}

/** `GET`: the windows the source can see, to explain why no meeting was found. */
export async function listWindows(source: CaptionSource): Promise<Response> {
  try {
    return json((await source.listWindows?.()) ?? []);
  } catch (error) {
    return json({ error: errorMessage(error, "Could not list windows") }, 502);
  }
}

/** `POST`: lets the source get Teams ready to be read, if it has a way to. */
export async function prepareSource(request: Request, source: CaptionSource): Promise<Response> {
  const rejected = rejectNonJson(request);
  if (rejected) return rejected;
  if (!source.prepare) return json({ error: "This source cannot restart Teams" }, 501);
  try {
    await source.prepare();
    return json({});
  } catch (error) {
    return json({ error: errorMessage(error, "Could not prepare Teams") }, 500);
  }
}
