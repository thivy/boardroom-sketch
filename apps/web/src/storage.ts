import {
  openDatabase,
  graphSqlite,
  pipelineLogSqlite,
  settingsSqlite,
  transcriptsSqlite,
  workspacesSqlite,
} from "@app/storage-sqlite";

// The one SQLite file the app's stores share. Swap a store here to keep that data somewhere else.
export const database = openDatabase();
export const transcriptStore = transcriptsSqlite(database);
export const graphStore = graphSqlite(database);
export const pipelineLog = pipelineLogSqlite(database);
export const settingsStore = settingsSqlite(database);
export const workspaceStore = workspacesSqlite(database);
