import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/captions/meetings")({
  server: { handlers: { GET: () => captionHandlers.meetings() } },
});
