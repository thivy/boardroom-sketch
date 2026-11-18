import { cn } from "@app/ui/lib/utils";
import type { GraphNode, GraphOp, MeetingGraph, NodeType } from "@app/contracts";
import { NODE_TYPES } from "@app/contracts";
import { ArrowRightIcon, GitBranchIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { Activity } from "./activity";
import { useNodeHistory } from "./use-live-graph";
import { useNow } from "./use-now";
import {
  FAMILY_VISUALS,
  NODE_VISUALS,
  TONE_VISUALS,
  type Tone,
  edgeLabel,
  humanize,
  initials,
  personColor,
  toneOf,
} from "./visuals";

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ago(now: number, at: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export function Card({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-[560] tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function StatusPill({ status, type }: { status: string; type?: NodeType }) {
  const tone = toneOf(status);
  const color = TONE_VISUALS[tone].color;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[560] tracking-wide uppercase",
        tone === "dead" && "line-through",
      )}
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      title={type ? `${type} · ${status}` : status}
    >
      {humanize(status)}
    </span>
  );
}

function Donut({ counts, total }: { counts: [NodeType, number][]; total: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offsets = counts.map((_, index) =>
    counts.slice(0, index).reduce((sum, [, count]) => sum + (count / total) * circumference, 0),
  );
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90">
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        className="stroke-foreground/8"
        strokeWidth="11"
      />
      {counts.map(([type, count], index) => {
        const length = (count / total) * circumference;
        return (
          <circle
            key={type}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={NODE_VISUALS[type].color}
            strokeWidth="11"
            strokeDasharray={`${Math.max(length - 2.5, 0.5)} ${circumference}`}
            strokeDashoffset={-offsets[index]!}
            strokeLinecap="round"
            className="transition-[stroke-dasharray,stroke-dashoffset] duration-500"
          />
        );
      })}
    </svg>
  );
}

export function Overview({
  graph,
  hiddenTypes,
  onToggleType,
}: {
  graph: MeetingGraph;
  hiddenTypes: ReadonlySet<NodeType>;
  onToggleType: (type: NodeType) => void;
}) {
  const total = graph.nodes.length;
  const counts = NODE_TYPES.map(
    (type) => [type, graph.nodes.filter((node) => node.type === type).length] as [NodeType, number],
  );
  const present = counts.filter(([, count]) => count > 0);
  const tones: Record<Tone, number> = { open: 0, resolved: 0, contested: 0, dead: 0 };
  for (const node of graph.nodes) tones[toneOf(node.status)]++;
  const live = total - tones.dead;

  return (
    <Card
      title="Overview"
      aside={
        <span className="font-mono text-[11px] text-muted-foreground">
          {graph.edges.length} links
        </span>
      }
    >
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="font-mono text-4xl leading-none font-medium tracking-tight">
            {tones.open + tones.contested}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">still open</span>
        </div>
        {tones.contested > 0 && (
          <span className="rounded-full bg-[#f2b544]/15 px-2 py-0.5 font-mono text-[11px] text-[#f2b544]">
            {tones.contested} contested
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative">
          {total > 0 ? (
            <Donut counts={present} total={total} />
          ) : (
            <div className="size-28 rounded-full border-[11px] border-foreground/8" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl leading-none">{live}</span>
            <span className="mt-1 text-[10px] tracking-wider text-muted-foreground uppercase">
              nodes
            </span>
          </div>
        </div>

        <ul className="grid flex-1 gap-0.5">
          {counts.map(([type, count]) => {
            const hidden = hiddenTypes.has(type);
            return (
              <li key={type}>
                <button
                  type="button"
                  aria-pressed={!hidden}
                  disabled={count === 0}
                  onClick={() => onToggleType(type)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-1.5 py-0.5 text-left text-xs transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent",
                    hidden && "text-muted-foreground line-through",
                  )}
                >
                  <span
                    className="size-2.5 rounded-[3px]"
                    style={{
                      background: hidden ? "transparent" : NODE_VISUALS[type].color,
                      boxShadow: `inset 0 0 0 1.5px ${NODE_VISUALS[type].color}`,
                    }}
                  />
                  <span className="flex-1">{NODE_VISUALS[type].label}</span>
                  <span className="font-mono">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {total === 0 && <div className="h-full flex-1 bg-foreground/8" />}
          {(Object.keys(tones) as Tone[]).map(
            (tone) =>
              tones[tone] > 0 && (
                <div
                  key={tone}
                  className="h-full rounded-full transition-[flex-grow] duration-500"
                  style={{ flexGrow: tones[tone], background: TONE_VISUALS[tone].color }}
                />
              ),
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {(Object.keys(tones) as Tone[]).map((tone) => (
            <span key={tone} className="inline-flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ background: TONE_VISUALS[tone].color }}
              />
              {TONE_VISUALS[tone].label}{" "}
              <span className="font-mono text-foreground">{tones[tone]}</span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function describe(op: GraphOp): string {
  switch (op.kind) {
    case "create_node":
      return `Created as ${humanize(op.detail.status)}`;
    case "set_status":
      return `${humanize(op.detail.from)} → ${humanize(op.detail.to)}`;
    case "update_node":
      return `Edited ${Object.keys(op.detail.changed).join(", ") || "details"}`;
    case "merge_nodes":
      return `Merged with “${op.detail.title}”`;
    case "add_edge":
      return `${op.detail.corroborated ? "Corroborated" : "Linked"}: ${edgeLabel(op.detail.type)}`;
    case "delete_edge":
      return `Unlinked: ${edgeLabel(op.detail.type)}`;
    case "link_person":
      return `${op.detail.person.speaker} as ${humanize(op.detail.person.role)}`;
    case "unlink_person":
      return `${op.detail.person.speaker} removed as ${humanize(op.detail.person.role)}`;
    case "add_evidence":
      return "More evidence";
    case "delete_node":
      return "Removed";
  }
}

export function NodeDetail({
  node,
  graph,
  onSelect,
}: {
  node: GraphNode;
  graph: MeetingGraph;
  onSelect: (id: string) => void;
}) {
  const history = useNodeHistory(node.id, node.updatedAt);
  const visual = NODE_VISUALS[node.type];
  const byId = new Map(graph.nodes.map((item) => [item.id, item]));
  const connections = graph.edges
    .filter((edge) => edge.srcId === node.id || edge.dstId === node.id)
    .map((edge) => {
      const outgoing = edge.srcId === node.id;
      const other = byId.get(outgoing ? edge.dstId : edge.srcId);
      return { edge, outgoing, other };
    })
    .filter((item) => item.other);
  const ops = [...(history.data ?? [])].reverse();

  return (
    <Card
      title={visual.label.replace(/s$/, "")}
      aside={<StatusPill status={node.status} type={node.type} />}
      className="animate-rise"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl"
          style={{
            background: `color-mix(in srgb, ${visual.color} 16%, transparent)`,
            color: visual.color,
          }}
        >
          <visual.icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] leading-snug font-[560]">{node.title}</p>
          <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span>{node.origin}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round(node.confidence * 100)}%`,
                    background: visual.color,
                  }}
                />
              </span>
              {Math.round(node.confidence * 100)}%
            </span>
          </p>
        </div>
      </div>

      {node.people.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {node.people.map((person) => (
            <span
              key={`${person.speakerId}-${person.role}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-0.5 text-xs"
            >
              <span
                className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-black/75"
                style={{ background: personColor(person.speaker) }}
              >
                {initials(person.speaker)}
              </span>
              {person.speaker}
              <span className="text-muted-foreground">{humanize(person.role)}</span>
            </span>
          ))}
        </div>
      )}

      {connections.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[11px] font-[560] tracking-[0.08em] text-muted-foreground uppercase">
            Connections
          </h3>
          <ul className="grid gap-0.5">
            {connections.map(({ edge, outgoing, other }) => (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => onSelect(other!.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs hover:bg-muted"
                >
                  <span
                    className="inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px]"
                    style={{ color: FAMILY_VISUALS[edge.family].color }}
                  >
                    {!outgoing && "←"}
                    {edgeLabel(edge.type)}
                    {outgoing && "→"}
                  </span>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: NODE_VISUALS[other!.type].color }}
                  />
                  <span className="truncate">{other!.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 text-[11px] font-[560] tracking-[0.08em] text-muted-foreground uppercase">
          Evidence & history
        </h3>
        {history.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
        <ol className="relative grid gap-3 border-l border-border pl-4">
          {ops.map((op) => (
            <li key={op.id} className="relative">
              <span
                className="absolute top-1.5 -left-[20.5px] size-2 rounded-full ring-4 ring-card"
                style={{ background: visual.color }}
              />
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-[560]">{describe(op)}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  {time(op.createdAt)}
                </span>
              </div>
              {op.rationale && (
                <p className="mt-0.5 text-xs text-muted-foreground italic">{op.rationale}</p>
              )}
              {op.evidence.map((item) => (
                <blockquote
                  key={`${item.sessionId}-${item.captionId}-${item.quote}`}
                  className="mt-1.5 rounded-lg border-l-2 bg-muted/60 px-2.5 py-1.5 text-xs"
                  style={{ borderLeftColor: visual.color }}
                >
                  “{item.quote}”
                  <footer className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {item.speaker || "Unknown"}
                  </footer>
                </blockquote>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

const ACTIVITY_ICON = {
  node_added: PlusIcon,
  status_changed: ArrowRightIcon,
  edge_added: GitBranchIcon,
  node_removed: Trash2Icon,
} as const;

export function ActivityFeed({
  activity,
  onSelect,
}: {
  activity: Activity[];
  onSelect: (id: string) => void;
}) {
  const now = useNow();

  return (
    <Card
      title="Live activity"
      aside={
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 animate-pulse-soft rounded-full bg-ok" />
          watching
        </span>
      }
      className="flex min-h-0 flex-col"
    >
      {activity.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          New nodes, status changes and links show up here as they are made.
        </p>
      ) : (
        <ul className="grid gap-1">
          {activity.map((item) => {
            const Icon = ACTIVITY_ICON[item.kind];
            const color = item.nodeType ? NODE_VISUALS[item.nodeType].color : undefined;
            return (
              <li key={item.key} className="animate-rise">
                <button
                  type="button"
                  disabled={!item.nodeId}
                  onClick={() => item.nodeId && onSelect(item.nodeId)}
                  className="flex w-full items-start gap-2.5 rounded-xl px-1.5 py-1.5 text-left hover:bg-muted disabled:hover:bg-transparent"
                >
                  <span
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg"
                    style={{
                      color: color ?? "var(--muted)",
                      background: `color-mix(in srgb, ${color ?? "#8a8f98"} 16%, transparent)`,
                    }}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 text-xs leading-snug">
                    <span className="block truncate font-[560]">{item.title}</span>
                    <span className="block truncate text-muted-foreground">
                      {item.kind === "node_added" &&
                        `${item.nodeType ? NODE_VISUALS[item.nodeType].label.replace(/s$/, "") : "Node"} added`}
                      {item.kind === "status_changed" && (
                        <>
                          now <StatusPill status={item.status ?? ""} />
                        </>
                      )}
                      {item.kind === "edge_added" &&
                        `${edgeLabel(item.edgeType!)} → ${item.target}`}
                      {item.kind === "node_removed" && "Removed"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                    {ago(now, item.at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
