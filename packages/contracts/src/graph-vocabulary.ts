/**
 * The meeting graph's vocabulary and the rules that follow from it: which statuses a node can have,
 * which status changes are allowed, which edges may join which nodes. It is plain data plus pure
 * functions, so every adapter enforces the same rules. `docs/graph-model.md` explains each choice.
 */

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export type GraphErrorCode =
  | "not_found"
  | "invalid_input"
  | "invalid_status"
  | "invalid_transition"
  | "precondition_failed"
  | "invalid_edge"
  | "invalid_role"
  | "invalid_attrs"
  | "missing_evidence"
  | "missing_rationale"
  | "unknown_caption"
  | "unknown_person"
  | "merge_mismatch";

/** A change the graph's rules refuse. Everything else thrown is a bug or an I/O failure. */
export class GraphRuleError extends Error {
  readonly code: GraphErrorCode;

  constructor(code: GraphErrorCode, message: string) {
    super(message);
    this.name = "GraphRuleError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------------------------

/** The statuses of each node type. The first one is the type's default when a node is created. */
export const NODE_STATUSES = {
  topic: ["active", "parked", "closed"],
  proposal: ["proposed", "challenged", "adopted", "rejected", "withdrawn"],
  decision: ["tentative", "decided", "challenged", "reversed", "superseded", "confirmed"],
  action: ["intent", "requested", "committed", "done", "dropped", "orphaned"],
  question: ["open", "answered", "deferred", "dropped"],
  risk: ["raised", "mitigating", "accepted", "escalated", "closed"],
  claim: ["assumed", "asserted", "contested", "confirmed", "retracted"],
  constraint: ["stated", "confirmed", "lifted"],
  entity: ["mentioned"],
} as const;

export type NodeType = keyof typeof NODE_STATUSES;
export type StatusOf<T extends NodeType> = (typeof NODE_STATUSES)[T][number];
export type NodeStatus = StatusOf<NodeType>;

export const NODE_TYPES = Object.keys(NODE_STATUSES) as NodeType[];

export const isNodeType = (value: unknown): value is NodeType =>
  typeof value === "string" && value in NODE_STATUSES;

export const isStatusOf = <T extends NodeType>(type: T, value: unknown): value is StatusOf<T> =>
  (NODE_STATUSES[type] as readonly unknown[]).includes(value);

/**
 * The statuses a node may be created with. Anything further along has to be reached with a
 * status change, so that the change carries its own evidence.
 */
export const INITIAL_STATUSES: { [T in NodeType]: readonly StatusOf<T>[] } = {
  topic: ["active"],
  proposal: ["proposed"],
  decision: ["tentative", "decided"],
  action: ["intent", "requested", "committed"],
  question: ["open"],
  risk: ["raised"],
  claim: ["assumed", "asserted"],
  constraint: ["stated"],
  entity: ["mentioned"],
};

/** From each status, the statuses a node may move to. Statuses with no way out are final. */
export const NODE_TRANSITIONS: {
  [T in NodeType]: { [S in StatusOf<T>]: readonly StatusOf<T>[] };
} = {
  topic: {
    active: ["parked", "closed"],
    parked: ["active", "closed"],
    closed: ["active"],
  },
  proposal: {
    proposed: ["challenged", "adopted", "rejected", "withdrawn"],
    challenged: ["proposed", "adopted", "rejected", "withdrawn"],
    adopted: [],
    rejected: ["proposed"],
    withdrawn: ["proposed"],
  },
  decision: {
    tentative: ["decided", "challenged", "reversed"],
    decided: ["challenged", "reversed", "superseded", "confirmed"],
    challenged: ["tentative", "decided", "reversed", "superseded"],
    reversed: ["tentative", "decided"],
    superseded: [],
    confirmed: ["challenged", "reversed", "superseded"],
  },
  action: {
    intent: ["requested", "committed", "dropped"],
    requested: ["committed", "dropped"],
    committed: ["done", "dropped", "orphaned"],
    done: ["committed"],
    dropped: [],
    orphaned: ["requested", "committed", "dropped"],
  },
  question: {
    open: ["answered", "deferred", "dropped"],
    answered: ["open"],
    deferred: ["open", "answered", "dropped"],
    dropped: [],
  },
  risk: {
    raised: ["mitigating", "accepted", "escalated", "closed"],
    mitigating: ["raised", "accepted", "escalated", "closed"],
    accepted: ["escalated", "closed"],
    escalated: ["mitigating", "accepted", "closed"],
    closed: ["raised"],
  },
  claim: {
    assumed: ["asserted", "contested", "confirmed", "retracted"],
    asserted: ["contested", "confirmed", "retracted"],
    contested: ["asserted", "confirmed", "retracted"],
    confirmed: ["contested", "retracted"],
    retracted: [],
  },
  constraint: {
    stated: ["confirmed", "lifted"],
    confirmed: ["lifted"],
    lifted: ["stated"],
  },
  entity: {
    mentioned: [],
  },
};

export const canTransition = (type: NodeType, from: string, to: string): boolean =>
  (NODE_TRANSITIONS[type] as Record<string, readonly string[]>)[from]?.includes(to) ?? false;

// ---------------------------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------------------------

export const EDGE_FAMILIES = ["build", "oppose", "revise", "plan", "struct"] as const;
export type EdgeFamily = (typeof EDGE_FAMILIES)[number];

export type EdgeRule = {
  family: EdgeFamily;
  /** Stored once, with the lexically smaller node id as `src`; queries read it both ways. */
  symmetric: boolean;
  /** Node types the edge may start from. */
  from: readonly NodeType[];
  /** Node types the edge may end at. A symmetric edge has the same `from` and `to`. */
  to: readonly NodeType[];
  /** Both ends must be the same type (a decision supersedes a decision, not a claim). */
  sameType?: boolean;
};

const CONTENT: readonly NodeType[] = [
  "proposal",
  "decision",
  "action",
  "question",
  "risk",
  "claim",
  "constraint",
];
const POSITION: readonly NodeType[] = ["proposal", "decision", "claim"];
const NOT_TOPIC = NODE_TYPES.filter((type) => type !== "topic");

export const EDGE_RULES = {
  // build: how things lead to other things
  supports: {
    family: "build",
    symmetric: false,
    from: ["proposal", "decision", "claim", "risk", "constraint"],
    to: ["proposal", "decision", "claim", "action"],
  },
  leads_to: { family: "build", symmetric: false, from: CONTENT, to: CONTENT },
  answers: {
    family: "build",
    symmetric: false,
    from: ["proposal", "decision", "claim"],
    to: ["question"],
  },
  resolves: {
    family: "build",
    symmetric: false,
    from: ["decision", "action"],
    to: ["question", "risk", "constraint"],
  },
  mitigates: {
    family: "build",
    symmetric: false,
    from: ["proposal", "decision", "action", "constraint"],
    to: ["risk"],
  },
  addresses: {
    family: "build",
    symmetric: false,
    from: ["proposal", "decision", "action"],
    to: ["question", "risk", "constraint"],
  },
  creates: {
    family: "build",
    symmetric: false,
    from: ["proposal", "decision"],
    to: ["action", "risk", "constraint", "question"],
  },
  combines_with: {
    family: "build",
    symmetric: true,
    from: ["proposal"],
    to: ["proposal"],
    sameType: true,
  },
  // oppose: how things push against each other
  challenges: {
    family: "oppose",
    symmetric: false,
    from: ["proposal", "claim", "risk", "constraint", "question"],
    to: ["proposal", "decision", "claim", "action"],
  },
  blocks: {
    family: "oppose",
    symmetric: false,
    from: ["decision", "action", "claim", "risk", "constraint"],
    to: ["proposal", "decision", "action"],
  },
  contradicts: {
    family: "oppose",
    symmetric: true,
    from: ["claim"],
    to: ["claim"],
    sameType: true,
  },
  conflicts_with: {
    family: "oppose",
    symmetric: true,
    from: POSITION,
    to: POSITION,
  },
  // revise: how a later statement replaces an earlier one
  supersedes: {
    family: "revise",
    symmetric: false,
    from: ["proposal", "decision"],
    to: ["proposal", "decision"],
    sameType: true,
  },
  corrects: {
    family: "revise",
    symmetric: false,
    from: ["claim", "action"],
    to: ["claim", "action"],
    sameType: true,
  },
  // plan: what has to hold or happen first
  depends_on: {
    family: "plan",
    symmetric: false,
    from: ["proposal", "decision", "action"],
    to: ["decision", "action", "question", "constraint"],
  },
  relies_on: {
    family: "plan",
    symmetric: false,
    from: ["proposal", "decision", "action"],
    to: ["claim", "constraint", "entity"],
  },
  // struct: how nodes are organised
  about: { family: "struct", symmetric: false, from: NOT_TOPIC, to: ["topic"] },
  alternative_to: {
    family: "struct",
    symmetric: true,
    from: ["proposal"],
    to: ["proposal"],
    sameType: true,
  },
  refers_to: {
    family: "struct",
    symmetric: false,
    from: NOT_TOPIC.filter((type) => type !== "entity"),
    to: ["entity"],
  },
} as const satisfies Record<string, EdgeRule>;

export type EdgeType = keyof typeof EDGE_RULES;
export const EDGE_TYPES = Object.keys(EDGE_RULES) as EdgeType[];
export const SYMMETRIC_EDGE_TYPES = EDGE_TYPES.filter((type) => EDGE_RULES[type].symmetric);

export const isEdgeType = (value: unknown): value is EdgeType =>
  typeof value === "string" && value in EDGE_RULES;

/** A symmetric edge is stored with the smaller id first, so one edge is never stored twice. */
export function orientEdge(type: EdgeType, srcId: string, dstId: string) {
  return EDGE_RULES[type].symmetric && srcId > dstId
    ? { srcId: dstId, dstId: srcId }
    : { srcId, dstId };
}

/** Whether `type` may join a node of type `src` to one of type `dst` (either way round if symmetric). */
export function edgeAllowed(type: EdgeType, src: NodeType, dst: NodeType): boolean {
  const rule: EdgeRule = EDGE_RULES[type];
  if (rule.sameType && src !== dst) return false;
  const forward = rule.from.includes(src) && rule.to.includes(dst);
  return forward || (rule.symmetric && rule.from.includes(dst) && rule.to.includes(src));
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

/** The node types each role can be attached to. People are participants, never nodes. */
export const PERSON_ROLES = {
  proposed_by: ["proposal"],
  decided_by: ["decision"],
  owner: ["action", "risk"],
  challenged_by: ["proposal", "decision", "claim", "action", "constraint"],
  asked_by: ["question"],
  answered_by: ["question"],
  raised_by: ["risk", "claim", "constraint", "topic"],
  mentioned: NODE_TYPES,
} as const satisfies Record<string, readonly NodeType[]>;

export type PersonRole = keyof typeof PERSON_ROLES;
export const PERSON_ROLE_NAMES = Object.keys(PERSON_ROLES) as PersonRole[];

export const isPersonRole = (value: unknown): value is PersonRole =>
  typeof value === "string" && value in PERSON_ROLES;

export const roleAllowed = (role: PersonRole, type: NodeType): boolean =>
  (PERSON_ROLES[role] as readonly NodeType[]).includes(type);

// ---------------------------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------------------------

/** `stated`: somebody said it. `inferred`: the system concluded it, and must say why. */
export const ORIGINS = ["stated", "inferred"] as const;
export type Origin = (typeof ORIGINS)[number];

export const isOrigin = (value: unknown): value is Origin =>
  typeof value === "string" && (ORIGINS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------------------------
// Status preconditions
// ---------------------------------------------------------------------------------------------

/**
 * What must already hold before a node moves to a status. Several statuses only restate something
 * the graph can already show (a question is `answered` once something answers it), so they are
 * refused unless that something exists. This keeps status and edges from disagreeing.
 */
export type StatusPrecondition =
  /** The change must carry a transcript quote. */
  | { kind: "evidence" }
  /** The node must have an `owner`. */
  | { kind: "owner" }
  /** An edge of one of these types must touch the node (pointing at it, unless the edge is symmetric), or the node has the role. */
  | { kind: "edge"; types: readonly EdgeType[]; orRole?: PersonRole };

export const STATUS_PRECONDITIONS: {
  [T in NodeType]?: { [S in StatusOf<T>]?: StatusPrecondition };
} = {
  proposal: { challenged: { kind: "edge", types: ["challenges"], orRole: "challenged_by" } },
  decision: {
    decided: { kind: "evidence" },
    confirmed: { kind: "evidence" },
    challenged: { kind: "edge", types: ["challenges"], orRole: "challenged_by" },
    superseded: { kind: "edge", types: ["supersedes"] },
  },
  action: { committed: { kind: "owner" } },
  question: { answered: { kind: "edge", types: ["answers"], orRole: "answered_by" } },
  risk: { mitigating: { kind: "edge", types: ["mitigates"] } },
  claim: {
    contested: {
      kind: "edge",
      types: ["challenges", "contradicts", "conflicts_with"],
      orRole: "challenged_by",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Type-specific attributes
// ---------------------------------------------------------------------------------------------

export const ENTITY_KINDS = ["system", "vendor", "artefact"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type NoAttrs = Record<string, never>;
export type ActionAttrs = {
  /** When it is due, as a time the extractor resolved. */
  dueAt?: number;
  /** When it is due, as it was said ("by Friday", "before launch"). */
  dueText?: string;
};
export type EntityAttrs = { kind?: EntityKind };

export type AttrsOf = {
  topic: NoAttrs;
  proposal: NoAttrs;
  decision: NoAttrs;
  action: ActionAttrs;
  question: NoAttrs;
  risk: NoAttrs;
  claim: NoAttrs;
  constraint: NoAttrs;
  entity: EntityAttrs;
};

/** Checks type-specific attributes, dropping nothing: unknown keys are an error, not ignored. */
export function parseAttrs<T extends NodeType>(type: T, value: unknown): AttrsOf[T] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GraphRuleError("invalid_attrs", "Attributes must be an object");
  }
  const attrs = value as Record<string, unknown>;
  const allowed: Record<string, (v: unknown) => boolean> =
    type === "action"
      ? {
          dueAt: (v) => typeof v === "number" && Number.isFinite(v),
          dueText: (v) => typeof v === "string" && v.trim() !== "",
        }
      : type === "entity"
        ? { kind: (v) => (ENTITY_KINDS as readonly unknown[]).includes(v) }
        : {};
  for (const [key, item] of Object.entries(attrs)) {
    if (item === undefined) continue;
    if (!allowed[key]?.(item)) {
      throw new GraphRuleError("invalid_attrs", `${type} nodes have no valid attribute "${key}"`);
    }
  }
  return Object.fromEntries(
    Object.entries(attrs).filter(([, item]) => item !== undefined),
  ) as AttrsOf[T];
}
