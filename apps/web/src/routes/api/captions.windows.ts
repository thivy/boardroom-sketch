import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/captions/windows")({
  server: { handlers: { GET: () => captionHandlers.windows() } },
});
