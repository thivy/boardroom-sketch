import { CaptionsPage } from "@app/features/captions/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/captions")({
  component: CaptionsPage,
});
