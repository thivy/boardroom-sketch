# Storage with SQLite

`packages/storage-sqlite` owns the one SQLite file the whole app shares. It implements the store ports from `packages/contracts` (`TranscriptStore`, `GraphStore`, `PipelineLog`, `SettingsStore`, `WorkspaceStore`) and any future store.

## Runtime

- It uses Bun's built-in `bun:sqlite` with no external database driver. Run the app and its server with Bun (`bun run dev`, `bun run start`, or the desktop sidecar).
- `openDatabase()` opens the file: `DATABASE_PATH`, then `TRANSCRIPTS_DB` (the older name), then `./data/transcripts.db`.
- Open the shared stores once, in `apps/web/src/storage.ts`.
- The package has the same import limits as the other adapters (see [ports-and-adapters.md](ports-and-adapters.md)).

## Adding a store

1. Add the port to `packages/contracts/src` and export it.
2. Add `packages/storage-sqlite/src/<name>.ts` that exports `<name>Sqlite(db: Database)`, typed from `bun:sqlite`.
3. Give it a `Migration` with its own `module` name and call `migrate(db, migration)` first. Each module has its own version track in `schema_versions`.
4. Append a step to change a schema. Never edit a step that has shipped.
5. Export it from `src/index.ts` and open it in `apps/web/src/storage.ts`.

## Large stores

A small store stays in one file (`settings.ts`, `workspaces.ts`, `transcripts.ts`). Split a store once it grows past a few hundred lines, the way `graph` is split: `graph.ts` only composes.

- `graph-queries.ts`: how the graph is read.
- `graph-commands.ts`: how it is changed, and the log.
- `graph-statements.ts`: every prepared statement, and the transaction helper.
- `graph-rules.ts`: row types and checks that need no database.

Every change to the graph runs in one transaction and is written to `graph_ops` with enough detail to rebuild the graph from the log alone.
