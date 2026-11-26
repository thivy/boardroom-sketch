import type { Workspace, WorkspaceStore } from "@app/contracts";
import type { Database } from "bun:sqlite";
import { migrate, type Migration } from "./database";

/** Append a step to change the schema; never edit one that has shipped. */
const migration: Migration = {
  module: "workspaces",
  steps: [
    `
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
  ],
};

type Row = { id: number; title: string; created_at: number; updated_at: number };

const toWorkspace = (row: Row): Workspace => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Keeps workspaces in the shared database. */
export function workspacesSqlite(db: Database): WorkspaceStore {
  migrate(db, migration);

  const selectAll = db.prepare("SELECT * FROM workspaces ORDER BY updated_at DESC, id DESC");
  const selectOne = db.prepare("SELECT * FROM workspaces WHERE id = ?");
  const insert = db.prepare(
    "INSERT INTO workspaces (title, created_at, updated_at) VALUES (?, ?, ?)",
  );
  const update = db.prepare("UPDATE workspaces SET title = ?, updated_at = ? WHERE id = ?");

  const find = (id: number) => {
    const row = selectOne.get(id) as Row | undefined;
    return row && toWorkspace(row);
  };

  return {
    async list() {
      return (selectAll.all() as Row[]).map(toWorkspace);
    },

    async get(id) {
      return find(id);
    },

    async create(title) {
      const now = Date.now();
      const { lastInsertRowid } = insert.run(title, now, now);
      return find(Number(lastInsertRowid))!;
    },

    async rename(id, title) {
      update.run(title, Date.now(), id);
      return find(id);
    },
  };
}
