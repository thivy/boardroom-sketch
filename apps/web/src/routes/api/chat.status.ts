import { createFileRoute } from "@tanstack/react-router";
import { chatHandlers } from "../../chat-handlers";

export const Route = createFileRoute("/api/chat/status")({
  server: { handlers: { GET: () => chatHandlers.status() } },
});
