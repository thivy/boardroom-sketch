import { targetsHandler } from "@app/features/captions/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/captions/targets")({
  server: { handlers: { GET: ({ request }) => targetsHandler(request) } },
});
