import { createFileRoute } from "@tanstack/react-router";
import { captionHandlers } from "../../caption-handlers";

export const Route = createFileRoute("/api/captions/recordings")({
  server: {
    handlers: {
      GET: () => captionHandlers.recordings(),
      POST: ({ request }) => captionHandlers.startRecording(request),
      DELETE: ({ request }) => captionHandlers.stopRecording(request),
    },
  },
});
