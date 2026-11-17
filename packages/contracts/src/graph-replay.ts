import type { GraphEdge, GraphNode, GraphOp, GraphOpKind, MeetingGraph, NodePerson } from "./graph";
import { EDGE_RULES, type EdgeType, type NodeType, type Origin } from "./graph-vocabulary";

/** An op as `replayGraph` reads it: the log entry without its evidence. */
export type ReplayOp = { [K in GraphOpKind]: Omit<GraphOp<K>, "evidence"> }[GraphOpKind];

type NodeState = {
  id: string;
  meetingId: string;
  type: NodeType;
  status: string;
  title: string;
  topicId: string | null;
  origin: Origin;
  confidence: number;
  attrs: Record<string, unknown>;
  people: NodePerson[];
  createdAt: number;
  updatedAt: number;
  live: boolean;
};

type EdgeState = {
  id: string;
  meetingId: string;
  type: EdgeType;
  srcId: string;
  dstId: string;
  origin: Origin;
  confidence: number;
  rationale: string | null;
  createdAt: number;
  live: boolean;
};

const personKey = (person: NodePerson) =>
  `${person.speakerId || `name:${person.speaker}`}|${person.role}`;

/**
 * Rebuilds a meeting's graph from its ops, oldest first. Given every op it returns what `getGraph`
 * returns; given only the ops up to a moment, it returns the graph as it stood then.
 */
export function replayGraph(meetingId: string, ops: readonly ReplayOp[]): MeetingGraph {
  const nodes = new Map<string, NodeState>();
  const edges = new Map<string, EdgeState>();

  const node = (id: string | null) => nodes.get(id ?? "");
  const edge = (id: string | null) => edges.get(id ?? "");

  for (const op of ops) {
    switch (op.kind) {
      case "create_node": {
        const d = op.detail;
        nodes.set(op.nodeId!, {
          id: op.nodeId!,
          meetingId,
          type: d.type,
          status: d.status,
          title: d.title,
          topicId: d.topicId,
          origin: d.origin,
          confidence: d.confidence,
          attrs: d.attrs,
          people: [...d.people],
          createdAt: op.createdAt,
          updatedAt: op.createdAt,
          live: true,
        });
        break;
      }
      case "update_node": {
        const target = node(op.nodeId);
        if (!target) break;
        const { changed, origin } = op.detail;
        if (changed.title) target.title = changed.title.to;
        if (changed.confidence) target.confidence = changed.confidence.to;
        if (changed.topicId) target.topicId = changed.topicId.to;
        if (changed.attrs) target.attrs = changed.attrs.to;
        if (origin) target.origin = origin.to;
        target.updatedAt = op.createdAt;
        break;
      }
      case "set_status": {
        const target = node(op.nodeId);
        if (!target) break;
        target.status = op.detail.to;
        if (op.detail.origin) target.origin = op.detail.origin.to;
        target.updatedAt = op.createdAt;
        break;
      }
      case "link_person": {
        const target = node(op.nodeId);
        if (!target) break;
        if (!target.people.some((p) => personKey(p) === personKey(op.detail.person))) {
          target.people.push(op.detail.person);
        }
        if (op.detail.origin) target.origin = op.detail.origin.to;
        target.updatedAt = op.createdAt;
        break;
      }
      case "unlink_person": {
        const target = node(op.nodeId);
        if (!target) break;
        target.people = target.people.filter((p) => personKey(p) !== personKey(op.detail.person));
        if (op.detail.origin) target.origin = op.detail.origin.to;
        target.updatedAt = op.createdAt;
        break;
      }
      case "delete_node": {
        const target = node(op.nodeId);
        if (!target) break;
        target.live = false;
        target.updatedAt = op.createdAt;
        for (const id of op.detail.edges) {
          const gone = edge(id);
          if (gone) gone.live = false;
        }
        for (const id of op.detail.ungrouped) {
          const child = node(id);
          if (child) child.topicId = null;
        }
        break;
      }
      case "merge_nodes": {
        const survivor = node(op.nodeId);
        const loser = node(op.detail.merged);
        if (!survivor || !loser) break;
        loser.live = false;
        for (const person of op.detail.people) {
          if (!survivor.people.some((p) => personKey(p) === personKey(person))) {
            survivor.people.push(person);
          }
        }
        if (op.detail.adoptedTopic) survivor.topicId = op.detail.adoptedTopic;
        for (const id of op.detail.childrenMoved) {
          const child = node(id);
          if (child) child.topicId = survivor.id;
        }
        for (const moved of op.detail.edges) {
          const target = edge(moved.edgeId);
          if (!target) continue;
          if (moved.action === "moved") {
            target.srcId = moved.srcId;
            target.dstId = moved.dstId;
          } else {
            target.live = false;
            if (moved.action === "folded" && moved.origin) {
              const twin = edge(moved.into);
              if (twin) twin.origin = moved.origin.to;
            }
          }
        }
        if (op.detail.origin) survivor.origin = op.detail.origin.to;
        survivor.updatedAt = op.createdAt;
        break;
      }
      case "add_edge": {
        const d = op.detail;
        if (d.corroborated) {
          const existing = edge(op.edgeId);
          if (existing && d.upgraded) existing.origin = d.upgraded.to;
          break;
        }
        edges.set(op.edgeId!, {
          id: op.edgeId!,
          meetingId,
          type: d.type,
          srcId: d.srcId,
          dstId: d.dstId,
          origin: d.origin,
          confidence: d.confidence,
          rationale: d.rationale,
          createdAt: op.createdAt,
          live: true,
        });
        break;
      }
      case "delete_edge": {
        const target = edge(op.edgeId);
        if (target) target.live = false;
        break;
      }
      case "add_evidence":
        break;
    }
  }

  const liveNodes = [...nodes.values()].filter((item) => item.live);
  const liveIds = new Set(liveNodes.map((item) => item.id));
  return {
    meetingId,
    nodes: liveNodes.map(({ live: _live, ...rest }) => rest as GraphNode),
    edges: [...edges.values()]
      .filter((item) => item.live && liveIds.has(item.srcId) && liveIds.has(item.dstId))
      .map(({ live: _live, ...rest }): GraphEdge => ({
        ...rest,
        family: EDGE_RULES[rest.type].family,
      })),
  };
}
