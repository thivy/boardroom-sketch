import type { Workspace } from "@app/contracts";
import { Button } from "@app/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader } from "@app/ui/components/empty";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { cloneElement, type ReactElement } from "react";
import { AppHeader } from "../../app-header";
import { jsonRequest, request } from "../../shared/client/api-request";

export type WorkspacesPageProps = {
  /** The link the app builds with its router; the page renders each workspace card inside it. */
  openLink: (id: number) => ReactElement<Record<string, unknown>>;
  /** Called after a workspace is made, so the app can open it. */
  onCreated: (id: number) => void;
};

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function WorkspacesPage({ openLink, onCreated }: WorkspacesPageProps) {
  const queryClient = useQueryClient();

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => request<Workspace[]>("/api/workspaces"),
    refetchOnMount: "always",
  });

  const create = useMutation({
    mutationFn: () => request<Workspace>("/api/workspaces", jsonRequest("POST", {})),
    onSuccess: async (workspace) => {
      queryClient.setQueryData(["workspaces", workspace.id], workspace);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"], exact: true });
      onCreated(workspace.id);
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Workspaces" />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">Workspaces</h1>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              <PlusIcon /> New workspace
            </Button>
          </div>

          {(workspaces.isError || create.isError) && (
            <p
              role="alert"
              className="w-fit rounded bg-destructive px-1.5 text-sm text-destructive-foreground"
            >
              {(workspaces.error ?? create.error)?.message}
            </p>
          )}

          {workspaces.data?.length === 0 && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyDescription>
                  You have no workspaces yet. Select New workspace to make one.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {workspaces.data && workspaces.data.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.data.map((workspace) => (
                <li key={workspace.id} className="flex">
                  {cloneElement(
                    openLink(workspace.id),
                    { className: "flex min-w-0 flex-1 rounded-xl outline-offset-2" },
                    <div className="flex flex-1 flex-col gap-1 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted">
                      <p className="truncate text-xs text-muted-foreground">
                        Changed {dateFormat.format(workspace.updatedAt)}
                      </p>
                      <h2 className="truncate text-base font-semibold">
                        {workspace.title || "Untitled workspace"}
                      </h2>
                    </div>,
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
