import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/captions/prepare")({
  server: { handlers: { POST: ({ request }) => captionHandlers.prepare(request) } },
});
