import type { EdgeType, GraphNode, MeetingGraph, NodeType } from "@app/contracts";

export type Activity = {
  key: string;
  at: number;
  kind: "node_added" | "status_changed" | "edge_added" | "node_removed";
  nodeId?: string;
  nodeType?: NodeType;
  edgeType?: EdgeType;
  title: string;
  /** For a status change, the status it moved to. */
  status?: string;
  /** For an edge, the title of the node it points at. */
  target?: string;
};

/** What a poll of the graph added, changed or removed since the previous one. */
export function diffGraphs(previous: MeetingGraph, next: MeetingGraph, at: number): Activity[] {
  const before = new Map(previous.nodes.map((node) => [node.id, node]));
  const after = new Map(next.nodes.map((node) => [node.id, node]));
  const title = (id: string) => after.get(id)?.title ?? before.get(id)?.title ?? "Unknown";
  const found: Activity[] = [];

  for (const node of next.nodes) {
    const old = before.get(node.id);
    if (!old) {
      found.push({
        key: `add:${node.id}:${at}`,
        at,
        kind: "node_added",
        nodeId: node.id,
        nodeType: node.type,
        title: node.title,
        status: node.status,
      });
    } else if (old.status !== node.status) {
      found.push({
        key: `status:${node.id}:${node.status}:${at}`,
        at,
        kind: "status_changed",
        nodeId: node.id,
        nodeType: node.type,
        title: node.title,
        status: node.status,
      });
    }
  }

  const edgesBefore = new Set(previous.edges.map((edge) => edge.id));
  for (const edge of next.edges) {
    if (edgesBefore.has(edge.id) || !before.has(edge.srcId) || !before.has(edge.dstId)) continue;
    found.push({
      key: `edge:${edge.id}`,
      at,
      kind: "edge_added",
      nodeId: edge.srcId,
      edgeType: edge.type,
      title: title(edge.srcId),
      target: title(edge.dstId),
    });
  }

  for (const node of previous.nodes as GraphNode[]) {
    if (after.has(node.id)) continue;
    found.push({
      key: `gone:${node.id}:${at}`,
      at,
      kind: "node_removed",
      nodeType: node.type,
      title: node.title,
    });
  }

  return found;
}
