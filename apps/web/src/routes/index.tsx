import { AppHeader } from "@app/features/app-header";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => <AppHeader title="Home" />,
});
