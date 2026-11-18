import { EDGE_RULES, type GraphEdge, type MeetingGraph, type NodeType } from "@app/contracts";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { CheckIcon, MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useCallback, useId, useMemo } from "react";
import { createCanvasController } from "./graph-canvas-controller";
import { setHoveredNode, useGraphCanvasStore } from "./graph-canvas-store";
import { useGraphViewStore } from "./graph-view-store";
import {
  FAMILY_VISUALS,
  NODE_VISUALS,
  TONE_VISUALS,
  edgeLabel,
  humanize,
  nodeRadius,
  toneOf,
} from "./visuals";

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export type GraphCanvasProps = {
  graph: MeetingGraph;
  hiddenTypes: ReadonlySet<NodeType>;
  selectedId?: string;
  /** Nodes that just appeared or changed, with when; they get a ring that fades. */
  fresh: ReadonlyMap<string, number>;
  onSelect: (id: string | undefined) => void;
  /** Shown over the canvas, for an empty or loading graph. */
  children?: ReactNode;
};

export function GraphCanvas({
  graph,
  hiddenTypes,
  selectedId,
  fresh,
  onSelect,
  children,
}: GraphCanvasProps) {
  const query = useGraphViewStore((state) => state.query);
  const uid = useId().replaceAll(":", "");
  const controller = useMemo(() => createCanvasController(), []);
  const attach = useCallback((svg: SVGSVGElement) => controller.attach(svg), [controller]);
  const following = useGraphCanvasStore((state) => state.following);
  const hover = useGraphCanvasStore((state) => state.hoveredNodeId);

  const model = useMemo(() => {
    const nodes = graph.nodes.filter((node) => !hiddenTypes.has(node.type));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => ids.has(edge.srcId) && ids.has(edge.dstId));

    const degree = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>(nodes.map((node) => [node.id, new Set()]));
    for (const { srcId, dstId } of edges) {
      degree.set(srcId, (degree.get(srcId) ?? 0) + 1);
      degree.set(dstId, (degree.get(dstId) ?? 0) + 1);
      adjacency.get(srcId)?.add(dstId);
      adjacency.get(dstId)?.add(srcId);
    }

    // Edges between the same two nodes fan out instead of overlapping.
    const pairs = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
      const key = [edge.srcId, edge.dstId].sort().join("|");
      pairs.set(key, [...(pairs.get(key) ?? []), edge]);
    }
    const curves = new Map<string, number>();
    for (const group of pairs.values()) {
      group.forEach((edge, index) => {
        const sign = edge.srcId < edge.dstId ? 1 : -1;
        curves.set(edge.id, sign * (0.12 + (index - (group.length - 1) / 2) * 0.22));
      });
    }

    const topicLinks = nodes
      .filter((node) => node.topicId && ids.has(node.topicId))
      .filter((node) => !adjacency.get(node.id)?.has(node.topicId!))
      .map((node) => ({
        source: node.topicId!,
        target: node.id,
        distance: 180,
        strength: 0.03,
      }));

    return {
      nodes: nodes.map((node) => ({
        node,
        radius: nodeRadius(node.type, degree.get(node.id) ?? 0),
      })),
      edges,
      adjacency,
      curves,
      links: [
        ...edges.map((edge) => ({
          source: edge.srcId,
          target: edge.dstId,
          distance: edge.family === "struct" ? 170 : 140,
          strength: edge.family === "struct" ? 0.06 : 0.09,
        })),
        ...topicLinks,
      ],
    };
  }, [graph, hiddenTypes]);

  controller.sync(model);

  const release = () => {
    const clicked = controller.release();
    if (clicked) onSelect(clicked.select);
  };

  const active = hover ?? selectedId;
  const linked = active ? model.adjacency.get(active) : undefined;
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? new Set(
        model.nodes
          .filter(({ node }) =>
            [node.title, node.type, node.status, ...node.people.map((person) => person.speaker)]
              .join(" ")
              .toLowerCase()
              .includes(needle),
          )
          .map(({ node }) => node.id),
      )
    : undefined;

  const families = [...new Set(model.edges.map((edge) => edge.family))];

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-[inherit]">
      <svg
        ref={attach}
        data-zoom="high"
        className="group/graph size-full touch-none cursor-grab select-none active:cursor-grabbing"
        onPointerDown={controller.startPan}
        onPointerMove={controller.move}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <defs>
          <pattern
            data-pattern
            id={`${uid}-dots`}
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="1.1" className="fill-foreground/10" />
          </pattern>
          {Object.entries(FAMILY_VISUALS).map(([family, { color }]) => (
            <marker
              key={family}
              id={`${uid}-arrow-${family}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M1 1.5 9 5 1 8.5 3 5z" fill={color} />
            </marker>
          ))}
        </defs>
        <rect width="100%" height="100%" fill={`url(#${uid}-dots)`} />

        <g data-world>
          <g>
            {model.edges.map((edge) => {
              const { color, dash } = FAMILY_VISUALS[edge.family];
              const symmetric = EDGE_RULES[edge.type].symmetric;
              const touching =
                active !== undefined && (edge.srcId === active || edge.dstId === active);
              const dimmed = (active !== undefined && !touching) || matches !== undefined;
              return (
                <g
                  key={edge.id}
                  ref={(element) => controller.registerEdge(edge.id, element)}
                  className={cn(
                    "transition-opacity duration-200",
                    dimmed ? "opacity-10" : "opacity-100",
                  )}
                >
                  <path
                    fill="none"
                    stroke={color}
                    strokeWidth={touching ? 2 : 1.4}
                    strokeOpacity={touching ? 1 : 0.35 + edge.confidence * 0.4}
                    strokeDasharray={edge.origin === "inferred" ? "5 4" : dash}
                    strokeLinecap="round"
                    markerEnd={symmetric ? undefined : `url(#${uid}-arrow-${edge.family})`}
                  />
                  <path fill="none" stroke="transparent" strokeWidth={12}>
                    <title>
                      {`${edgeLabel(edge.type)} · ${edge.origin}${edge.rationale ? ` — ${edge.rationale}` : ""}`}
                    </title>
                  </path>
                  <text
                    textAnchor="middle"
                    dy="-4"
                    fontSize="10"
                    fill={color}
                    className={cn(
                      "pointer-events-none stroke-background font-medium [paint-order:stroke]",
                      touching ? "opacity-100" : "opacity-0",
                    )}
                    strokeWidth={3}
                    strokeLinejoin="round"
                  >
                    {edgeLabel(edge.type)}
                  </text>
                </g>
              );
            })}
          </g>

          <g>
            {model.nodes.map(({ node, radius }) => {
              const { color, icon: Icon } = NODE_VISUALS[node.type];
              const tone = toneOf(node.status);
              const selected = node.id === selectedId;
              const isFresh = fresh.has(node.id);
              const dimmed =
                (linked !== undefined && node.id !== active && !linked.has(node.id)) ||
                (matches !== undefined && !matches.has(node.id));
              const resting = tone === "dead" ? 0.45 : 1;

              return (
                <g
                  key={node.id}
                  ref={(element) => controller.registerNode(node.id, element)}
                  className="cursor-pointer"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    controller.startNodeDrag(event, node.id);
                  }}
                  onPointerEnter={() => setHoveredNode(node.id)}
                  onPointerLeave={() => setHoveredNode(undefined)}
                >
                  <g
                    className="origin-center animate-[node-pop_360ms_cubic-bezier(0.2,1.2,0.4,1)_both] transition-opacity duration-200 [transform-box:fill-box]"
                    style={{ opacity: dimmed ? 0.14 : resting }}
                  >
                    {isFresh && (
                      <circle
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        className="origin-center animate-ring [transform-box:fill-box]"
                      />
                    )}
                    {tone === "contested" && (
                      <circle
                        r={radius + 5}
                        fill="none"
                        stroke={TONE_VISUALS.contested.color}
                        strokeWidth={1.5}
                        strokeDasharray="3 4"
                        className="animate-pulse-soft"
                      />
                    )}
                    {selected && (
                      <circle
                        r={radius + 7}
                        fill="none"
                        className="stroke-foreground"
                        strokeWidth={1.5}
                      />
                    )}
                    <circle
                      r={radius}
                      fill={color}
                      fillOpacity={tone === "resolved" ? 1 : 0.16}
                      stroke={color}
                      strokeWidth={1.6}
                      strokeDasharray={tone === "dead" ? "3 3" : undefined}
                      className={
                        node.origin === "human" ? "drop-shadow-[0_0_6px_var(--accent)]" : ""
                      }
                    />
                    <Icon
                      x={-radius * 0.5}
                      y={-radius * 0.5}
                      width={radius}
                      height={radius}
                      strokeWidth={2.2}
                      color={tone === "resolved" ? "#101112" : color}
                    />
                    <text
                      y={radius + 14}
                      textAnchor="middle"
                      fontSize="11.5"
                      className={cn(
                        "pointer-events-none fill-foreground stroke-background font-[560] [paint-order:stroke] group-data-[zoom=low]/graph:opacity-0",
                        node.type === "topic" && "group-data-[zoom=low]/graph:opacity-100",
                        tone === "dead" && "line-through",
                      )}
                      strokeWidth={3.5}
                      strokeLinejoin="round"
                    >
                      {truncate(node.title, node.type === "topic" ? 30 : 26)}
                      <tspan
                        x={0}
                        dy={12}
                        fontSize="9.5"
                        letterSpacing="0.04em"
                        className="fill-muted-foreground font-normal uppercase"
                      >
                        {humanize(node.status)}
                      </tspan>
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-xl border bg-card/80 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {families.map((family) => (
            <span key={family} className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: FAMILY_VISUALS[family].color }}
              />
              {FAMILY_VISUALS[family].label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(["open", "resolved", "contested", "dead"] as const).map((tone) => (
            <span key={tone} className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2.5 rounded-full border-[1.5px]",
                  tone === "dead" && "border-dashed",
                )}
                style={{
                  borderColor: TONE_VISUALS[tone].color,
                  background: tone === "resolved" ? TONE_VISUALS[tone].color : "transparent",
                }}
              />
              {TONE_VISUALS[tone].label}
            </span>
          ))}
        </div>
      </div>

      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-xl border bg-card/80 p-1 backdrop-blur">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => controller.zoomBy(0.8)}
        >
          <MinusIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          onClick={() => controller.zoomBy(1.25)}
        >
          <PlusIcon />
        </Button>
        <Button
          variant={following ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={following}
          onClick={controller.fit}
        >
          {following ? <CheckIcon /> : <MaximizeIcon />}
          Fit
        </Button>
      </div>

      {children}
    </div>
  );
}
