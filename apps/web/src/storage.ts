import {
  openDatabase,
  graphSqlite,
  pipelineLogSqlite,
  transcriptsSqlite,
} from "@app/storage-sqlite";

// The one SQLite file the app's stores share. Swap a store here to keep that data somewhere else.
export const database = openDatabase();
export const transcriptStore = transcriptsSqlite(database);
export const graphStore = graphSqlite(database);
export const pipelineLog = pipelineLogSqlite(database);
