import { TranscriptsPage } from "@app/features/captions/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/transcripts")({
  component: TranscriptsPage,
});
