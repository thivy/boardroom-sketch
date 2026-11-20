import { idParam, json, queryParam, readJson, rejectNonJson } from "../../shared/server/http";
import { BuildError, type GraphBuilder } from "./build";

/** `GET ?session=<id>&meeting=<id>`: where building the graph from that transcript is. */
export async function buildStatus(request: Request, builder: GraphBuilder): Promise<Response> {
  const session = idParam(request, "session");
  const meeting = queryParam(request, "meeting");
  if (session === undefined || !meeting) return json({ error: "Missing session or meeting" }, 400);
  return json(await builder.status(session, meeting));
}

/**
 * `POST { sessionId, replace? }`: starts building the graph from a saved transcript. Answers 409 with
 * code `graph_exists` when the meeting already has a graph and `replace` was not set.
 */
export async function buildStart(request: Request, builder: GraphBuilder): Promise<Response> {
  const rejected = rejectNonJson(request);
  if (rejected) return rejected;
  const body = await readJson<{ sessionId: unknown; replace: unknown }>(request);
  if (!Number.isInteger(body.sessionId) || (body.sessionId as number) <= 0) {
    return json({ error: "Missing sessionId" }, 400);
  }
  try {
    const status = await builder.start(body.sessionId as number, {
      replace: body.replace === true,
    });
    return json(status, 202);
  } catch (error) {
    if (error instanceof BuildError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    throw error;
  }
}

/** `DELETE ?session=<id>`: stops a running build; what was built so far is kept. */
export function buildCancel(request: Request, builder: GraphBuilder): Response {
  const session = idParam(request, "session");
  if (session === undefined) return json({ error: "Missing session" }, 400);
  return builder.cancel(session) ? json({}) : json({ error: "No build is running" }, 404);
}
