import {
  EDGE_FAMILIES,
  EDGE_RULES,
  EDGE_TYPES,
  NODE_STATUSES,
  NODE_TYPES,
  ORIGINS,
  PERSON_ROLE_NAMES,
  SYMMETRIC_EDGE_TYPES,
} from "@app/contracts";
import type { Migration } from "./database";

const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(", ");

// The CHECK constraints below are written from the contracts' vocabulary, so the database refuses
// exactly what the TypeScript types do. Changing the vocabulary needs a new migration step that
// rebuilds the table (SQLite cannot alter a CHECK); never edit a step that has shipped.
const statusByType = NODE_TYPES.map(
  (type) => `(type = '${type}' AND status IN (${list(NODE_STATUSES[type])}))`,
).join("\n      OR ");

const familyByType = EDGE_TYPES.map(
  (type) => `(type = '${type}' AND family = '${EDGE_RULES[type].family}')`,
).join("\n      OR ");

const OPS = [
  "create_node",
  "update_node",
  "set_status",
  "merge_nodes",
  "delete_node",
  "add_edge",
  "delete_edge",
  "link_person",
  "unlink_person",
];

const steps: string[] = [
  `
  CREATE TABLE graph_nodes (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (${list(NODE_TYPES)})),
    status TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    topic_id TEXT REFERENCES graph_nodes(id) ON DELETE SET NULL,
    origin TEXT NOT NULL CHECK (origin IN (${list(ORIGINS)})),
    confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
    attrs TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs)),
    merged_into TEXT REFERENCES graph_nodes(id) ON DELETE CASCADE,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (id, meeting_id),
    CHECK (id <> topic_id),
    CHECK (id <> merged_into),
    CHECK (
      ${statusByType}
    )
  );
  CREATE INDEX graph_nodes_by_meeting ON graph_nodes(meeting_id, created_at);
  CREATE INDEX graph_nodes_by_topic ON graph_nodes(topic_id);

  CREATE TABLE graph_edges (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    src_id TEXT NOT NULL,
    dst_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (${list(EDGE_TYPES)})),
    family TEXT NOT NULL CHECK (family IN (${list(EDGE_FAMILIES)})),
    origin TEXT NOT NULL CHECK (origin IN (${list(ORIGINS)})),
    confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
    rationale TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (src_id, meeting_id) REFERENCES graph_nodes(id, meeting_id) ON DELETE CASCADE,
    FOREIGN KEY (dst_id, meeting_id) REFERENCES graph_nodes(id, meeting_id) ON DELETE CASCADE,
    CHECK (src_id <> dst_id),
    CHECK (
      ${familyByType}
    ),
    CHECK (type NOT IN (${list(SYMMETRIC_EDGE_TYPES)}) OR src_id < dst_id),
    CHECK (origin <> 'inferred' OR length(trim(COALESCE(rationale, ''))) > 0)
  );
  CREATE UNIQUE INDEX graph_edges_unique ON graph_edges(src_id, dst_id, type) WHERE deleted_at IS NULL;
  CREATE INDEX graph_edges_by_dst ON graph_edges(dst_id, type);
  CREATE INDEX graph_edges_by_meeting ON graph_edges(meeting_id);

  CREATE TABLE graph_node_person (
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    speaker_id TEXT NOT NULL REFERENCES speakers(id),
    role TEXT NOT NULL CHECK (role IN (${list(PERSON_ROLE_NAMES)})),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (node_id, speaker_id, role)
  );
  CREATE INDEX graph_node_person_by_speaker ON graph_node_person(speaker_id, role);

  CREATE TABLE graph_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN (${list(OPS)})),
    node_id TEXT REFERENCES graph_nodes(id) ON DELETE CASCADE,
    edge_id TEXT REFERENCES graph_edges(id) ON DELETE CASCADE,
    detail TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail)),
    rationale TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX graph_ops_by_node ON graph_ops(node_id, id);
  CREATE INDEX graph_ops_by_edge ON graph_ops(edge_id, id);

  CREATE TABLE graph_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id INTEGER NOT NULL REFERENCES graph_ops(id) ON DELETE CASCADE,
    caption_id INTEGER NOT NULL REFERENCES captions(id) ON DELETE CASCADE,
    quote TEXT NOT NULL CHECK (length(trim(quote)) > 0)
  );
  CREATE INDEX graph_evidence_by_op ON graph_evidence(op_id);
  CREATE INDEX graph_evidence_by_caption ON graph_evidence(caption_id);
  `,
];

/** Needs the transcripts tables (meetings, speakers, captions), which `graphSqlite` migrates first. */
export const graphMigration: Migration = { module: "graph", steps };
