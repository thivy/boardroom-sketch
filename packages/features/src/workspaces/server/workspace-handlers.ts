import type { WorkspaceStore } from "@app/contracts";
import { idParam, json, readJson, rejectNonJson } from "../../shared/server/http";

const MAX_TITLE = 200;
const DEFAULT_TITLE = "Untitled workspace";

/** A title may be empty while the person is typing, so only its length is limited. */
const validTitle = (title: unknown): title is string =>
  typeof title === "string" && title.length <= MAX_TITLE;

/** `GET`: every workspace. */
export async function listWorkspaces(store: WorkspaceStore): Promise<Response> {
  return json(await store.list());
}

/** `GET ?id=<id>`: one workspace. */
export async function getWorkspace(request: Request, store: WorkspaceStore): Promise<Response> {
  const id = idParam(request, "id");
  if (id === undefined) return json({ error: "Missing or invalid id" }, 400);
  const workspace = await store.get(id);
  return workspace ? json(workspace) : json({ error: "No such workspace" }, 404);
}

/** `POST {title?}`: makes a workspace. */
export async function createWorkspace(request: Request, store: WorkspaceStore): Promise<Response> {
  const rejected = rejectNonJson(request);
  if (rejected) return rejected;
  const { title = DEFAULT_TITLE } = await readJson<{ title: string }>(request);
  if (!validTitle(title)) {
    return json({ error: `Title must be at most ${MAX_TITLE} characters` }, 400);
  }
  return json(await store.create(title), 201);
}

/** `PATCH ?id=<id> {title}`: renames a workspace. */
export async function renameWorkspace(request: Request, store: WorkspaceStore): Promise<Response> {
  const rejected = rejectNonJson(request);
  if (rejected) return rejected;
  const id = idParam(request, "id");
  if (id === undefined) return json({ error: "Missing or invalid id" }, 400);
  const { title } = await readJson<{ title: string }>(request);
  if (!validTitle(title)) {
    return json({ error: `Title must be text of at most ${MAX_TITLE} characters` }, 400);
  }
  const workspace = await store.rename(id, title);
  return workspace ? json(workspace) : json({ error: "No such workspace" }, 404);
}
