import { createFileRoute } from "@tanstack/react-router";
import { graphHandlers } from "../../graph-handlers";

export const Route = createFileRoute("/api/graph/events")({
  server: { handlers: { GET: ({ request }) => graphHandlers.events(request) } },
});
