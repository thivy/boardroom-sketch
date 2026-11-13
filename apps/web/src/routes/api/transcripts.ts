import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/transcripts")({
  server: { handlers: { GET: () => captionHandlers.transcripts() } },
});
