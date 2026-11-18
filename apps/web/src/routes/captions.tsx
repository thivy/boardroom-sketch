import { CaptionsPage } from "@app/features/captions/client";
import { LiveGraphSwitch } from "@app/features/graph/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/captions")({
  component: CaptionsRoute,
});

// Routes compose features: the captions page has a slot beside its recording buttons, and the graph
// feature puts its live-graph switch there, so neither feature knows about the other.
function CaptionsRoute() {
  return <CaptionsPage options={<LiveGraphSwitch className="ml-2" />} />;
}
