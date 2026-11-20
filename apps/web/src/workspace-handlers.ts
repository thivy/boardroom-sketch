import { createWorkspaceHandlers } from "@app/features/workspaces/server";
import { workspaceStore } from "./storage";

export const workspaceHandlers = createWorkspaceHandlers(workspaceStore);
