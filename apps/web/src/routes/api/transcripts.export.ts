import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/transcripts/export")({
  server: { handlers: { GET: ({ request }) => captionHandlers.exportTranscript(request) } },
});
