import { createFileRoute } from "@tanstack/react-router";
import { graphHandlers } from "../../graph-handlers";

export const Route = createFileRoute("/api/graph/history")({
  server: { handlers: { GET: ({ request }) => graphHandlers.history(request) } },
});
