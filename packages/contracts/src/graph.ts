import type {
  AttrsOf,
  EdgeFamily,
  EdgeType,
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
 * Why a change is being made. Creating a node or edge always needs `evidence`; any other change
 * needs `evidence` or, for something the system worked out itself, a `rationale`.
 */
export type Change = {
  evidence?: EvidenceInput[];
  rationale?: string;
};

export type CreateNodeInput<T extends NodeType = NodeType> = {
  meetingId: string;
  type: T;
  title: string;
  /** One of the type's initial statuses; defaults to the first (see `INITIAL_STATUSES`). */
  status?: StatusOf<T>;
  topicId?: string;
  origin?: Origin;
  confidence?: number;
  attrs?: AttrsOf[T];
  people?: { person: PersonRef; role: PersonRole }[];
  evidence: EvidenceInput[];
  rationale?: string;
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
  origin?: Origin;
  confidence?: number;
  evidence: EvidenceInput[];
  /** Required when `origin` is `inferred`. */
  rationale?: string;
};

export type DeleteEdgeInput = Change & { edgeId: string };

export type PersonLinkInput = Change & { nodeId: string; person: PersonRef; role: PersonRole };

export type GraphOpKind =
  | "create_node"
  | "update_node"
  | "set_status"
  | "merge_nodes"
  | "delete_node"
  | "add_edge"
  | "delete_edge"
  | "link_person"
  | "unlink_person";

/** One entry of the append-only log: what changed, why, and the words that justify it. */
export type GraphOp = {
  id: number;
  kind: GraphOpKind;
  nodeId: string | null;
  edgeId: string | null;
  detail: Record<string, unknown>;
  rationale: string | null;
  createdAt: number;
  evidence: Evidence[];
};

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

  getNode(id: string): Promise<GraphNode | undefined>;
  getGraph(meetingId: string): Promise<MeetingGraph>;
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
