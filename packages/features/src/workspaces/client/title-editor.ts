import type { Workspace } from "@app/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { jsonRequest, request } from "../../shared/client/api-request";

/** How long typing must pause before the title is saved. */
const SAVE_DELAY_MS = 400;

let timer: ReturnType<typeof setTimeout> | undefined;

async function save(queryClient: QueryClient, id: number, title: string) {
  const workspace = await request<Workspace>(
    `/api/workspaces/item?id=${id}`,
    jsonRequest("PATCH", { title }),
  );
  queryClient.setQueryData(["workspaces", id], workspace);
  await queryClient.invalidateQueries({ queryKey: ["workspaces"], exact: true });
}

/**
 * The person typed a new title. The save waits for a pause in typing. A save that is waiting still
 * runs when the person leaves the page, so no typing is lost.
 */
export function editTitle(queryClient: QueryClient, id: number, title: string) {
  clearTimeout(timer);
  timer = setTimeout(() => void save(queryClient, id, title).catch(() => {}), SAVE_DELAY_MS);
}
