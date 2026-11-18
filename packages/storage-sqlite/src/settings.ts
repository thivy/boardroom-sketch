import { DEFAULT_SETTINGS, type AppSettings, type SettingsStore } from "@app/contracts";
import type { DatabaseSync } from "node:sqlite";
import { migrate, type Migration } from "./database";

/** Append a step to change the schema; never edit one that has shipped. */
const migration: Migration = {
  module: "settings",
  steps: [
    `
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL CHECK (json_valid(value))
    );
    `,
  ],
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

/** Keeps the app's settings in the shared database, one row per setting. */
export function settingsSqlite(db: DatabaseSync): SettingsStore {
  migrate(db, migration);

  const select = db.prepare("SELECT key, value FROM settings");
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  function read(): AppSettings {
    const settings: AppSettings = { ...DEFAULT_SETTINGS };
    for (const row of select.all() as { key: string; value: string }[]) {
      if (!(KEYS as string[]).includes(row.key)) continue;
      const value = JSON.parse(row.value);
      // A value of the wrong type (an edited file, an older build) falls back to the default.
      if (typeof value === typeof DEFAULT_SETTINGS[row.key as keyof AppSettings]) {
        Object.assign(settings, { [row.key]: value });
      }
    }
    return settings;
  }

  return {
    async get() {
      return read();
    },

    async update(changes) {
      db.exec("BEGIN");
      try {
        for (const key of KEYS) {
          const value = changes[key];
          if (value === undefined) continue;
          if (typeof value !== typeof DEFAULT_SETTINGS[key]) {
            throw new TypeError(`Setting ${key} must be a ${typeof DEFAULT_SETTINGS[key]}`);
          }
          upsert.run(key, JSON.stringify(value));
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return read();
    },
  };
}
