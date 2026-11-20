import type { WorkspaceStore } from "@app/contracts";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  renameWorkspace,
} from "./workspace-handlers";

/** Composes the workspace endpoint groups into plain `(Request) => Response` handlers. */
export function createWorkspaceHandlers(store: WorkspaceStore) {
  return {
    list: () => listWorkspaces(store),
    get: (request: Request) => getWorkspace(request, store),
    create: (request: Request) => createWorkspace(request, store),
    rename: (request: Request) => renameWorkspace(request, store),
  };
}
