import { WorkspacesPage } from "@app/features/workspaces/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/")({
  component: WorkspacesRoute,
});

function WorkspacesRoute() {
  const navigate = useNavigate();
  return (
    <WorkspacesPage
      openLink={(id) => <Link to="/workspaces/$workspaceId" params={{ workspaceId: String(id) }} />}
      onCreated={(id) =>
        void navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: String(id) } })
      }
    />
  );
}
