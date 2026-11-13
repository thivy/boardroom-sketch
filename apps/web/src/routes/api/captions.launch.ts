import { launchHandler } from "@app/features/captions/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/captions/launch")({
  server: { handlers: { POST: ({ request }) => launchHandler(request) } },
});
