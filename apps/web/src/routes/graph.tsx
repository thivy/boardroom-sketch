import { GraphPage } from "@app/features/graph/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/graph")({
  // `?meeting=<id>` opens a particular meeting, for example from a transcript.
  validateSearch: (search: Record<string, unknown>): { meeting?: string } =>
    typeof search.meeting === "string" ? { meeting: search.meeting } : {},
  component: GraphRoute,
});

function GraphRoute() {
  const { meeting } = Route.useSearch();
  return <GraphPage meeting={meeting} />;
}
