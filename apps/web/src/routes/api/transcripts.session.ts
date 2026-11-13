import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/transcripts/session")({
  server: {
    handlers: {
      GET: ({ request }) => captionHandlers.transcript(request),
      DELETE: ({ request }) => captionHandlers.deleteTranscript(request),
    },
  },
});
