import {
  EDGE_RULES,
  EDGE_TYPES,
  INITIAL_STATUSES,
  NODE_TRANSITIONS,
  NODE_TYPES,
  PERSON_ROLES,
  PERSON_ROLE_NAMES,
  isEdgeType,
  isNodeType,
  isPersonRole,
  type EvidenceInput,
  type GraphCommand,
  type GraphNode,
  type MeetingGraph,
  type NodeType,
  type PersonRef,
} from "@app/contracts";
import {
  candidatesFor,
  createAliases,
  describeEdge,
  describeNode,
  neighbourhood,
  openThreads,
  withinBudget,
  type Aliases,
} from "./context";
import { quoteAppearsIn } from "./quotes";
import type { Turn } from "./turns";

/** About 2,000 tokens of graph context: what the model may link to. */
const CONTEXT_BUDGET_CHARS = 8_000;

const text = { type: "string" } as const;
const number = { type: "number" } as const;
const oneOf = (values: readonly string[]) => ({ type: "string", enum: [...values] }) as const;
const orNull = (schema: { type: string; enum?: readonly string[] }) => ({
  ...schema,
  type: [schema.type, "null"],
  ...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});

/** Each quote names a line and gives the words on it. At least one is needed; the code checks that. */
const evidence = {
  type: "array",
  items: {
    type: "object",
    properties: { line: text, quote: text },
    required: ["line", "quote"],
    additionalProperties: false,
  },
} as const;

/**
 * One kind of change. Every property is listed as required and the optional ones may be null, which
 * is what strict structured-output modes ask for; `str` reads a null as "not given".
 */
const change = (
  op: string,
  needed: Record<string, object>,
  optional: Record<string, { type: string; enum?: readonly string[] }> = {},
) => {
  const properties = {
    op: oneOf([op]),
    ...needed,
    ...Object.fromEntries(Object.entries(optional).map(([name, schema]) => [name, orNull(schema)])),
    evidence,
  };
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
};

export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      items: {
        anyOf: [
          change(
            "add_node",
            { ref: text, nodeType: oneOf(NODE_TYPES), title: text },
            { status: text, topic: text, due: text, confidence: number },
          ),
          change(
            "add_edge",
            { edgeType: oneOf(EDGE_TYPES), from: text, to: text },
            { confidence: number },
          ),
          change("set_status", { target: text, status: text }),
          change("update_node", { target: text }, { title: text, due: text }),
          change("link_person", { target: text, person: text, role: oneOf(PERSON_ROLE_NAMES) }),
          change("add_evidence", { target: text }),
        ],
      },
    },
  },
  required: ["changes"],
  additionalProperties: false,
} as const;

/** The vocabulary as the prompt states it, written from the same constants the store enforces. */
function vocabulary(): string {
  const statuses = NODE_TYPES.map((type) => {
    const moves = Object.entries(NODE_TRANSITIONS[type] as Record<string, readonly string[]>)
      .map(([from, to]) => `${from}>${to.join(",") || "final"}`)
      .join("; ");
    return `- ${type}: starts as ${INITIAL_STATUSES[type].join(" or ")}. Moves: ${moves}`;
  });
  const edges = EDGE_TYPES.map((type) => {
    const rule = EDGE_RULES[type];
    return `- ${type}${rule.symmetric ? " (two-way)" : ""}: ${rule.from.join("|")} to ${rule.to.join("|")}`;
  });
  const roles = PERSON_ROLE_NAMES.map(
    (role) => `- ${role}: ${role === "mentioned" ? "any node" : PERSON_ROLES[role].join("|")}`,
  );
  return [
    "Node types and statuses:",
    ...statuses,
    "",
    "Edge types:",
    ...edges,
    "",
    "Roles a person can have on a node:",
    ...roles,
  ].join("\n");
}

export const EXTRACT_INSTRUCTIONS = `You turn what was said in a live meeting into changes to a knowledge graph. You report only what was said. You never infer across topics, decide what something means, or add a connection nobody stated. Answer with JSON only: {"changes": [...]}. An empty list is a good answer when nothing was worth recording.

${vocabulary()}

Each change has "op" and "evidence". The other fields depend on the op:
- add_node: ref (a new name such as "$a"), nodeType, title (short and specific), status (optional), topic (the alias or ref of a topic node, optional), due (when it is due, as said, optional).
- add_edge: edgeType, from, to (aliases such as n3, or refs).
- set_status: target, status.
- update_node: target, and title and/or due.
- link_person: target, person (such as s1), role.
- add_evidence: target. Use it when a turn only adds support for a node that exists.

Evidence is a list of {line, quote}: the line label (such as c3) and the speaker's own words from that one line, word for word and in order, at least three words. A change whose quote is not on that line is thrown away.

Rules:
- Prefer an existing node (n1, n2...) to a new one. Create a node only when nothing listed fits.
- Refer to existing nodes by their alias and to people by their label. Never invent ids, refs or topics: a ref must be defined by an add_node earlier in your answer, and a topic must be an existing topic node.
- A decision is decided only when the speaker marks it ("so, decision", "we've decided"). Otherwise it is tentative.
- Link the person who takes an action with role owner. An action nobody takes on has no owner.
- Do not use contradicts: spotting contradictions is someone else's job.
- Quote the speaker who said it. Do not report what you think follows.

Example. People: s1 Dana, s2 Raj. Turns:
[c1] Dana: Right, so decision: we ship the beta on the ninth.
[c2] Raj: I'll write the release notes by Wednesday.
Answer:
{"changes": [
{"op": "add_node", "ref": "$a", "nodeType": "decision", "title": "Ship the beta on the ninth", "status": "decided", "evidence": [{"line": "c1", "quote": "so decision: we ship the beta on the ninth"}]},
{"op": "link_person", "target": "$a", "person": "s1", "role": "decided_by", "evidence": [{"line": "c1", "quote": "we ship the beta on the ninth"}]},
{"op": "add_node", "ref": "$b", "nodeType": "action", "title": "Write the release notes", "status": "committed", "due": "Wednesday", "evidence": [{"line": "c2", "quote": "I'll write the release notes by Wednesday"}]},
{"op": "link_person", "target": "$b", "person": "s2", "role": "owner", "evidence": [{"line": "c2", "quote": "I'll write the release notes by Wednesday"}]}
]}`;

export type Labels = {
  /** Caption lines by label (`c1`...). */
  lines: Map<string, { sessionId: number; captionId: string; text: string }>;
  /** People by label (`s1`...). */
  people: Map<string, PersonRef>;
  aliases: Aliases;
};

export type ExtractContext = {
  prompt: string;
  labels: Labels;
};

/** The prompt for a batch of turns, and the labels needed to read the answer. */
export function extractContext(
  turns: Turn[],
  graph: MeetingGraph,
  touches: string[],
): ExtractContext {
  const aliases = createAliases();
  const lines = new Map<string, { sessionId: number; captionId: string; text: string }>();
  const people = new Map<string, PersonRef>();
  const peopleLabels = new Map<string, string>();

  const turnLines = turns.flatMap((turn) => {
    const key = turn.speakerId || `name:${turn.speaker}`;
    if (!peopleLabels.has(key)) {
      const label = `s${peopleLabels.size + 1}`;
      peopleLabels.set(key, label);
      people.set(label, { speakerId: turn.speakerId, speaker: turn.speaker });
    }
    return turn.lines.map((line) => {
      const label = `c${lines.size + 1}`;
      lines.set(label, { sessionId: turn.sessionId, captionId: line.id, text: line.text });
      return `[${label}] ${turn.speaker || "Someone"}: ${line.text.trim()}`;
    });
  });

  // Threads first, then what the turns touch, then whatever the words suggest.
  const spoken = turns.map((turn) => turn.lines.map((line) => line.text).join(" ")).join(" ");
  const ordered: GraphNode[] = [];
  const seen = new Set<string>();
  const add = (nodes: GraphNode[]) => {
    for (const node of nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        ordered.push(node);
      }
    }
  };
  add(openThreads(graph));
  add(neighbourhood(graph, touches, 1).nodes);
  add(candidatesFor(graph, spoken));

  const nodeLines = withinBudget(
    ordered.map((node) => describeNode(node, aliases)),
    CONTEXT_BUDGET_CHARS * 0.75,
  );
  const shown = new Set(ordered.slice(0, nodeLines.length).map((node) => node.id));
  const edgeLines = withinBudget(
    graph.edges
      .filter((edge) => shown.has(edge.srcId) && shown.has(edge.dstId))
      .map((edge) => describeEdge(edge, aliases)),
    CONTEXT_BUDGET_CHARS * 0.25,
  );

  const prompt = [
    "People:",
    ...[...people].map(([label, person]) => `${label} ${person.speaker || "Someone"}`),
    "",
    "Turns (quote only from these lines):",
    ...turnLines,
    "",
    "Nodes already in the graph:",
    ...(nodeLines.length > 0 ? nodeLines : ["(none)"]),
    "",
    "Edges among them:",
    ...(edgeLines.length > 0 ? edgeLines : ["(none)"]),
  ].join("\n");

  return { prompt, labels: { lines, people, aliases } };
}

// ---------------------------------------------------------------------------------------------
// Reading the answer
// ---------------------------------------------------------------------------------------------

/** Words that mark a decision as made, not floated. English only; extend as meetings show gaps. */
export const DECISION_MARKERS: readonly RegExp[] = [
  /\bdecision\b/i,
  /\b(?:we|i)(?:'ve| have)? decided\b/i,
  /\b(?:it|that)(?:'s| is) (?:decided|settled)\b/i,
  /\bwe(?:'re| are) going (?:with|to go with)\b/i,
  /\b(?:let's|let us|we'll|we will) go with\b/i,
];

export const hasDecisionMarker = (line: string) =>
  DECISION_MARKERS.some((pattern) => pattern.test(line));

export type Rejection = {
  /** The change's position in the answer. */
  index: number;
  op: string;
  reason: string;
  change: unknown;
};

export type Plan = {
  commands: GraphCommand[];
  /** For each command, which change in the answer it came from. */
  origins: number[];
  rejections: Rejection[];
  /** Changes kept but made weaker, for example a decision with no marker left tentative. */
  adjustments: string[];
};

type Raw = Record<string, unknown>;

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const REF = /^\$[A-Za-z0-9_]+$/;

/**
 * Checks what the model proposed and turns it into commands for the graph. Nothing here trusts the
 * model: quotes are matched against the transcript, ids against what was shown, and statuses are
 * held to what the words support. A change that fails a check is dropped and reported, not repaired.
 */
export function planChanges(
  value: unknown,
  labels: Labels,
  meetingId: string,
  graph: MeetingGraph,
): Plan {
  const plan: Plan = { commands: [], origins: [], rejections: [], adjustments: [] };
  const changes = (value as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes)) {
    plan.rejections.push({
      index: -1,
      op: "",
      reason: "The answer has no list of changes",
      change: value,
    });
    return plan;
  }

  const reject = (index: number, change: Raw, reason: string) =>
    plan.rejections.push({ index, op: str(change.op), reason, change });

  /** The quotes that really appear on the lines they name, and the text of those lines. */
  function verify(change: Raw): { evidence: EvidenceInput[]; lines: string[]; dropped: number } {
    const evidence: EvidenceInput[] = [];
    const lines: string[] = [];
    let dropped = 0;
    for (const item of Array.isArray(change.evidence) ? (change.evidence as Raw[]) : []) {
      const line = labels.lines.get(str(item?.line));
      const quote = str(item?.quote);
      if (line && quote && quoteAppearsIn(quote, line.text)) {
        evidence.push({ sessionId: line.sessionId, captionId: line.captionId, quote });
        lines.push(line.text);
      } else {
        dropped++;
      }
    }
    return { evidence, lines, dropped };
  }

  const defined = new Map<string, NodeType>();
  /** An alias shown to the model, or a ref this answer defined earlier, as an id the graph understands. */
  function node(label: string): string | undefined {
    if (defined.has(label)) return label;
    return labels.aliases.resolve(label);
  }
  function typeOf(label: string): NodeType | undefined {
    const known = defined.get(label);
    if (known) return known;
    const id = labels.aliases.resolve(label);
    return graph.nodes.find((candidate) => candidate.id === id)?.type;
  }

  // A link to a node this answer creates is folded into that node's creation, so a committed
  // action has its owner from the start.
  const folded = new Map<
    string,
    { person: PersonRef; role: (typeof PERSON_ROLE_NAMES)[number]; evidence: Raw }[]
  >();
  const created = new Set(
    changes
      .filter((change): change is Raw => typeof change === "object" && change !== null)
      .filter((change) => change.op === "add_node")
      .map((change) => str(change.ref)),
  );
  const linkAt = new Set<number>();
  changes.forEach((change, index) => {
    const raw = change as Raw;
    if (raw?.op !== "link_person" || !created.has(str(raw.target))) return;
    const person = labels.people.get(str(raw.person));
    if (!person || !isPersonRole(raw.role)) return;
    const target = str(raw.target);
    folded.set(target, [...(folded.get(target) ?? []), { person, role: raw.role, evidence: raw }]);
    linkAt.add(index);
  });

  // Nodes are created first, so an edge or a status may name one the model listed after it.
  const order = changes
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Number((changes[b] as Raw)?.op === "add_node") -
          Number((changes[a] as Raw)?.op === "add_node") || a - b,
    );

  order.forEach((index) => {
    const item = changes[index];
    if (typeof item !== "object" || item === null) return reject(index, {}, "Not an object");
    const change = item as Raw;
    const op = str(change.op);
    if (linkAt.has(index)) return;

    const checked = verify(change);
    const need = () => {
      if (checked.evidence.length > 0) return true;
      reject(
        index,
        change,
        checked.dropped > 0 ? "No quote was found on the line it names" : "No quote",
      );
      return false;
    };

    const push = (command: GraphCommand) => {
      plan.commands.push(command);
      plan.origins.push(index);
    };

    switch (op) {
      case "add_node": {
        const ref = str(change.ref);
        const type = change.nodeType;
        const title = str(change.title);
        if (!REF.test(ref) || defined.has(ref))
          return reject(index, change, "ref must be a new name such as $a");
        if (!isNodeType(type)) return reject(index, change, "Unknown node type");
        if (!title) return reject(index, change, "No title");

        const links = folded.get(ref) ?? [];
        const evidence = [...checked.evidence];
        const lines = [...checked.lines];
        for (const link of links) {
          const more = verify(link.evidence);
          evidence.push(...more.evidence);
          lines.push(...more.lines);
        }
        if (evidence.length === 0)
          return reject(index, change, "No quote was found on the line it names");

        let status = str(change.status) || undefined;
        const initial = INITIAL_STATUSES[type] as readonly string[];
        if (status && !initial.includes(status)) {
          plan.adjustments.push(`${title}: ${status} is not a starting status for a ${type}`);
          status = undefined;
        }
        const due = str(change.due);
        const hasOwner = links.some((link) => link.role === "owner");

        if (type === "decision" && status === "decided" && !lines.some(hasDecisionMarker)) {
          plan.adjustments.push(`${title}: no explicit decision marker, left tentative`);
          status = "tentative";
        }
        if (type === "action") {
          const wanted = status ?? (hasOwner ? "requested" : due ? "requested" : "intent");
          if (wanted === "committed" && !hasOwner) {
            status = due ? "requested" : "intent";
            plan.adjustments.push(`${title}: no owner, so ${status} rather than committed`);
          } else if (wanted === "requested" && !hasOwner && !due) {
            status = "intent";
            plan.adjustments.push(`${title}: no owner and no date, so intent`);
          } else {
            status = wanted;
          }
        }

        const topic = str(change.topic);
        const topicId = topic ? node(topic) : undefined;
        if (topic && !topicId)
          plan.adjustments.push(`${title}: unknown topic ${topic}, left ungrouped`);

        defined.set(ref, type);
        push({
          kind: "create_node",
          ref,
          input: {
            meetingId,
            type: type as NodeType,
            title,
            status: status as never,
            topicId,
            confidence: typeof change.confidence === "number" ? change.confidence : undefined,
            attrs: (type === "action" && due ? { dueText: due } : undefined) as never,
            people: links.map(({ person, role }) => ({ person, role })),
            evidence,
            source: "stated",
          },
        });
        return;
      }

      case "add_edge": {
        const type = change.edgeType;
        if (!isEdgeType(type)) return reject(index, change, "Unknown edge type");
        if (type === "contradicts") {
          return reject(index, change, "contradicts is inferred; it is left to the Connect step");
        }
        const srcId = node(str(change.from));
        const dstId = node(str(change.to));
        if (!srcId || !dstId)
          return reject(index, change, "from or to is not a node that was shown");
        if (!need()) return;
        return push({
          kind: "add_edge",
          input: {
            type,
            srcId,
            dstId,
            confidence: typeof change.confidence === "number" ? change.confidence : undefined,
            evidence: checked.evidence,
            source: "stated",
          },
        });
      }

      case "set_status": {
        const nodeId = node(str(change.target));
        const status = str(change.status);
        if (!nodeId) return reject(index, change, "target is not a node that was shown");
        if (!status) return reject(index, change, "No status");
        if (!need()) return;
        const type = typeOf(str(change.target));
        if (
          type === "decision" &&
          (status === "decided" || status === "confirmed") &&
          !checked.lines.some(hasDecisionMarker)
        ) {
          return reject(
            index,
            change,
            "No explicit decision marker, so the decision stays tentative",
          );
        }
        return push({
          kind: "set_status",
          input: { nodeId, status: status as never, evidence: checked.evidence, source: "stated" },
        });
      }

      case "update_node": {
        const nodeId = node(str(change.target));
        if (!nodeId) return reject(index, change, "target is not a node that was shown");
        const title = str(change.title);
        const due = str(change.due);
        if (!title && !due) return reject(index, change, "Nothing to change");
        if (!need()) return;
        return push({
          kind: "update_node",
          input: {
            nodeId,
            title: title || undefined,
            attrs: due ? { dueText: due } : undefined,
            evidence: checked.evidence,
            source: "stated",
          },
        });
      }

      case "link_person": {
        const nodeId = node(str(change.target));
        const person = labels.people.get(str(change.person));
        if (!nodeId) return reject(index, change, "target is not a node that was shown");
        if (!person) return reject(index, change, "person is not someone in these turns");
        if (!isPersonRole(change.role)) return reject(index, change, "Unknown role");
        if (!need()) return;
        return push({
          kind: "link_person",
          input: {
            nodeId,
            person,
            role: change.role,
            evidence: checked.evidence,
            source: "stated",
          },
        });
      }

      case "add_evidence": {
        const nodeId = node(str(change.target));
        if (!nodeId) return reject(index, change, "target is not a node that was shown");
        if (!need()) return;
        return push({
          kind: "add_evidence",
          input: { nodeId, evidence: checked.evidence, source: "stated" },
        });
      }

      default:
        return reject(index, change, `Unknown op "${op}"`);
    }
  });

  return plan;
}
