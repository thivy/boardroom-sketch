import type { DatabaseSync } from "node:sqlite";

/** Every statement the graph store runs, prepared once. */
export function prepareGraphStatements(db: DatabaseSync) {
  const selectNode = db.prepare("SELECT * FROM graph_nodes WHERE id = ?");
  const meetingExists = db.prepare("SELECT 1 FROM meetings WHERE id = ?");
  const insertNode = db.prepare(`
    INSERT INTO graph_nodes
      (id, meeting_id, type, status, title, topic_id, origin, confidence, attrs, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const touchNode = db.prepare("UPDATE graph_nodes SET updated_at = ? WHERE id = ?");
  const setNodeOrigin = db.prepare("UPDATE graph_nodes SET origin = ? WHERE id = ?");
  const updateNodeFields = db.prepare(
    "UPDATE graph_nodes SET title = ?, confidence = ?, topic_id = ?, attrs = ?, updated_at = ? WHERE id = ?",
  );
  const updateStatus = db.prepare("UPDATE graph_nodes SET status = ?, updated_at = ? WHERE id = ?");
  const softDeleteNode = db.prepare(
    "UPDATE graph_nodes SET deleted_at = ?, updated_at = ? WHERE id = ?",
  );
  const liveNodes = db.prepare(`
    SELECT * FROM graph_nodes
    WHERE meeting_id = ? AND merged_into IS NULL AND deleted_at IS NULL
    ORDER BY created_at, rowid`);
  const childrenOf = db.prepare("SELECT id FROM graph_nodes WHERE topic_id = ?");
  const ungroupChildren = db.prepare("UPDATE graph_nodes SET topic_id = NULL WHERE topic_id = ?");
  const moveChildren = db.prepare("UPDATE graph_nodes SET topic_id = ? WHERE topic_id = ?");
  const setMergedInto = db.prepare(
    "UPDATE graph_nodes SET merged_into = ?, updated_at = ? WHERE id = ?",
  );
  const repointMerged = db.prepare("UPDATE graph_nodes SET merged_into = ? WHERE merged_into = ?");

  const speakerName = db.prepare("SELECT name FROM speakers WHERE id = ?");
  const peopleOf = db.prepare(`
    SELECT np.speaker_id, sp.name AS speaker, np.role
    FROM graph_node_person np JOIN speakers sp ON sp.id = np.speaker_id
    WHERE np.node_id = ? ORDER BY np.created_at, np.role, np.speaker_id`);
  const peopleOfMeeting = db.prepare(`
    SELECT np.node_id, np.speaker_id, sp.name AS speaker, np.role
    FROM graph_node_person np
    JOIN speakers sp ON sp.id = np.speaker_id
    JOIN graph_nodes n ON n.id = np.node_id
    WHERE n.meeting_id = ? ORDER BY np.created_at, np.role, np.speaker_id`);
  const insertPerson = db.prepare(
    "INSERT OR IGNORE INTO graph_node_person (node_id, speaker_id, role, created_at) VALUES (?, ?, ?, ?)",
  );
  const deletePerson = db.prepare(
    "DELETE FROM graph_node_person WHERE node_id = ? AND speaker_id = ? AND role = ?",
  );
  const hasRole = db.prepare("SELECT 1 FROM graph_node_person WHERE node_id = ? AND role = ?");
  const roleCount = db.prepare(
    "SELECT COUNT(*) AS n FROM graph_node_person WHERE node_id = ? AND role = ?",
  );
  const isParticipant = db.prepare(`
    SELECT 1 FROM captions c JOIN sessions s ON s.id = c.session_id
    WHERE s.meeting_id = ? AND c.speaker_id = ? LIMIT 1`);

  const selectEdge = db.prepare("SELECT * FROM graph_edges WHERE id = ?");
  const insertEdge = db.prepare(`
    INSERT INTO graph_edges
      (id, meeting_id, src_id, dst_id, type, family, origin, confidence, rationale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const findLiveEdge = db.prepare(
    "SELECT * FROM graph_edges WHERE src_id = ? AND dst_id = ? AND type = ? AND deleted_at IS NULL AND id <> ?",
  );
  const liveEdgesTouching = db.prepare(
    "SELECT * FROM graph_edges WHERE deleted_at IS NULL AND (src_id = ? OR dst_id = ?)",
  );
  const moveEdge = db.prepare("UPDATE graph_edges SET src_id = ?, dst_id = ? WHERE id = ?");
  const softDeleteEdge = db.prepare("UPDATE graph_edges SET deleted_at = ? WHERE id = ?");
  const foldEdge = db.prepare(
    "UPDATE graph_edges SET deleted_at = ?, folded_into = ? WHERE id = ?",
  );
  const repointFolded = db.prepare("UPDATE graph_edges SET folded_into = ? WHERE folded_into = ?");
  const setEdgeOrigin = db.prepare("UPDATE graph_edges SET origin = ? WHERE id = ?");
  const meetingEdges = db.prepare(`
    SELECT e.* FROM graph_edges e
    JOIN graph_nodes s ON s.id = e.src_id AND s.merged_into IS NULL AND s.deleted_at IS NULL
    JOIN graph_nodes d ON d.id = e.dst_id AND d.merged_into IS NULL AND d.deleted_at IS NULL
    WHERE e.meeting_id = ? AND e.deleted_at IS NULL
    ORDER BY e.created_at, e.rowid`);
  const edgesWithLiveOther = db.prepare(`
    SELECT e.* FROM graph_edges e
    JOIN graph_nodes o
      ON o.id = CASE WHEN e.src_id = ? THEN e.dst_id ELSE e.src_id END
     AND o.merged_into IS NULL AND o.deleted_at IS NULL
    WHERE e.deleted_at IS NULL AND (e.src_id = ? OR e.dst_id = ?)
    ORDER BY e.created_at, e.rowid`);

  const insertOp = db.prepare(`
    INSERT INTO graph_ops (meeting_id, kind, source, node_id, edge_id, detail, rationale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`);
  const insertEvidence = db.prepare(
    "INSERT INTO graph_evidence (op_id, caption_id, quote) VALUES (?, ?, ?)",
  );
  const findCaption = db.prepare(`
    SELECT c.id FROM captions c JOIN sessions s ON s.id = c.session_id
    WHERE c.session_id = ? AND c.source_id = ? AND s.meeting_id = ?`);
  const OP_COLUMNS = "id, kind, source, node_id, edge_id, detail, rationale, created_at";
  const opsOfNode = db.prepare(`
    SELECT ${OP_COLUMNS} FROM graph_ops
    WHERE node_id = ? OR node_id IN (SELECT id FROM graph_nodes WHERE merged_into = ?)
    ORDER BY id`);
  const opsOfEdge = db.prepare(`
    SELECT ${OP_COLUMNS} FROM graph_ops
    WHERE edge_id = ? OR edge_id IN (SELECT id FROM graph_edges WHERE folded_into = ?)
    ORDER BY id`);
  const opsUpTo = db.prepare(
    `SELECT ${OP_COLUMNS} FROM graph_ops WHERE meeting_id = ? AND id <= ? ORDER BY id`,
  );
  const lastOpAt = db.prepare(
    "SELECT COALESCE(MAX(id), 0) AS id FROM graph_ops WHERE meeting_id = ? AND created_at <= ?",
  );
  const evidenceOfOp = db.prepare(`
    SELECT v.quote, c.session_id, c.source_id, c.speaker_id, sp.name AS speaker, c.updated_at
    FROM graph_evidence v
    JOIN captions c ON c.id = v.caption_id
    JOIN speakers sp ON sp.id = c.speaker_id
    WHERE v.op_id = ? ORDER BY v.id`);
  const pruneEdges = db.prepare(`
    DELETE FROM graph_edges WHERE meeting_id = ? AND folded_into IS NULL AND NOT EXISTS (
      SELECT 1 FROM graph_ops o JOIN graph_evidence v ON v.op_id = o.id
      WHERE o.edge_id = graph_edges.id
         OR o.edge_id IN (SELECT f.id FROM graph_edges f WHERE f.folded_into = graph_edges.id))`);
  const pruneNodes = db.prepare(`
    DELETE FROM graph_nodes WHERE meeting_id = ? AND merged_into IS NULL AND NOT EXISTS (
      SELECT 1 FROM graph_ops o JOIN graph_evidence v ON v.op_id = o.id
      WHERE o.node_id = graph_nodes.id
         OR o.node_id IN (SELECT m.id FROM graph_nodes m WHERE m.merged_into = graph_nodes.id))`);
  const countLiveNodes = db.prepare(
    "SELECT COUNT(*) AS n FROM graph_nodes WHERE meeting_id = ? AND merged_into IS NULL AND deleted_at IS NULL",
  );
  const clearOps = db.prepare("DELETE FROM graph_ops WHERE meeting_id = ?");
  const clearNodes = db.prepare("DELETE FROM graph_nodes WHERE meeting_id = ?");

  return {
    selectNode,
    meetingExists,
    insertNode,
    touchNode,
    setNodeOrigin,
    updateNodeFields,
    updateStatus,
    softDeleteNode,
    liveNodes,
    childrenOf,
    ungroupChildren,
    moveChildren,
    setMergedInto,
    repointMerged,
    speakerName,
    peopleOf,
    peopleOfMeeting,
    insertPerson,
    deletePerson,
    hasRole,
    roleCount,
    isParticipant,
    selectEdge,
    insertEdge,
    findLiveEdge,
    liveEdgesTouching,
    moveEdge,
    softDeleteEdge,
    foldEdge,
    repointFolded,
    setEdgeOrigin,
    meetingEdges,
    edgesWithLiveOther,
    insertOp,
    insertEvidence,
    findCaption,
    opsOfNode,
    opsOfEdge,
    opsUpTo,
    lastOpAt,
    evidenceOfOp,
    pruneEdges,
    pruneNodes,
    countLiveNodes,
    clearOps,
    clearNodes,
  };
}

export type GraphStatements = ReturnType<typeof prepareGraphStatements>;

/** Runs `work` in one transaction. */
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
