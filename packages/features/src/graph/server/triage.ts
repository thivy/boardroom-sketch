import type { GraphNode } from "@app/contracts";
import type { Aliases } from "./context";
import { describeNode } from "./context";
import type { Turn } from "./turns";

export const ROUTES = ["extract_now", "batch", "skip"] as const;
export type Route = (typeof ROUTES)[number];

export const EXPECTS = [
  "decision",
  "commitment",
  "correction",
  "agreement",
  "objection",
  "question",
  "answer",
  "risk",
  "fact",
  "intention",
  "other",
] as const;
export type Expect = (typeof EXPECTS)[number];

export type Verdict = {
  route: Route;
  expects: Expect[];
  /** Ids of open threads the turn relates to. */
  touches: string[];
  /** Whether the turn may contradict or reverse something earlier. */
  wakeConnect: boolean;
};

export const TRIAGE_INSTRUCTIONS = `You triage turns of a live meeting for a system that builds a knowledge graph of it. You never write to the graph. You only decide how soon a turn deserves a closer look. Answer with JSON only.

route:
- extract_now: a new decision, a commitment (someone takes something on), a correction, or a reversal of something said earlier.
- batch: agreement or objection, facts, questions, answers, risks, intentions.
- skip: greetings, filler, audio or screen-sharing logistics, small talk with nothing in it.
When unsure, choose batch. Never skip a reply to a question or to an open thread.

expects: the kinds of content the turn probably holds.
touches: the ids of the open threads the turn relates to. Use only ids from the list you are given.
wakeConnect: true when the turn may contradict, or reverse, an earlier decision, claim or commitment.`;

export const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    route: { type: "string", enum: [...ROUTES] },
    expects: { type: "array", items: { type: "string", enum: [...EXPECTS] } },
    touches: { type: "array", items: { type: "string" } },
    wakeConnect: { type: "boolean" },
  },
  required: ["route", "expects", "touches", "wakeConnect"],
  additionalProperties: false,
} as const;

export const renderTurn = (turn: Turn) =>
  `${turn.speaker || "Someone"}: ${turn.lines.map((line) => line.text.trim()).join(" ")}`;

/** The prompt for one turn: what was said just before it, the threads still open, then the turn. */
export function triagePrompt(
  turn: Turn,
  earlier: Turn[],
  threads: GraphNode[],
  aliases: Aliases,
): string {
  return [
    "Open threads:",
    threads.length > 0 ? threads.map((node) => describeNode(node, aliases)).join("\n") : "(none)",
    "",
    "Earlier turns:",
    earlier.length > 0 ? earlier.map(renderTurn).join("\n") : "(none)",
    "",
    "New turn:",
    renderTurn(turn),
  ].join("\n");
}

/** A verdict the model gave, checked; undefined when it is not one. Unknown ids and kinds are dropped. */
export function parseVerdict(value: unknown, aliases: Aliases): Verdict | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (!(ROUTES as readonly unknown[]).includes(raw.route)) return undefined;
  const list = (item: unknown) => (Array.isArray(item) ? item : []);
  return {
    route: raw.route as Route,
    expects: list(raw.expects).filter((kind): kind is Expect =>
      (EXPECTS as readonly unknown[]).includes(kind),
    ),
    touches: list(raw.touches)
      .map((alias) => (typeof alias === "string" ? aliases.resolve(alias) : undefined))
      .filter((id): id is string => id !== undefined),
    wakeConnect: raw.wakeConnect === true,
  };
}

/**
 * The rules the code holds Triage to, whatever the model said: a reply to a question, or a turn that
 * touches an open thread, is never skipped. Returns the verdict and what was changed.
 */
export function holdToRules(
  verdict: Verdict,
  previous: Turn | undefined,
): { verdict: Verdict; overridden?: string } {
  if (verdict.route !== "skip") return { verdict };
  if (verdict.touches.length > 0) {
    return { verdict: { ...verdict, route: "batch" }, overridden: "skip touches an open thread" };
  }
  if (previous && renderTurn(previous).trimEnd().endsWith("?")) {
    return { verdict: { ...verdict, route: "batch" }, overridden: "skip replies to a question" };
  }
  return { verdict };
}
