import { createFileRoute } from "@tanstack/react-router";
import { workspaceHandlers } from "../../workspace-handlers";

export const Route = createFileRoute("/api/workspaces/item")({
  server: {
    handlers: {
      GET: ({ request }) => workspaceHandlers.get(request),
      PATCH: ({ request }) => workspaceHandlers.rename(request),
    },
  },
});
