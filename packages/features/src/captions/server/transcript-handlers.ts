import type { TranscriptStore } from "@app/contracts";
import { EXPORT_TYPES, exportFileName, isExportFormat, renderTranscript } from "./export";
import { json, parseSessionId } from "./http";
import type { Recorder } from "./recorder";

/** `GET`: every meeting with saved sessions, and its sessions. */
export async function listTranscripts(store: TranscriptStore): Promise<Response> {
  return json(await store.listMeetings());
}

/** `GET ?session=<id>`: one session with its captions. */
export async function getTranscript(request: Request, store: TranscriptStore): Promise<Response> {
  const id = parseSessionId(request);
  if (id === undefined) return json({ error: "Missing or invalid session" }, 400);
  const transcript = await store.getSession(id);
  return transcript ? json(transcript) : json({ error: "No such session" }, 404);
}

/** `GET ?session=<id>&format=txt|md|json`: one session as a downloadable file. */
export async function exportTranscript(
  request: Request,
  store: TranscriptStore,
): Promise<Response> {
  const id = parseSessionId(request);
  const format = new URL(request.url).searchParams.get("format") ?? "txt";
  if (id === undefined || !isExportFormat(format)) {
    return json({ error: "Missing or invalid session or format" }, 400);
  }
  const transcript = await store.getSession(id);
  if (!transcript) return json({ error: "No such session" }, 404);
  return new Response(renderTranscript(transcript, format), {
    headers: {
      "Content-Type": EXPORT_TYPES[format],
      "Content-Disposition": `attachment; filename="${exportFileName(transcript, format)}"`,
    },
  });
}

/** `DELETE ?session=<id>`: removes a saved session, unless it is still recording. */
export async function deleteTranscript(
  request: Request,
  store: TranscriptStore,
  recorder: Recorder,
): Promise<Response> {
  const id = parseSessionId(request);
  if (id === undefined) return json({ error: "Missing or invalid session" }, 400);
  if (recorder.active().some((recording) => recording.session.id === id)) {
    return json({ error: "Stop the recording before deleting it" }, 409);
  }
  await store.deleteSession(id);
  return json({});
}
