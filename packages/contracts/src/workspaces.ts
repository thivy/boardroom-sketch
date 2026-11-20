/** A place where people and agents work together on meetings and files. */
export type Workspace = {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
};

/** Where workspaces are kept. */
export interface WorkspaceStore {
  /** Every workspace, the most recently changed first. */
  list(): Promise<Workspace[]>;
  get(id: number): Promise<Workspace | undefined>;
  create(title: string): Promise<Workspace>;
  /** Returns the changed workspace, or undefined when there is none with this id. */
  rename(id: number, title: string): Promise<Workspace | undefined>;
}
