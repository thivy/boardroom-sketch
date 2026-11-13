import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/captions/stream")({
  server: { handlers: { GET: ({ request }) => captionHandlers.stream(request) } },
});
