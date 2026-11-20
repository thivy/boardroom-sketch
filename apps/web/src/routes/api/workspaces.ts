import { createFileRoute } from "@tanstack/react-router";
import { workspaceHandlers } from "../../workspace-handlers";

export const Route = createFileRoute("/api/workspaces")({
  server: {
    handlers: {
      GET: () => workspaceHandlers.list(),
      POST: ({ request }) => workspaceHandlers.create(request),
    },
  },
});
