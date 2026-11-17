import {
  OPEN_THREAD_STATUSES,
  type GraphEdge,
  type GraphNode,
  type MeetingGraph,
  type NodeType,
} from "@app/contracts";

/**
 * Short names for the nodes a prompt mentions (`n1`, `n2`...). A model can only point at a node that
 * was shown to it, and long ids would cost tokens for nothing.
 */
export type Aliases = {
  /** The alias for a node, giving it the next one if it has none yet. */
  of(nodeId: string): string;
  /** The node an alias stands for, if it was ever handed out. */
  resolve(alias: string): string | undefined;
};

export function createAliases(): Aliases {
  const byId = new Map<string, string>();
  const byAlias = new Map<string, string>();
  return {
    of(nodeId) {
      let alias = byId.get(nodeId);
      if (!alias) {
        alias = `n${byId.size + 1}`;
        byId.set(nodeId, alias);
        byAlias.set(alias, nodeId);
      }
      return alias;
    },
    resolve: (alias) => byAlias.get(alias),
  };
}

const MAX_TITLE = 90;
const clip = (text: string) =>
  text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text;

/** Whether a node is something a later turn may pick up: an open question, a tentative decision... */
export function isOpenThread(node: GraphNode): boolean {
  const statuses = OPEN_THREAD_STATUSES[node.type as NodeType] as readonly string[] | undefined;
  return statuses?.includes(node.status) ?? false;
}

export const openThreads = (graph: MeetingGraph): GraphNode[] => graph.nodes.filter(isOpenThread);

/** `n3 decision/tentative "Launch moves to 12 January"`: one line a prompt can afford per node. */
export function describeNode(node: GraphNode, aliases: Aliases): string {
  const owner = node.people.find((person) => person.role === "owner");
  return `${aliases.of(node.id)} ${node.type}/${node.status} "${clip(node.title)}"${owner ? ` owner:${owner.speaker}` : ""}`;
}

export const describeEdge = (edge: GraphEdge, aliases: Aliases) =>
  `${aliases.of(edge.srcId)} -${edge.type}-> ${aliases.of(edge.dstId)}`;

/** The nodes within `hops` edges of the seeds, and the edges among everything gathered. */
export function neighbourhood(graph: MeetingGraph, seedIds: Iterable<string>, hops = 1) {
  const known = new Set(graph.nodes.map((node) => node.id));
  const reached = new Set([...seedIds].filter((id) => known.has(id)));
  for (let step = 0; step < hops; step++) {
    for (const edge of graph.edges) {
      if (reached.has(edge.srcId)) reached.add(edge.dstId);
      if (reached.has(edge.dstId)) reached.add(edge.srcId);
    }
  }
  return {
    nodes: graph.nodes.filter((node) => reached.has(node.id)),
    edges: graph.edges.filter((edge) => reached.has(edge.srcId) && reached.has(edge.dstId)),
  };
}

const STOP_WORDS = new Set(
  "the and for that this with have from they them then than were was are not but you your our its it's i'll we'll let's just about what when where which will would could should there their been being into also very much more some any can get got".split(
    " ",
  ),
);

const terms = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  );

/**
 * Nodes whose titles share words with some text, best match first: the existing nodes a new turn
 * may be about, so the model links to them instead of creating a duplicate.
 */
export function candidatesFor(graph: MeetingGraph, text: string, limit = 12): GraphNode[] {
  const wanted = terms(text);
  return graph.nodes
    .map((node) => {
      const own = terms(node.title);
      let score = 0;
      for (const term of own) if (wanted.has(term)) score++;
      return { node, score: own.size === 0 ? 0 : score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.node);
}

/** Adds lines until the budget is used up; what does not fit is left out, never cut in half. */
export function withinBudget(lines: string[], budgetChars: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > budgetChars) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept;
}
