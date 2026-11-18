import type { CaptionSource, RecordingObserver, TranscriptStore } from "@app/contracts";
import { listMeetings, listWindows, prepareSource } from "./meeting-handlers";
import {
  listRecordings,
  startRecording,
  stopRecording,
  streamRecording,
} from "./recording-handlers";
import {
  deleteTranscript,
  exportTranscript,
  getTranscript,
  listTranscripts,
} from "./transcript-handlers";
import { createRecorder } from "./recorder";

/**
 * Composes the caption endpoint groups into plain `(Request) => Response` handlers.
 * `observers` follow each recording as it happens.
 */
export function createCaptionHandlers(
  source: CaptionSource,
  store: TranscriptStore,
  observers: RecordingObserver[] = [],
) {
  const recorder = createRecorder(source, store, observers);

  return {
    meetings: () => listMeetings(source),
    windows: () => listWindows(source),
    recordings: () => listRecordings(recorder),
    startRecording: (request: Request) => startRecording(request, recorder),
    stopRecording: (request: Request) => stopRecording(request, recorder),
    stream: (request: Request) => streamRecording(request, recorder),
    prepare: (request: Request) => prepareSource(request, source),
    transcripts: () => listTranscripts(store),
    transcript: (request: Request) => getTranscript(request, store),
    exportTranscript: (request: Request) => exportTranscript(request, store),
    deleteTranscript: (request: Request) => deleteTranscript(request, store, recorder),
  };
}
