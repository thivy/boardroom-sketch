import type { EdgeFamily, EdgeType, GraphNode, NodeType } from "@app/contracts";
import {
  BoxIcon,
  CircleQuestionMarkIcon,
  GavelIcon,
  HashIcon,
  LightbulbIcon,
  LockIcon,
  type LucideIcon,
  QuoteIcon,
  SquareCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";

export const NODE_VISUALS: Record<NodeType, { label: string; color: string; icon: LucideIcon }> = {
  topic: { label: "Topics", color: "#8b93a7", icon: HashIcon },
  proposal: { label: "Proposals", color: "#7b87f0", icon: LightbulbIcon },
  decision: { label: "Decisions", color: "#4cb782", icon: GavelIcon },
  action: { label: "Actions", color: "#f2b544", icon: SquareCheckIcon },
  question: { label: "Questions", color: "#4ab8e8", icon: CircleQuestionMarkIcon },
  risk: { label: "Risks", color: "#eb5757", icon: TriangleAlertIcon },
  claim: { label: "Claims", color: "#c084fc", icon: QuoteIcon },
  constraint: { label: "Constraints", color: "#f08c5a", icon: LockIcon },
  entity: { label: "Entities", color: "#ec7fb0", icon: BoxIcon },
};

export const FAMILY_VISUALS: Record<EdgeFamily, { label: string; color: string; dash?: string }> = {
  build: { label: "Builds on", color: "#4cb782" },
  oppose: { label: "Opposes", color: "#eb5757" },
  revise: { label: "Revises", color: "#f2b544" },
  plan: { label: "Depends on", color: "#7b87f0" },
  struct: { label: "Organises", color: "#8a8f98", dash: "2 4" },
};

/**
 * How a status reads at a glance. `resolved` is settled for good, `contested` needs attention,
 * `dead` was dropped or replaced, and everything else is still in play.
 */
export type Tone = "open" | "resolved" | "contested" | "dead";

const TONES: Record<string, Tone> = {
  adopted: "resolved",
  decided: "resolved",
  confirmed: "resolved",
  done: "resolved",
  answered: "resolved",
  closed: "resolved",
  accepted: "resolved",
  challenged: "contested",
  contested: "contested",
  escalated: "contested",
  orphaned: "contested",
  rejected: "dead",
  withdrawn: "dead",
  dropped: "dead",
  retracted: "dead",
  reversed: "dead",
  superseded: "dead",
  lifted: "dead",
};

export const toneOf = (status: string): Tone => TONES[status] ?? "open";

export const TONE_VISUALS: Record<Tone, { label: string; color: string }> = {
  open: { label: "In play", color: "#7b87f0" },
  resolved: { label: "Settled", color: "#4cb782" },
  contested: { label: "Contested", color: "#f2b544" },
  dead: { label: "Dropped", color: "#6b6f76" },
};

export const humanize = (value: string) => value.replaceAll("_", " ");

/** The node's drawn radius: topics are hubs, and a node grows a little with the edges it has. */
export const nodeRadius = (type: NodeType, degree: number) =>
  type === "topic" ? 20 + Math.min(degree, 8) : 11 + Math.min(degree * 1.2, 7);

export const edgeLabel = (type: EdgeType) => humanize(type);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

/** A stable hue for a person, so the same speaker is always the same colour. */
export function personColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 60% 62%)`;
}

export const isDead = (node: GraphNode) => toneOf(node.status) === "dead";
