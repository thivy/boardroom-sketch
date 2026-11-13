import { createFileRoute } from "@tanstack/react-router";
import { chatHandlers } from "../../chat-handlers";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => chatHandlers.message(request),
      DELETE: ({ request }) => chatHandlers.close(request),
    },
  },
});
