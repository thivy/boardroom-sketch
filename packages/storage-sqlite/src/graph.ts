import {
  EDGE_RULES,
  GraphRuleError,
  INITIAL_STATUSES,
  NODE_TRANSITIONS,
  STATUS_PRECONDITIONS,
  canTransition,
  edgeAllowed,
  isEdgeType,
  isNodeType,
  isOrigin,
  isPersonRole,
  isStatusOf,
  mayOverwrite,
  orientEdge,
  originRank,
  parseAttrs,
  replayGraph,
  roleAllowed,
  speakerKey,
  type AddEdgeInput,
  type AddEvidenceInput,
  type Change,
  type CommandResult,
  type CreateNodeInput,
  type DeleteEdgeInput,
  type DeleteNodeInput,
  type EdgeFamily,
  type EdgeType,
  type Evidence,
  type GraphCommand,
  type GraphEdge,
  type GraphErrorCode,
  type GraphNode,
  type GraphOp,
  type GraphOpDetails,
  type GraphOpKind,
  type GraphStore,
  type MeetingGraph,
  type MergeNodesInput,
  type NodeEdge,
  type NodePerson,
  type NodeType,
  type Origin,
  type OriginChange,
  type PersonLinkInput,
  type PersonRef,
  type PersonRole,
  type ReplayOp,
  type SetStatusInput,
  type StatusPrecondition,
  type UpdateNodeInput,
} from "@app/contracts";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { migrate } from "./database";
import { graphMigration } from "./graph-schema";
import { transcriptsMigration } from "./transcripts-schema";

type NodeRow = {
  id: string;
  meeting_id: string;
  type: NodeType;
  status: string;
  title: string;
  topic_id: string | null;
  origin: Origin;
  confidence: number;
  attrs: string;
  merged_into: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
};

type EdgeRow = {
  id: string;
  meeting_id: string;
  src_id: string;
  dst_id: string;
  type: EdgeType;
  family: EdgeFamily;
  origin: Origin;
  confidence: number;
  rationale: string | null;
  folded_into: string | null;
  deleted_at: number | null;
  created_at: number;
};

type PersonRow = { speaker_id: string; speaker: string; role: PersonRole };

type OpRow = {
  id: number;
  kind: GraphOpKind;
  source: Origin;
  node_id: string | null;
  edge_id: string | null;
  detail: string;
  rationale: string | null;
  created_at: number;
};

/** A change's evidence, matched to stored captions, and its rationale. */
type Justification = {
  evidence: { captionId: number; quote: string }[];
  rationale: string | null;
};

type Outcome = { nodeId?: string; edgeId?: string };

/** The settings a run of commands shares: who is changing the graph, and the names they gave nodes. */
type Run = { source: Origin; refs: Map<string, string> };

function fail(code: GraphErrorCode, message: string): never {
  throw new GraphRuleError(code, message);
}

const toPerson = (row: PersonRow): NodePerson => ({
  speakerId: row.speaker_id.startsWith("name:") ? "" : row.speaker_id,
  speaker: row.speaker,
  role: row.role,
});

const toEdge = (row: EdgeRow): GraphEdge => ({
  id: row.id,
  meetingId: row.meeting_id,
  type: row.type,
  family: row.family,
  srcId: row.src_id,
  dstId: row.dst_id,
  origin: row.origin,
  confidence: row.confidence,
  rationale: row.rationale,
  createdAt: row.created_at,
});

const checkConfidence = (value: number) => {
  if (typeof value !== "number" || !(value >= 0 && value <= 1)) {
    fail("invalid_input", "Confidence must be a number from 0 to 1");
  }
  return value;
};

const checkSource = (value: unknown, rationale: string | null): Origin => {
  if (!isOrigin(value)) fail("invalid_input", `Unknown source "${String(value)}"`);
  if (value === "inferred" && !rationale) {
    fail("missing_rationale", "Something inferred needs a rationale that says why");
  }
  return value;
};

const outranked = (source: Origin, target: Origin, what: string) => {
  if (!mayOverwrite(source, target)) {
    fail(
      "outranked",
      `${what} is ${target}, and a change that is only ${source} cannot overwrite it`,
    );
  }
};

/**
 * Keeps a meeting's graph in the shared database (see `openDatabase`). Every change runs in one
 * transaction and is written to `graph_ops` with enough detail to rebuild the graph from the log
 * alone, and with the transcript quotes that justify it.
 */
export function graphSqlite(db: DatabaseSync): GraphStore {
  // The graph points at meetings, speakers and captions, so their tables come first.
  migrate(db, transcriptsMigration);
  migrate(db, graphMigration);

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

  let lastOpId = 0;
  /** When the command being run happened, so every row it writes carries the same time. */
  let stamp = 0;

  function transaction<T>(work: () => T): T {
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

  // ---- reading ----

  /** The node, or the node it was merged into. Throws when it is missing or deleted. */
  function liveRow(id: string): NodeRow {
    let row = selectNode.get(id) as NodeRow | undefined;
    if (row?.merged_into) row = selectNode.get(row.merged_into) as NodeRow | undefined;
    if (!row || row.deleted_at !== null) fail("not_found", `No such node: ${id}`);
    return row;
  }

  function toNode(row: NodeRow, people?: PersonRow[]): GraphNode {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      type: row.type,
      status: row.status,
      title: row.title,
      topicId: row.topic_id,
      origin: row.origin,
      confidence: row.confidence,
      attrs: JSON.parse(row.attrs),
      people: (people ?? (peopleOf.all(row.id) as PersonRow[])).map(toPerson),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as GraphNode;
  }

  const nodeById = (id: string) => toNode(selectNode.get(id) as NodeRow);
  const edgeById = (id: string) => toEdge(selectEdge.get(id) as EdgeRow);

  function edgesTouching(nodeId: string): NodeEdge[] {
    const rows = edgesWithLiveOther.all(nodeId, nodeId, nodeId) as EdgeRow[];
    return rows.map((row) => ({
      ...toEdge(row),
      direction: EDGE_RULES[row.type].symmetric ? "both" : row.src_id === nodeId ? "out" : "in",
      otherId: row.src_id === nodeId ? row.dst_id : row.src_id,
    }));
  }

  // ---- justification and the log ----

  /** Matches a change's evidence to stored captions of this meeting, and checks it says enough. */
  function justify(
    change: Change,
    meetingId: string,
    needs: "evidence" | "evidence or rationale",
  ): Justification {
    const rationale = change.rationale?.trim() || null;
    const given = change.evidence ?? [];
    if (given.length === 0 && (needs === "evidence" || !rationale)) {
      fail(
        "missing_evidence",
        needs === "evidence"
          ? "This needs evidence: at least one quote from the transcript"
          : "This needs evidence from the transcript, or a rationale if the system worked it out",
      );
    }
    const evidence = given.map((item) => {
      const quote = item.quote?.trim();
      if (!quote) fail("invalid_input", "Evidence needs the quoted words");
      const caption = findCaption.get(item.sessionId, item.captionId, meetingId) as
        | { id: number }
        | undefined;
      if (!caption) {
        fail(
          "unknown_caption",
          `Caption ${item.captionId} of session ${item.sessionId} is not part of this meeting`,
        );
      }
      return { captionId: caption.id, quote };
    });
    return { evidence, rationale };
  }

  function record<K extends GraphOpKind>(
    meetingId: string,
    kind: K,
    source: Origin,
    subject: { nodeId?: string; edgeId?: string },
    detail: GraphOpDetails[K],
    { evidence, rationale }: Justification,
  ) {
    const { id } = insertOp.get(
      meetingId,
      kind,
      source,
      subject.nodeId ?? null,
      subject.edgeId ?? null,
      JSON.stringify(detail),
      rationale,
      stamp,
    ) as { id: number };
    for (const item of evidence) insertEvidence.run(id, item.captionId, item.quote);
    lastOpId = id;
  }

  /** A person's own edit makes a node `human`. */
  function adopt(row: NodeRow, source: Origin): OriginChange | undefined {
    if (source !== "human" || row.origin === "human") return undefined;
    setNodeOrigin.run("human", row.id);
    return { from: row.origin, to: "human" };
  }

  // ---- people ----

  const personOf = (key: string, role: PersonRole): NodePerson =>
    toPerson({
      speaker_id: key,
      speaker: (speakerName.get(key) as { name: string } | undefined)?.name ?? "",
      role,
    });

  /** The stored speaker key, once the person is known to have spoken in this meeting. */
  function participant(meetingId: string, person: PersonRef): string {
    const key = speakerKey(person);
    if (!isParticipant.get(meetingId, key)) {
      fail("unknown_person", `${person.speaker || key} has not spoken in this meeting`);
    }
    return key;
  }

  function checkRole(type: NodeType, role: unknown): PersonRole {
    if (!isPersonRole(role)) fail("invalid_role", `Unknown role "${String(role)}"`);
    if (!roleAllowed(role, type)) fail("invalid_role", `A ${type} cannot have a ${role}`);
    return role;
  }

  // ---- rules that need the stored graph ----

  function checkTopic(type: NodeType, meetingId: string, topicId: string): string {
    if (type === "topic") fail("invalid_input", "A topic cannot sit under another topic");
    const topic = liveRow(topicId);
    if (topic.type !== "topic" || topic.meeting_id !== meetingId) {
      fail("invalid_input", "A node can only sit under a topic of its own meeting");
    }
    return topic.id;
  }

  function assertPreconditions(
    row: NodeRow,
    to: string,
    justification: Justification,
    source: Origin,
  ) {
    const rules = STATUS_PRECONDITIONS[row.type] as
      | Record<string, StatusPrecondition | undefined>
      | undefined;
    const rule = rules?.[to];
    if (!rule) return;
    const refuse = (what: string) =>
      fail("precondition_failed", `A ${row.type} cannot become ${to} without ${what}`);

    switch (rule.kind) {
      case "evidence":
        // A person's own confirmation is the evidence; only a model has to point at the words.
        if (source !== "human" && justification.evidence.length === 0) {
          refuse("a quote from the transcript");
        }
        break;
      case "owner":
        if (!hasRole.get(row.id, "owner")) refuse("an owner");
        break;
      case "edge": {
        const edge = edgesTouching(row.id).some(
          (item) => rule.types.includes(item.type) && item.direction !== "out",
        );
        const role = rule.orRole !== undefined && hasRole.get(row.id, rule.orRole) !== undefined;
        if (!edge && !role) {
          refuse(
            `${rule.types.join(" or ")} pointing at it${rule.orRole ? ` (or a ${rule.orRole} person)` : ""}`,
          );
        }
        break;
      }
    }
  }

  // ---- changes ----

  function create(input: CreateNodeInput, run: Run): Outcome {
    if (!meetingExists.get(input.meetingId))
      fail("not_found", `No such meeting: ${input.meetingId}`);
    if (!isNodeType(input.type)) fail("invalid_input", `Unknown node type "${String(input.type)}"`);
    const type = input.type;

    const title = input.title?.trim();
    if (!title) fail("invalid_input", "A node needs a title");
    const status = input.status ?? INITIAL_STATUSES[type][0];
    if (!(INITIAL_STATUSES[type] as readonly string[]).includes(status)) {
      fail(
        "invalid_status",
        `A ${type} starts as ${INITIAL_STATUSES[type].join(" or ")}, not ${status}; change the status afterwards`,
      );
    }

    const source = input.source ?? run.source;
    const justification = justify(
      input,
      input.meetingId,
      source === "human" ? "evidence or rationale" : "evidence",
    );
    checkSource(source, justification.rationale);
    const confidence = checkConfidence(input.confidence ?? 1);
    const attrs = parseAttrs(type, input.attrs ?? {});
    const topicId = input.topicId ? checkTopic(type, input.meetingId, input.topicId) : null;

    const links = (input.people ?? []).map(({ person, role }) => ({
      key: participant(input.meetingId, person),
      role: checkRole(type, role),
    }));
    if (type === "action" && status === "committed" && !links.some((l) => l.role === "owner")) {
      fail("precondition_failed", "A committed action needs an owner");
    }

    const id = randomUUID();
    const at = stamp;
    insertNode.run(
      id,
      input.meetingId,
      type,
      status,
      title,
      topicId,
      source,
      confidence,
      JSON.stringify(attrs),
      at,
      at,
    );
    for (const link of links) insertPerson.run(id, link.key, link.role, at);
    record(
      input.meetingId,
      "create_node",
      source,
      { nodeId: id },
      {
        type,
        status,
        title,
        topicId,
        origin: source,
        confidence,
        attrs,
        people: (peopleOf.all(id) as PersonRow[]).map(toPerson),
      },
      justification,
    );
    return { nodeId: id };
  }

  function update(input: UpdateNodeInput, run: Run): Outcome {
    const row = liveRow(input.nodeId);
    const changed: GraphOpDetails["update_node"]["changed"] = {};

    let title = row.title;
    if (input.title !== undefined) {
      title = input.title.trim();
      if (!title) fail("invalid_input", "A node needs a title");
      if (title !== row.title) changed.title = { from: row.title, to: title };
    }

    let confidence = row.confidence;
    if (input.confidence !== undefined) {
      confidence = checkConfidence(input.confidence);
      if (confidence !== row.confidence)
        changed.confidence = { from: row.confidence, to: confidence };
    }

    let topicId = row.topic_id;
    if (input.topicId !== undefined) {
      topicId = input.topicId === null ? null : checkTopic(row.type, row.meeting_id, input.topicId);
      if (topicId !== row.topic_id) changed.topicId = { from: row.topic_id, to: topicId };
    }

    const before = JSON.parse(row.attrs) as Record<string, unknown>;
    let attrs = before;
    if (input.attrs !== undefined) {
      attrs = parseAttrs(row.type, { ...before, ...input.attrs });
      if (JSON.stringify(attrs) !== JSON.stringify(before))
        changed.attrs = { from: before, to: attrs };
    }

    if (Object.keys(changed).length === 0) return { nodeId: row.id };
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    outranked(source, row.origin, `This ${row.type}`);
    const justification = justify(input, row.meeting_id, "evidence or rationale");
    updateNodeFields.run(title, confidence, topicId, JSON.stringify(attrs), stamp, row.id);
    record(
      row.meeting_id,
      "update_node",
      source,
      { nodeId: row.id },
      { changed, origin: adopt(row, source) },
      justification,
    );
    return { nodeId: row.id };
  }

  function changeStatus(input: SetStatusInput, run: Run): Outcome {
    const row = liveRow(input.nodeId);
    if (!isStatusOf(row.type, input.status)) {
      fail("invalid_status", `A ${row.type} has no status "${String(input.status)}"`);
    }
    if (row.status === input.status) {
      fail("invalid_transition", `The ${row.type} is already ${row.status}`);
    }
    if (!canTransition(row.type, row.status, input.status)) {
      const allowed = (NODE_TRANSITIONS[row.type] as Record<string, readonly string[]>)[row.status];
      fail(
        "invalid_transition",
        `A ${row.type} cannot go from ${row.status} to ${input.status} (allowed: ${allowed.join(", ") || "none, it is final"})`,
      );
    }
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    outranked(source, row.origin, `This ${row.type}`);
    const justification = justify(input, row.meeting_id, "evidence or rationale");
    assertPreconditions(row, input.status, justification, source);
    updateStatus.run(input.status, stamp, row.id);
    record(
      row.meeting_id,
      "set_status",
      source,
      { nodeId: row.id },
      { from: row.status, to: input.status, origin: adopt(row, source) },
      justification,
    );
    return { nodeId: row.id };
  }

  function merge(input: MergeNodesInput, run: Run): Outcome {
    const survivor = liveRow(input.survivorId);
    const loser = liveRow(input.loserId);
    if (survivor.id === loser.id) fail("merge_mismatch", "A node cannot be merged into itself");
    if (survivor.meeting_id !== loser.meeting_id) {
      fail("merge_mismatch", "Nodes of different meetings cannot be merged");
    }
    if (survivor.type !== loser.type) {
      fail("merge_mismatch", `A ${loser.type} cannot be merged into a ${survivor.type}`);
    }
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    outranked(source, survivor.origin, `This ${survivor.type}`);
    outranked(source, loser.origin, `This ${loser.type}`);
    const justification = justify(input, survivor.meeting_id, "evidence or rationale");
    const at = stamp;

    const people = (peopleOf.all(loser.id) as PersonRow[]).map(toPerson);
    for (const person of people) {
      const key = speakerKey(person);
      insertPerson.run(survivor.id, key, person.role, at);
      deletePerson.run(loser.id, key, person.role);
    }
    const adoptedTopic = survivor.topic_id === null ? loser.topic_id : null;
    if (adoptedTopic) {
      updateNodeFields.run(
        survivor.title,
        survivor.confidence,
        adoptedTopic,
        survivor.attrs,
        at,
        survivor.id,
      );
    }
    const childrenMoved = (childrenOf.all(loser.id) as { id: string }[]).map((child) => child.id);
    moveChildren.run(survivor.id, loser.id);

    const edges: GraphOpDetails["merge_nodes"]["edges"] = [];
    for (const edge of liveEdgesTouching.all(loser.id, loser.id) as EdgeRow[]) {
      const src = edge.src_id === loser.id ? survivor.id : edge.src_id;
      const dst = edge.dst_id === loser.id ? survivor.id : edge.dst_id;
      if (src === dst) {
        softDeleteEdge.run(at, edge.id);
        edges.push({ edgeId: edge.id, action: "dropped" });
        continue;
      }
      const oriented = orientEdge(edge.type, src, dst);
      const twin = findLiveEdge.get(oriented.srcId, oriented.dstId, edge.type, edge.id) as
        | EdgeRow
        | undefined;
      if (twin) {
        const stronger = originRank(edge.origin) > originRank(twin.origin);
        if (stronger) setEdgeOrigin.run(edge.origin, twin.id);
        foldEdge.run(at, twin.id, edge.id);
        repointFolded.run(twin.id, edge.id);
        edges.push({
          edgeId: edge.id,
          action: "folded",
          into: twin.id,
          origin: stronger ? { from: twin.origin, to: edge.origin } : undefined,
        });
      } else {
        moveEdge.run(oriented.srcId, oriented.dstId, edge.id);
        edges.push({
          edgeId: edge.id,
          action: "moved",
          srcId: oriented.srcId,
          dstId: oriented.dstId,
        });
      }
    }

    let origin = survivor.origin;
    if (originRank(loser.origin) > originRank(origin)) origin = loser.origin;
    if (source === "human") origin = "human";
    const originChange =
      origin === survivor.origin ? undefined : { from: survivor.origin, to: origin };
    if (originChange) setNodeOrigin.run(origin, survivor.id);

    repointMerged.run(survivor.id, loser.id);
    setMergedInto.run(survivor.id, at, loser.id);
    touchNode.run(at, survivor.id);
    record(
      survivor.meeting_id,
      "merge_nodes",
      source,
      { nodeId: survivor.id },
      {
        merged: loser.id,
        title: loser.title,
        people,
        adoptedTopic,
        childrenMoved,
        edges,
        origin: originChange,
      },
      justification,
    );
    return { nodeId: survivor.id };
  }

  function remove(input: DeleteNodeInput, run: Run): Outcome {
    const row = liveRow(input.nodeId);
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    outranked(source, row.origin, `This ${row.type}`);
    const justification = justify(input, row.meeting_id, "evidence or rationale");
    const at = stamp;
    const edges = (liveEdgesTouching.all(row.id, row.id) as EdgeRow[]).map((edge) => edge.id);
    const ungrouped = (childrenOf.all(row.id) as { id: string }[]).map((child) => child.id);
    softDeleteNode.run(at, at, row.id);
    for (const id of edges) softDeleteEdge.run(at, id);
    ungroupChildren.run(row.id);
    record(
      row.meeting_id,
      "delete_node",
      source,
      { nodeId: row.id },
      { title: row.title, edges, ungrouped, origin: adopt(row, source) },
      justification,
    );
    return { nodeId: row.id };
  }

  function connect(input: AddEdgeInput, run: Run): Outcome {
    if (!isEdgeType(input.type)) fail("invalid_edge", `Unknown edge type "${String(input.type)}"`);
    const type = input.type;
    const from = liveRow(input.srcId);
    const to = liveRow(input.dstId);
    if (from.id === to.id) fail("invalid_edge", "An edge cannot join a node to itself");
    if (from.meeting_id !== to.meeting_id) fail("invalid_edge", "Nodes of different meetings");
    if (!edgeAllowed(type, from.type, to.type)) {
      fail("invalid_edge", `${type} cannot join a ${from.type} to a ${to.type}`);
    }

    const source = input.source ?? run.source;
    const justification = justify(
      input,
      from.meeting_id,
      source === "human" ? "evidence or rationale" : "evidence",
    );
    checkSource(source, justification.rationale);
    const confidence = checkConfidence(input.confidence ?? 1);
    const { srcId, dstId } = orientEdge(type, from.id, to.id);

    const existing = findLiveEdge.get(srcId, dstId, type, "") as EdgeRow | undefined;
    if (existing) {
      const stronger = originRank(source) > originRank(existing.origin);
      if (stronger) setEdgeOrigin.run(source, existing.id);
      record(
        existing.meeting_id,
        "add_edge",
        source,
        { edgeId: existing.id },
        {
          type,
          srcId,
          dstId,
          origin: stronger ? source : existing.origin,
          confidence: existing.confidence,
          rationale: existing.rationale,
          corroborated: true,
          upgraded: stronger ? { from: existing.origin, to: source } : undefined,
        },
        justification,
      );
      return { edgeId: existing.id };
    }

    const id = randomUUID();
    const rationale = source === "inferred" ? justification.rationale : null;
    insertEdge.run(
      id,
      from.meeting_id,
      srcId,
      dstId,
      type,
      EDGE_RULES[type].family,
      source,
      confidence,
      rationale,
      stamp,
    );
    record(
      from.meeting_id,
      "add_edge",
      source,
      { edgeId: id },
      { type, srcId, dstId, origin: source, confidence, rationale },
      justification,
    );
    return { edgeId: id };
  }

  function disconnect(input: DeleteEdgeInput, run: Run): Outcome {
    const row = selectEdge.get(input.edgeId) as EdgeRow | undefined;
    if (!row || row.deleted_at !== null) fail("not_found", `No such edge: ${input.edgeId}`);
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    outranked(source, row.origin, `This ${row.type} edge`);
    const justification = justify(input, row.meeting_id, "evidence or rationale");
    softDeleteEdge.run(stamp, row.id);
    record(
      row.meeting_id,
      "delete_edge",
      source,
      { edgeId: row.id },
      { type: row.type },
      justification,
    );
    return { edgeId: row.id };
  }

  function link(input: PersonLinkInput, run: Run): Outcome {
    const row = liveRow(input.nodeId);
    const role = checkRole(row.type, input.role);
    const key = participant(row.meeting_id, input.person);
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    const justification = justify(input, row.meeting_id, "evidence or rationale");
    const at = stamp;
    const { changes } = insertPerson.run(row.id, key, role, at);
    if (changes > 0) {
      touchNode.run(at, row.id);
      record(
        row.meeting_id,
        "link_person",
        source,
        { nodeId: row.id },
        { person: personOf(key, role), origin: adopt(row, source) },
        justification,
      );
    }
    return { nodeId: row.id };
  }

  function unlink(input: PersonLinkInput, run: Run): Outcome {
    const row = liveRow(input.nodeId);
    const role = checkRole(row.type, input.role);
    const key = speakerKey(input.person);
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    outranked(source, row.origin, `This ${row.type}`);
    const justification = justify(input, row.meeting_id, "evidence or rationale");
    const owners = (roleCount.get(row.id, "owner") as { n: number }).n;
    if (role === "owner" && row.type === "action" && row.status === "committed" && owners <= 1) {
      fail(
        "precondition_failed",
        "A committed action needs an owner; mark it orphaned before taking the owner off",
      );
    }
    const person = personOf(key, role);
    const at = stamp;
    const { changes } = deletePerson.run(row.id, key, role);
    if (changes > 0) {
      touchNode.run(at, row.id);
      record(
        row.meeting_id,
        "unlink_person",
        source,
        { nodeId: row.id },
        { person, origin: adopt(row, source) },
        justification,
      );
    }
    return { nodeId: row.id };
  }

  function addEvidence(input: AddEvidenceInput, run: Run): Outcome {
    if ((input.nodeId === undefined) === (input.edgeId === undefined)) {
      fail("invalid_input", "Give the node or the edge to add evidence to, not both");
    }
    const source = input.source ?? run.source;
    checkSource(source, input.rationale?.trim() || null);
    if (input.nodeId !== undefined) {
      const row = liveRow(input.nodeId);
      record(
        row.meeting_id,
        "add_evidence",
        source,
        { nodeId: row.id },
        {},
        justify(input, row.meeting_id, "evidence"),
      );
      return { nodeId: row.id };
    }
    const row = selectEdge.get(input.edgeId!) as EdgeRow | undefined;
    if (!row || row.deleted_at !== null) fail("not_found", `No such edge: ${input.edgeId}`);
    record(
      row.meeting_id,
      "add_evidence",
      source,
      { edgeId: row.id },
      {},
      justify(input, row.meeting_id, "evidence"),
    );
    return { edgeId: row.id };
  }

  // ---- commands ----

  const resolveId = (id: string, run: Run): string =>
    id.startsWith("$") ? (run.refs.get(id) ?? fail("not_found", `Nothing was named ${id}`)) : id;
  const resolveOptional = <T extends string | null | undefined>(id: T, run: Run) =>
    typeof id === "string" ? resolveId(id, run) : id;

  function execute(command: GraphCommand, run: Run): Outcome {
    stamp = Date.now();
    switch (command.kind) {
      case "create_node": {
        const { input } = command;
        const outcome = create(
          { ...input, topicId: resolveOptional(input.topicId, run) ?? undefined },
          run,
        );
        if (command.ref && outcome.nodeId) {
          if (!command.ref.startsWith("$")) fail("invalid_input", "A ref is written $name");
          run.refs.set(command.ref, outcome.nodeId);
        }
        return outcome;
      }
      case "update_node": {
        const { input } = command;
        return update(
          {
            ...input,
            nodeId: resolveId(input.nodeId, run),
            topicId: resolveOptional(input.topicId, run),
          },
          run,
        );
      }
      case "set_status":
        return changeStatus(
          { ...command.input, nodeId: resolveId(command.input.nodeId, run) },
          run,
        );
      case "merge_nodes":
        return merge(
          {
            ...command.input,
            survivorId: resolveId(command.input.survivorId, run),
            loserId: resolveId(command.input.loserId, run),
          },
          run,
        );
      case "delete_node":
        return remove({ ...command.input, nodeId: resolveId(command.input.nodeId, run) }, run);
      case "add_edge":
        return connect(
          {
            ...command.input,
            srcId: resolveId(command.input.srcId, run),
            dstId: resolveId(command.input.dstId, run),
          },
          run,
        );
      case "delete_edge":
        return disconnect(command.input, run);
      case "link_person":
        return link({ ...command.input, nodeId: resolveId(command.input.nodeId, run) }, run);
      case "unlink_person":
        return unlink({ ...command.input, nodeId: resolveId(command.input.nodeId, run) }, run);
      case "add_evidence":
        return addEvidence(
          { ...command.input, nodeId: resolveOptional(command.input.nodeId, run) },
          run,
        );
    }
  }

  function single<T>(command: GraphCommand, pick: (outcome: Outcome) => T): T {
    return transaction(() => pick(execute(command, { source: "stated", refs: new Map() })));
  }

  function opsOf(rows: OpRow[]): GraphOp[] {
    return rows.map(
      (row) =>
        ({
          id: row.id,
          kind: row.kind,
          source: row.source,
          nodeId: row.node_id,
          edgeId: row.edge_id,
          detail: JSON.parse(row.detail),
          rationale: row.rationale,
          createdAt: row.created_at,
          evidence: (
            evidenceOfOp.all(row.id) as {
              quote: string;
              session_id: number;
              source_id: string;
              speaker_id: string;
              speaker: string;
              updated_at: number;
            }[]
          ).map((item): Evidence => ({
            sessionId: item.session_id,
            captionId: item.source_id,
            quote: item.quote,
            speakerId: item.speaker_id.startsWith("name:") ? "" : item.speaker_id,
            speaker: item.speaker,
            at: item.updated_at,
          })),
        }) as GraphOp,
    );
  }

  return {
    async createNode(input) {
      return single({ kind: "create_node", input: input as CreateNodeInput }, (o) =>
        nodeById(o.nodeId!),
      );
    },
    async updateNode(input) {
      return single({ kind: "update_node", input }, (o) => nodeById(o.nodeId!));
    },
    async setStatus(input) {
      return single({ kind: "set_status", input }, (o) => nodeById(o.nodeId!));
    },
    async mergeNodes(input) {
      return single({ kind: "merge_nodes", input }, (o) => nodeById(o.nodeId!));
    },
    async deleteNode(input) {
      single({ kind: "delete_node", input }, () => undefined);
    },
    async addEdge(input) {
      return single({ kind: "add_edge", input }, (o) => edgeById(o.edgeId!));
    },
    async deleteEdge(input) {
      single({ kind: "delete_edge", input }, () => undefined);
    },
    async linkPerson(input) {
      return single({ kind: "link_person", input }, (o) => nodeById(o.nodeId!));
    },
    async unlinkPerson(input) {
      return single({ kind: "unlink_person", input }, (o) => nodeById(o.nodeId!));
    },
    async addEvidence(input) {
      single({ kind: "add_evidence", input }, () => undefined);
    },

    async apply(commands, defaults) {
      return transaction(() => {
        const run: Run = { source: defaults?.source ?? "stated", refs: new Map() };
        const results: CommandResult[] = [];
        for (const command of commands) {
          db.exec("SAVEPOINT command");
          try {
            const outcome = execute(command, run);
            db.exec("RELEASE command");
            results.push({ ok: true, ...outcome, opId: lastOpId });
          } catch (error) {
            db.exec("ROLLBACK TO command");
            db.exec("RELEASE command");
            if (!(error instanceof GraphRuleError)) throw error;
            results.push({ ok: false, code: error.code, message: error.message });
          }
        }
        return results;
      });
    },

    async getNode(id) {
      const row = selectNode.get(id) as NodeRow | undefined;
      const live = row?.merged_into ? (selectNode.get(row.merged_into) as NodeRow) : row;
      return live && live.deleted_at === null ? toNode(live) : undefined;
    },

    async getGraph(meetingId): Promise<MeetingGraph> {
      const people = new Map<string, PersonRow[]>();
      for (const row of peopleOfMeeting.all(meetingId) as (PersonRow & { node_id: string })[]) {
        people.set(row.node_id, [...(people.get(row.node_id) ?? []), row]);
      }
      return {
        meetingId,
        nodes: (liveNodes.all(meetingId) as NodeRow[]).map((row) =>
          toNode(row, people.get(row.id) ?? []),
        ),
        edges: (meetingEdges.all(meetingId) as EdgeRow[]).map(toEdge),
      };
    },

    async asOf(meetingId, cut): Promise<MeetingGraph> {
      const last =
        "opId" in cut ? cut.opId : (lastOpAt.get(meetingId, cut.at) as { id: number }).id;
      const ops = (opsUpTo.all(meetingId, last) as OpRow[]).map(
        (row) =>
          ({
            id: row.id,
            kind: row.kind,
            source: row.source,
            nodeId: row.node_id,
            edgeId: row.edge_id,
            detail: JSON.parse(row.detail),
            rationale: row.rationale,
            createdAt: row.created_at,
          }) as ReplayOp,
      );
      return replayGraph(meetingId, ops);
    },

    async edgesOf(nodeId, filter) {
      return edgesTouching(liveRow(nodeId).id).filter(
        (edge) =>
          (!filter?.types || filter.types.includes(edge.type)) &&
          (!filter?.family || filter.family === edge.family),
      );
    },

    async history(subject) {
      if ("edgeId" in subject) {
        const row = selectEdge.get(subject.edgeId) as EdgeRow | undefined;
        if (!row) fail("not_found", `No such edge: ${subject.edgeId}`);
        const id = row.folded_into ?? row.id;
        return opsOf(opsOfEdge.all(id, id) as OpRow[]);
      }
      const row = selectNode.get(subject.nodeId) as NodeRow | undefined;
      if (!row) fail("not_found", `No such node: ${subject.nodeId}`);
      const id = row.merged_into ?? row.id;
      return opsOf(opsOfNode.all(id, id) as OpRow[]);
    },

    async pruneUnsupported(meetingId) {
      return transaction(() => {
        pruneEdges.run(meetingId);
        return Number(pruneNodes.run(meetingId).changes);
      });
    },

    async clearGraph(meetingId) {
      return transaction(() => {
        const live = (countLiveNodes.get(meetingId) as { n: number }).n;
        clearOps.run(meetingId);
        clearNodes.run(meetingId);
        return live;
      });
    },
  };
}
