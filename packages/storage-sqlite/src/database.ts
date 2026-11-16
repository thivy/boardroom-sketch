import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DatabaseOptions = {
  /** The database file. Defaults to `DATABASE_PATH`, then `TRANSCRIPTS_DB` (the older name), then `./data/transcripts.db`. */
  path?: string;
};

export type Migration = {
  /** Names the stores's own track, so stores sharing one file never share a version number. */
  module: string;
  /** Step `n` upgrades the module's schema from version `n` to `n + 1`. */
  steps: string[];
  /** Continue from `PRAGMA user_version`, which databases made before shared storage used for this module. */
  adoptUserVersion?: boolean;
};

/** Opens (creating if needed) the one SQLite file the app's stores share. */
export function openDatabase({
  path = process.env.DATABASE_PATH || process.env.TRANSCRIPTS_DB || "./data/transcripts.db",
}: DatabaseOptions = {}): DatabaseSync {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      module TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    )`);
  return db;
}

/** Brings one module's tables up to date; each step runs once, in a transaction. */
export function migrate(db: DatabaseSync, { module, steps, adoptUserVersion }: Migration) {
  const row = db.prepare("SELECT version FROM schema_versions WHERE module = ?").get(module) as
    | { version: number }
    | undefined;

  let current = row?.version;
  if (current === undefined) {
    current = adoptUserVersion
      ? (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version
      : 0;
    db.prepare("INSERT INTO schema_versions (module, version) VALUES (?, ?)").run(module, current);
  }

  for (let version = current; version < steps.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(steps[version]);
      db.prepare("UPDATE schema_versions SET version = ? WHERE module = ?").run(
        version + 1,
        module,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
