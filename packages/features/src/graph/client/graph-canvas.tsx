import { EDGE_RULES, type GraphEdge, type MeetingGraph, type NodeType } from "@app/contracts";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { CheckIcon, MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  resetGraphCanvasStore,
  setFollowing,
  setHoveredNode,
  useGraphCanvasStore,
} from "./graph-canvas-store";
import { ForceLayout } from "./force-layout";
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

type View = { x: number; y: number; k: number };
type Drag =
  | { kind: "pan"; startX: number; startY: number; view: View; moved: boolean }
  | {
      kind: "node";
      id: string;
      startX: number;
      startY: number;
      offsetX: number;
      offsetY: number;
      moved: boolean;
    };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const LOW_ZOOM = 0.55;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
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
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const patternRef = useRef<SVGPatternElement>(null);
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const edgeEls = useRef(new Map<string, SVGGElement>());
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const dirty = useRef(true);
  const autoFit = useRef(true);
  const drag = useRef<Drag | null>(null);
  const layout = useMemo(() => new ForceLayout(), []);
  const following = useGraphCanvasStore((state) => state.following);
  const hover = useGraphCanvasStore((state) => state.hoveredNodeId);

  useEffect(() => resetGraphCanvasStore, []);

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

  const modelRef = useRef(model);

  useLayoutEffect(() => {
    modelRef.current = model;
    layout.sync(
      model.nodes.map(({ node, radius }) => ({
        id: node.id,
        radius,
        width: Math.max(radius * 2, Math.min(node.title.length, 26) * 6.4),
      })),
      model.links,
    );
    dirty.current = true;
  }, [layout, model]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const target = (): View => {
      const { width, height } = svg.getBoundingClientRect();
      const bounds = layout.bounds();
      if (!bounds) return { x: width / 2, y: height / 2, k: 1 };
      const pad = 72;
      const k = clamp(
        Math.min(
          (width - pad * 2) / Math.max(bounds.maxX - bounds.minX, 1),
          (height - pad * 2) / Math.max(bounds.maxY - bounds.minY, 1),
        ),
        MIN_ZOOM,
        1.25,
      );
      return {
        k,
        x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
        y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
      };
    };

    const paint = () => {
      for (const { node } of modelRef.current.nodes) {
        const position = layout.nodes.get(node.id);
        nodeEls.current
          .get(node.id)
          ?.setAttribute(
            "transform",
            `translate(${position?.x.toFixed(1)} ${position?.y.toFixed(1)})`,
          );
      }

      for (const edge of modelRef.current.edges) {
        const group = edgeEls.current.get(edge.id);
        const from = layout.nodes.get(edge.srcId);
        const to = layout.nodes.get(edge.dstId);
        if (!group || !from || !to) continue;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const bend = (modelRef.current.curves.get(edge.id) ?? 0) * length;
        const cx = (from.x + to.x) / 2 - (dy / length) * bend;
        const cy = (from.y + to.y) / 2 + (dx / length) * bend;
        const startLength = Math.hypot(cx - from.x, cy - from.y) || 1;
        const endLength = Math.hypot(cx - to.x, cy - to.y) || 1;
        const gap = to.radius + (EDGE_RULES[edge.type].symmetric ? 3 : 8);
        const sx = from.x + ((cx - from.x) / startLength) * (from.radius + 3);
        const sy = from.y + ((cy - from.y) / startLength) * (from.radius + 3);
        const ex = to.x + ((cx - to.x) / endLength) * gap;
        const ey = to.y + ((cy - to.y) / endLength) * gap;
        const path = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;

        const [line, hit, label] = Array.from(group.children);
        line?.setAttribute("d", path);
        hit?.setAttribute("d", path);
        label?.setAttribute("x", ((sx + 2 * cx + ex) / 4).toFixed(1));
        label?.setAttribute("y", ((sy + 2 * cy + ey) / 4).toFixed(1));
      }

      const { x, y, k } = view.current;
      worldRef.current?.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
      patternRef.current?.setAttribute("patternTransform", `translate(${x} ${y}) scale(${k})`);
      svg.dataset.zoom = k < LOW_ZOOM ? "low" : "high";
    };

    let frame = 0;
    const step = () => {
      layout.tick();
      let animating = false;
      if (autoFit.current) {
        const goal = target();
        const current = view.current;
        current.x += (goal.x - current.x) * 0.12;
        current.y += (goal.y - current.y) * 0.12;
        current.k += (goal.k - current.k) * 0.12;
        animating =
          Math.abs(goal.x - current.x) > 0.5 ||
          Math.abs(goal.y - current.y) > 0.5 ||
          Math.abs(goal.k - current.k) > 0.002;
      }
      if (!layout.settled || animating || dirty.current) paint();
      dirty.current = false;
      frame = requestAnimationFrame(step);
    };
    paint();
    frame = requestAnimationFrame(step);

    const resize = new ResizeObserver(() => (dirty.current = true));
    resize.observe(svg);

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const current = view.current;
      const k = clamp(current.k * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      current.x = px - ((px - current.x) / current.k) * k;
      current.y = py - ((py - current.y) / current.k) * k;
      current.k = k;
      autoFit.current = false;
      setFollowing(false);
      dirty.current = true;
    };
    svg.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      svg.removeEventListener("wheel", wheel);
    };
  }, [layout]);

  const world = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const { x, y, k } = view.current;
    return { x: (event.clientX - rect.left - x) / k, y: (event.clientY - rect.top - y) / k };
  };

  const startPan = (event: PointerEvent) => {
    svgRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      view: { ...view.current },
      moved: false,
    };
  };

  const startNodeDrag = (event: PointerEvent, id: string) => {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    const point = world(event);
    const node = layout.nodes.get(id);
    drag.current = {
      kind: "node",
      id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: (node?.x ?? point.x) - point.x,
      offsetY: (node?.y ?? point.y) - point.y,
      moved: false,
    };
  };

  const onMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const travelled = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
    if (travelled > 4) current.moved = true;
    if (!current.moved) return;

    if (current.kind === "pan") {
      view.current.x = current.view.x + event.clientX - current.startX;
      view.current.y = current.view.y + event.clientY - current.startY;
      autoFit.current = false;
      setFollowing(false);
      dirty.current = true;
    } else {
      const point = world(event);
      layout.pin(current.id, point.x + current.offsetX, point.y + current.offsetY);
    }
  };

  const onUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (current.kind === "node") {
      layout.unpin(current.id);
      if (!current.moved) onSelect(current.id);
    } else if (!current.moved) {
      onSelect(undefined);
    }
  };

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const current = view.current;
    const k = clamp(current.k * factor, MIN_ZOOM, MAX_ZOOM);
    current.x = width / 2 - ((width / 2 - current.x) / current.k) * k;
    current.y = height / 2 - ((height / 2 - current.y) / current.k) * k;
    current.k = k;
    autoFit.current = false;
    setFollowing(false);
    dirty.current = true;
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
        ref={svgRef}
        data-zoom="high"
        className="group/graph size-full touch-none cursor-grab select-none active:cursor-grabbing"
        onPointerDown={startPan}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <pattern
            ref={patternRef}
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

        <g ref={worldRef}>
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
                  ref={(element) => {
                    if (element) edgeEls.current.set(edge.id, element);
                    else edgeEls.current.delete(edge.id);
                  }}
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
                  ref={(element) => {
                    if (element) nodeEls.current.set(node.id, element);
                    else nodeEls.current.delete(node.id);
                  }}
                  className="cursor-pointer"
                  onPointerDown={(event) => startNodeDrag(event, node.id)}
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
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
          <MinusIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          <PlusIcon />
        </Button>
        <Button
          variant={following ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={following}
          onClick={() => {
            autoFit.current = true;
            setFollowing(true);
            dirty.current = true;
          }}
        >
          {following ? <CheckIcon /> : <MaximizeIcon />}
          Fit
        </Button>
      </div>

      {children}
    </div>
  );
}
