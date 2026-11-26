import {
  EDGE_RULES,
  INITIAL_STATUSES,
  NODE_TRANSITIONS,
  STATUS_PRECONDITIONS,
  canTransition,
  edgeAllowed,
  isEdgeType,
  isNodeType,
  isPersonRole,
  isStatusOf,
  orientEdge,
  originRank,
  parseAttrs,
  roleAllowed,
  speakerKey,
  type AddEdgeInput,
  type AddEvidenceInput,
  type Change,
  type CreateNodeInput,
  type DeleteEdgeInput,
  type DeleteNodeInput,
  type GraphCommand,
  type GraphOpDetails,
  type GraphOpKind,
  type MergeNodesInput,
  type NodePerson,
  type NodeType,
  type Origin,
  type OriginChange,
  type PersonLinkInput,
  type PersonRef,
  type PersonRole,
  type SetStatusInput,
  type StatusPrecondition,
  type UpdateNodeInput,
} from "@app/contracts";
import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import {
  type NodeRow,
  type EdgeRow,
  type PersonRow,
  type Justification,
  type Outcome,
  type Run,
  fail,
  toPerson,
  checkConfidence,
  checkSource,
  outranked,
} from "./graph-rules";
import type { GraphQueries } from "./graph-queries";
import { inTransaction, type GraphStatements } from "./graph-statements";

/**
 * How the graph is changed. Every change runs in one transaction and is written to `graph_ops` with
 * enough detail to rebuild the graph from the log alone, and with the transcript quotes that justify it.
 */
export function createGraphCommands(
  db: Database,
  statements: GraphStatements,
  queries: GraphQueries,
) {
  const {
    meetingExists,
    insertNode,
    touchNode,
    setNodeOrigin,
    updateNodeFields,
    updateStatus,
    softDeleteNode,
    childrenOf,
    ungroupChildren,
    moveChildren,
    setMergedInto,
    repointMerged,
    speakerName,
    peopleOf,
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
    insertOp,
    insertEvidence,
    findCaption,
  } = statements;
  const { liveRow, edgesTouching } = queries;

  let lastOpId = 0;
  /** When the command being run happened, so every row it writes carries the same time. */
  let stamp = 0;

  const transaction = <T>(work: () => T): T => inTransaction(db, work);

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

  return { execute, single, lastOpId: () => lastOpId };
}

export type GraphCommands = ReturnType<typeof createGraphCommands>;
