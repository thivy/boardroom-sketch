import { WorkspacePage } from "@app/features/workspaces/client";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { workspaceId } = Route.useParams();
  return (
    <WorkspacePage
      key={workspaceId}
      id={Number(workspaceId)}
      backLink={<Link to="/workspaces">Back to workspaces</Link>}
    />
  );
}
