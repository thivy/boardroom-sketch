import {
  GraphRuleError,
  isOrigin,
  mayOverwrite,
  type EdgeFamily,
  type EdgeType,
  type GraphEdge,
  type GraphErrorCode,
  type GraphOpKind,
  type NodePerson,
  type NodeType,
  type Origin,
  type PersonRole,
} from "@app/contracts";

export type NodeRow = {
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

export type EdgeRow = {
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

export type PersonRow = { speaker_id: string; speaker: string; role: PersonRole };

export type OpRow = {
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
export type Justification = {
  evidence: { captionId: number; quote: string }[];
  rationale: string | null;
};

export type Outcome = { nodeId?: string; edgeId?: string };

/** The settings a run of commands shares: who is changing the graph, and the names they gave nodes. */
export type Run = { source: Origin; refs: Map<string, string> };

export function fail(code: GraphErrorCode, message: string): never {
  throw new GraphRuleError(code, message);
}

export const toPerson = (row: PersonRow): NodePerson => ({
  speakerId: row.speaker_id.startsWith("name:") ? "" : row.speaker_id,
  speaker: row.speaker,
  role: row.role,
});

export const toEdge = (row: EdgeRow): GraphEdge => ({
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

export const checkConfidence = (value: number) => {
  if (typeof value !== "number" || !(value >= 0 && value <= 1)) {
    fail("invalid_input", "Confidence must be a number from 0 to 1");
  }
  return value;
};

export const checkSource = (value: unknown, rationale: string | null): Origin => {
  if (!isOrigin(value)) fail("invalid_input", `Unknown source "${String(value)}"`);
  if (value === "inferred" && !rationale) {
    fail("missing_rationale", "Something inferred needs a rationale that says why");
  }
  return value;
};

export const outranked = (source: Origin, target: Origin, what: string) => {
  if (!mayOverwrite(source, target)) {
    fail(
      "outranked",
      `${what} is ${target}, and a change that is only ${source} cannot overwrite it`,
    );
  }
};
