import { json, readJson, rejectNonJson } from "../../shared/server/http";
import type { LiveGraphSwitch } from "./live-graph-switch";

/** `GET`: whether the graph is built while a meeting is recorded. */
export async function liveStatus(liveGraph: LiveGraphSwitch): Promise<Response> {
  return json({ enabled: await liveGraph.get() });
}

/** `PUT { enabled }`: turns building the graph during a recording on or off. */
export async function liveUpdate(request: Request, liveGraph: LiveGraphSwitch): Promise<Response> {
  const rejected = rejectNonJson(request);
  if (rejected) return rejected;
  const body = await readJson<{ enabled: unknown }>(request);
  if (typeof body.enabled !== "boolean") return json({ error: "Missing enabled" }, 400);
  return json({ enabled: await liveGraph.set(body.enabled) });
}
