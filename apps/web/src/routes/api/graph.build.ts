import { createFileRoute } from "@tanstack/react-router";
import { graphHandlers } from "../../graph-handlers";

export const Route = createFileRoute("/api/graph/build")({
  server: {
    handlers: {
      GET: ({ request }) => graphHandlers.buildStatus(request),
      POST: ({ request }) => graphHandlers.buildStart(request),
      DELETE: ({ request }) => graphHandlers.buildCancel(request),
    },
  },
});
