import type { GraphNode, GraphOp, MeetingGraph } from "@app/contracts";
import { useMemo } from "react";
import { Card, StatusPill, time } from "./panel-parts";
import { useNodeHistory } from "./use-live-graph";
import {
  FAMILY_VISUALS,
  NODE_VISUALS,
  edgeLabel,
  humanize,
  initials,
  personColor,
} from "./visuals";

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
  const connections = useMemo(() => {
    const byId = new Map(graph.nodes.map((item) => [item.id, item]));
    return graph.edges
      .filter((edge) => edge.srcId === node.id || edge.dstId === node.id)
      .map((edge) => {
        const outgoing = edge.srcId === node.id;
        const other = byId.get(outgoing ? edge.dstId : edge.srcId);
        return { edge, outgoing, other };
      })
      .filter((item) => item.other);
  }, [graph, node.id]);
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
