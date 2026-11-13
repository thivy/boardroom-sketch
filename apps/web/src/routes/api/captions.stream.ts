import { streamHandler } from "@app/features/captions/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/captions/stream")({
  server: { handlers: { GET: ({ request }) => streamHandler(request) } },
});
