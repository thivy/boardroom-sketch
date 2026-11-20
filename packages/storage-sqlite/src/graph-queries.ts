import {
  EDGE_RULES,
  replayGraph,
  type Evidence,
  type GraphNode,
  type GraphOp,
  type GraphStore,
  type MeetingGraph,
  type NodeEdge,
  type ReplayOp,
} from "@app/contracts";
import {
  type NodeRow,
  type EdgeRow,
  type PersonRow,
  type OpRow,
  fail,
  toPerson,
  toEdge,
} from "./graph-rules";
import type { GraphStatements } from "./graph-statements";

/** How the graph is read: rows turned into nodes and edges, and the log turned into history. */
export function createGraphQueries(statements: GraphStatements) {
  const {
    selectNode,
    liveNodes,
    peopleOf,
    peopleOfMeeting,
    selectEdge,
    meetingEdges,
    edgesWithLiveOther,
    opsOfNode,
    opsOfEdge,
    opsUpTo,
    lastOpAt,
    evidenceOfOp,
  } = statements;

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

  const reads: Pick<GraphStore, "getNode" | "getGraph" | "asOf" | "edgesOf" | "history"> = {
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
  };

  return { liveRow, toNode, nodeById, edgeById, edgesTouching, opsOf, reads };
}

export type GraphQueries = ReturnType<typeof createGraphQueries>;
