import type { Workspace } from "@app/contracts";
import { Input } from "@app/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { editTitle } from "./title-editor";

/** A title that is an input: click it, type, and it saves by itself. */
export function WorkspaceTitle({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();

  return (
    <Input
      aria-label="Workspace title"
      placeholder="Untitled workspace"
      defaultValue={workspace.title}
      maxLength={200}
      onChange={(event) => editTitle(queryClient, workspace.id, event.currentTarget.value)}
      className="h-12 min-w-0 rounded-xl bg-transparent px-3 text-2xl font-semibold hover:bg-muted focus-visible:bg-muted md:text-2xl"
    />
  );
}
