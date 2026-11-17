import { GraphPage } from "@app/features/graph/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/graph")({
  component: GraphPage,
});
