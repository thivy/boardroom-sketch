import type { Workspace } from "@app/contracts";
import { Empty, EmptyDescription, EmptyHeader } from "@app/ui/components/empty";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "../../app-header";
import { request } from "../../shared/client/api-request";
import { WorkspaceTitle } from "./workspace-title";

/** One workspace. The title is the only part so far; meetings and files come next. */
export function WorkspacePage({ id, backLink }: { id: number; backLink: React.ReactElement }) {
  const workspace = useQuery({
    queryKey: ["workspaces", id],
    queryFn: () => request<Workspace>(`/api/workspaces/item?id=${id}`),
    refetchOnMount: "always",
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Workspaces" />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {workspace.isError && (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="rounded bg-destructive px-1.5 text-destructive-foreground">
              {workspace.error.message}
            </p>
            {backLink}
          </div>
        )}

        {workspace.data && (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <WorkspaceTitle workspace={workspace.data} />
            <Empty className="border">
              <EmptyHeader>
                <EmptyDescription>This workspace has no meetings or files yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
