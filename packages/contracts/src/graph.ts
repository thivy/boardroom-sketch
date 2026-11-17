import type {
  AttrsOf,
  EdgeFamily,
  EdgeType,
  GraphErrorCode,
  NodeStatus,
  NodeType,
  Origin,
  PersonRole,
  StatusOf,
} from "./graph-vocabulary";

/** A participant, identified the way captions identify speakers (a name-only speaker has no `speakerId`). */
export type PersonRef = { speakerId: string; speaker: string };

/** A person's link to a node. */
export type NodePerson = PersonRef & { role: PersonRole };

type NodeBase = {
  id: string;
  meetingId: string;
  title: string;
  /** The topic the node sits under, if any. */
  topicId: string | null;
  /** Who this node's content comes from; a person's edit makes it `human`. */
  origin: Origin;
  /** 0 to 1. */
  confidence: number;
  people: NodePerson[];
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
};

/** A node, narrowed by `type`: its `status` and `attrs` are the ones that type allows. */
export type GraphNode = {
  [T in NodeType]: NodeBase & { type: T; status: StatusOf<T>; attrs: AttrsOf[T] };
}[NodeType];

export type GraphEdge = {
  id: string;
  meetingId: string;
  type: EdgeType;
  family: EdgeFamily;
  /** For a symmetric edge, the lexically smaller node id. */
  srcId: string;
  dstId: string;
  origin: Origin;
  confidence: number;
  /** Why the system inferred it; always present when `origin` is `inferred`. */
  rationale: string | null;
  createdAt: number;
};

/** An edge as seen from one of its nodes. Symmetric edges are `both`, whichever end is asked about. */
export type NodeEdge = GraphEdge & {
  direction: "out" | "in" | "both";
  /** The node at the other end. */
  otherId: string;
};

export type MeetingGraph = {
  meetingId: string;
  /** Live nodes only: not deleted, not merged into another. */
  nodes: GraphNode[];
  /** Live edges between live nodes. */
  edges: GraphEdge[];
};

/** A passage of a recorded transcript. */
export type EvidenceInput = {
  sessionId: number;
  /** The caption's `id` within that session. */
  captionId: string;
  /** The words that justify the change, as said. */
  quote: string;
};

export type Evidence = EvidenceInput & PersonRef & { at: number };

/**
 * Why a change is being made, and by whom. Creating a node or edge always needs `evidence`; any other
 * change needs `evidence` or, for something the system worked out itself, a `rationale`.
 */
export type Change = {
  evidence?: EvidenceInput[];
  rationale?: string;
  /** Who is making the change (default `stated`). It limits what the change may overwrite. */
  source?: Origin;
};

export type CreateNodeInput<T extends NodeType = NodeType> = {
  meetingId: string;
  type: T;
  title: string;
  /** One of the type's initial statuses; defaults to the first (see `INITIAL_STATUSES`). */
  status?: StatusOf<T>;
  topicId?: string;
  confidence?: number;
  attrs?: AttrsOf[T];
  people?: { person: PersonRef; role: PersonRole }[];
  evidence: EvidenceInput[];
  rationale?: string;
  /** The node's origin: who this change is from (default `stated`). */
  source?: Origin;
};

export type UpdateNodeInput = Change & {
  nodeId: string;
  title?: string;
  confidence?: number;
  /** `null` takes the node out of its topic. */
  topicId?: string | null;
  /** Merged into the node's existing attributes. */
  attrs?: Record<string, unknown>;
};

export type SetStatusInput = Change & { nodeId: string; status: NodeStatus };

export type MergeNodesInput = Change & {
  /** The node that stays. */
  survivorId: string;
  /** The node that is folded into it. It keeps resolving to the survivor afterwards. */
  loserId: string;
};

export type DeleteNodeInput = Change & { nodeId: string };

export type AddEdgeInput = {
  type: EdgeType;
  srcId: string;
  dstId: string;
  confidence?: number;
  evidence: EvidenceInput[];
  /** Required when `source` is `inferred`. */
  rationale?: string;
  /** The edge's origin: who this change is from (default `stated`). */
  source?: Origin;
};

export type DeleteEdgeInput = Change & { edgeId: string };

export type PersonLinkInput = Change & { nodeId: string; person: PersonRef; role: PersonRole };

/** More evidence for a node or an edge (exactly one of the two ids). */
export type AddEvidenceInput = Change & {
  nodeId?: string;
  edgeId?: string;
  evidence: EvidenceInput[];
};

export type GraphOpKind =
  | "create_node"
  | "update_node"
  | "set_status"
  | "merge_nodes"
  | "delete_node"
  | "add_edge"
  | "delete_edge"
  | "link_person"
  | "unlink_person"
  | "add_evidence";

/** An origin that changed as part of an op (a person's edit makes a node `human`). */
export type OriginChange = { from: Origin; to: Origin };

/** What each op recorded, complete enough for `replayGraph` to rebuild the graph from the log alone. */
export type GraphOpDetails = {
  create_node: {
    type: NodeType;
    status: string;
    title: string;
    topicId: string | null;
    origin: Origin;
    confidence: number;
    attrs: Record<string, unknown>;
    people: NodePerson[];
  };
  update_node: {
    changed: {
      title?: { from: string; to: string };
      confidence?: { from: number; to: number };
      topicId?: { from: string | null; to: string | null };
      attrs?: { from: Record<string, unknown>; to: Record<string, unknown> };
    };
    origin?: OriginChange;
  };
  set_status: { from: string; to: string; origin?: OriginChange };
  merge_nodes: {
    /** The node folded into `nodeId`. */
    merged: string;
    title: string;
    /** The loser's people, now the survivor's. */
    people: NodePerson[];
    /** The loser's topic, when the survivor had none. */
    adoptedTopic: string | null;
    /** Nodes that sat under the loser (a topic) and now sit under the survivor. */
    childrenMoved: string[];
    edges: (
      | { edgeId: string; action: "moved"; srcId: string; dstId: string }
      | { edgeId: string; action: "dropped" }
      | { edgeId: string; action: "folded"; into: string; origin?: OriginChange }
    )[];
    origin?: OriginChange;
  };
  delete_node: { title: string; edges: string[]; ungrouped: string[]; origin?: OriginChange };
  add_edge: {
    type: EdgeType;
    srcId: string;
    dstId: string;
    origin: Origin;
    confidence: number;
    rationale: string | null;
    /** The edge already existed; this adds corroboration. */
    corroborated?: boolean;
    /** The edge's origin rose, because the new source outranks the old. */
    upgraded?: OriginChange;
  };
  delete_edge: { type: EdgeType };
  link_person: { person: NodePerson; origin?: OriginChange };
  unlink_person: { person: NodePerson; origin?: OriginChange };
  add_evidence: Record<string, never>;
};

/** One entry of the append-only log: what changed, why, who by, and the words that justify it. */
export type GraphOp<K extends GraphOpKind = GraphOpKind> = {
  [Kind in K]: {
    id: number;
    kind: Kind;
    /** Who made the change. */
    source: Origin;
    nodeId: string | null;
    edgeId: string | null;
    detail: GraphOpDetails[Kind];
    rationale: string | null;
    createdAt: number;
    evidence: Evidence[];
  };
}[K];

/** One change, for `apply`. */
export type GraphCommand =
  | {
      kind: "create_node";
      /** A name later commands can use as an id, written `$name`. */
      ref?: string;
      input: CreateNodeInput;
    }
  | { kind: "update_node"; input: UpdateNodeInput }
  | { kind: "set_status"; input: SetStatusInput }
  | { kind: "merge_nodes"; input: MergeNodesInput }
  | { kind: "delete_node"; input: DeleteNodeInput }
  | { kind: "add_edge"; input: AddEdgeInput }
  | { kind: "delete_edge"; input: DeleteEdgeInput }
  | { kind: "link_person"; input: PersonLinkInput }
  | { kind: "unlink_person"; input: PersonLinkInput }
  | { kind: "add_evidence"; input: AddEvidenceInput };

export type CommandResult =
  | { ok: true; nodeId?: string; edgeId?: string; opId: number }
  | { ok: false; code: GraphErrorCode; message: string };

/** A moment in a meeting's graph: after a given op, or after the last op made by a time. */
export type GraphCut = { opId: number } | { at: number };

/**
 * Where a meeting's graph is kept. Every method that takes an id also accepts the id of a node that
 * was since merged into another, and acts on the survivor. Rule violations reject with a `GraphRuleError`.
 */
export interface GraphStore {
  createNode<T extends NodeType>(input: CreateNodeInput<T>): Promise<GraphNode>;
  updateNode(input: UpdateNodeInput): Promise<GraphNode>;
  /** Rejected when it breaks `NODE_TRANSITIONS` or a `STATUS_PRECONDITIONS` entry. */
  setStatus(input: SetStatusInput): Promise<GraphNode>;
  /** Folds `loserId` into `survivorId`; both must be live nodes of the same meeting and type. */
  mergeNodes(input: MergeNodesInput): Promise<GraphNode>;
  /** Hides the node and its edges; the history stays. */
  deleteNode(input: DeleteNodeInput): Promise<void>;

  /** Adding an edge that already exists records the new evidence against it and returns it. */
  addEdge(input: AddEdgeInput): Promise<GraphEdge>;
  deleteEdge(input: DeleteEdgeInput): Promise<void>;

  linkPerson(input: PersonLinkInput): Promise<GraphNode>;
  unlinkPerson(input: PersonLinkInput): Promise<GraphNode>;
  addEvidence(input: AddEvidenceInput): Promise<void>;

  /**
   * Applies changes in order, all in one transaction. A change the rules refuse is skipped and
   * reported; the others still apply. Any id written `$name` stands for the node a `create_node`
   * command with that `ref` made earlier in the same call.
   */
  apply(commands: GraphCommand[], defaults?: { source?: Origin }): Promise<CommandResult[]>;

  getNode(id: string): Promise<GraphNode | undefined>;
  getGraph(meetingId: string): Promise<MeetingGraph>;
  /** The graph as it stood at a moment, rebuilt from the op log. */
  asOf(meetingId: string, cut: GraphCut): Promise<MeetingGraph>;
  /** A node's edges in both directions, symmetric ones included. */
  edgesOf(
    nodeId: string,
    filter?: { types?: EdgeType[]; family?: EdgeFamily },
  ): Promise<NodeEdge[]>;
  /** What happened to a node or an edge, oldest first. A merged node's history includes the loser's. */
  history(subject: { nodeId: string } | { edgeId: string }): Promise<GraphOp[]>;

  /**
   * Removes nodes and edges that no transcript passage supports any more, for example after the
   * transcript they came from was deleted. Returns how many nodes were removed.
   */
  pruneUnsupported(meetingId: string): Promise<number>;
}
