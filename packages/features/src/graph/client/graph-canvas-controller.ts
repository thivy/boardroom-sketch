import { EDGE_RULES, type GraphEdge, type GraphNode } from "@app/contracts";
import { ForceLayout, type LayoutLink } from "./force-layout";
import { setFollowing } from "./graph-canvas-store";

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

type PointerLike = { clientX: number; clientY: number; pointerId: number };

export type CanvasModel = {
  nodes: { node: GraphNode; radius: number }[];
  edges: GraphEdge[];
  curves: Map<string, number>;
  links: LayoutLink[];
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const LOW_ZOOM = 0.55;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Owns the imperative canvas state: the layout, the view, the drag and the animation loop. */
export function createCanvasController() {
  const layout = new ForceLayout();
  const nodeEls = new Map<string, SVGGElement>();
  const edgeEls = new Map<string, SVGGElement>();
  const view: View = { x: 0, y: 0, k: 1 };
  let dirty = true;
  let autoFit = true;
  let drag: Drag | null = null;
  let svg: SVGSVGElement | null = null;
  let model: CanvasModel | undefined;

  const sync = (next: CanvasModel) => {
    if (model === next) return;
    model = next;
    layout.sync(
      next.nodes.map(({ node, radius }) => ({
        id: node.id,
        radius,
        width: Math.max(radius * 2, Math.min(node.title.length, 26) * 6.4),
      })),
      next.links,
    );
    dirty = true;
  };

  const attach = (element: SVGSVGElement) => {
    svg = element;
    const world = element.querySelector<SVGGElement>("[data-world]");
    const pattern = element.querySelector<SVGPatternElement>("[data-pattern]");

    const target = (): View => {
      const { width, height } = element.getBoundingClientRect();
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
      const current = model;
      if (current) {
        for (const { node } of current.nodes) {
          const position = layout.nodes.get(node.id);
          nodeEls
            .get(node.id)
            ?.setAttribute(
              "transform",
              `translate(${position?.x.toFixed(1)} ${position?.y.toFixed(1)})`,
            );
        }

        for (const edge of current.edges) {
          const group = edgeEls.get(edge.id);
          const from = layout.nodes.get(edge.srcId);
          const to = layout.nodes.get(edge.dstId);
          if (!group || !from || !to) continue;

          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.hypot(dx, dy) || 1;
          const bend = (current.curves.get(edge.id) ?? 0) * length;
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
      }

      const { x, y, k } = view;
      world?.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
      pattern?.setAttribute("patternTransform", `translate(${x} ${y}) scale(${k})`);
      element.dataset.zoom = k < LOW_ZOOM ? "low" : "high";
    };

    let frame = 0;
    const step = () => {
      layout.tick();
      let animating = false;
      if (autoFit) {
        const goal = target();
        const current = view;
        current.x += (goal.x - current.x) * 0.12;
        current.y += (goal.y - current.y) * 0.12;
        current.k += (goal.k - current.k) * 0.12;
        animating =
          Math.abs(goal.x - current.x) > 0.5 ||
          Math.abs(goal.y - current.y) > 0.5 ||
          Math.abs(goal.k - current.k) > 0.002;
      }
      if (!layout.settled || animating || dirty) paint();
      dirty = false;
      frame = requestAnimationFrame(step);
    };
    paint();
    frame = requestAnimationFrame(step);

    const resize = new ResizeObserver(() => (dirty = true));
    resize.observe(element);

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = view;
      const k = clamp(current.k * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      current.x = px - ((px - current.x) / current.k) * k;
      current.y = py - ((py - current.y) / current.k) * k;
      current.k = k;
      autoFit = false;
      setFollowing(false);
      dirty = true;
    };
    element.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      element.removeEventListener("wheel", wheel);
      if (svg === element) svg = null;
    };
  };

  const toWorld = (event: PointerLike) => {
    const rect = svg!.getBoundingClientRect();
    const { x, y, k } = view;
    return { x: (event.clientX - rect.left - x) / k, y: (event.clientY - rect.top - y) / k };
  };

  const startPan = (event: PointerLike) => {
    svg?.setPointerCapture(event.pointerId);
    drag = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      view: { ...view },
      moved: false,
    };
  };

  const startNodeDrag = (event: PointerLike, id: string) => {
    svg?.setPointerCapture(event.pointerId);
    const point = toWorld(event);
    const node = layout.nodes.get(id);
    drag = {
      kind: "node",
      id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: (node?.x ?? point.x) - point.x,
      offsetY: (node?.y ?? point.y) - point.y,
      moved: false,
    };
  };

  const move = (event: PointerLike) => {
    const current = drag;
    if (!current) return;
    const travelled = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
    if (travelled > 4) current.moved = true;
    if (!current.moved) return;

    if (current.kind === "pan") {
      view.x = current.view.x + event.clientX - current.startX;
      view.y = current.view.y + event.clientY - current.startY;
      autoFit = false;
      setFollowing(false);
      dirty = true;
    } else {
      const point = toWorld(event);
      layout.pin(current.id, point.x + current.offsetX, point.y + current.offsetY);
    }
  };

  /** Ends the drag; returns what the pointer did when it was a click rather than a drag. */
  const release = (): { select: string | undefined } | undefined => {
    const current = drag;
    drag = null;
    if (!current) return undefined;
    if (current.kind === "node") {
      layout.unpin(current.id);
      if (!current.moved) return { select: current.id };
    } else if (!current.moved) {
      return { select: undefined };
    }
    return undefined;
  };

  const zoomBy = (factor: number) => {
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const current = view;
    const k = clamp(current.k * factor, MIN_ZOOM, MAX_ZOOM);
    current.x = width / 2 - ((width / 2 - current.x) / current.k) * k;
    current.y = height / 2 - ((height / 2 - current.y) / current.k) * k;
    current.k = k;
    autoFit = false;
    setFollowing(false);
    dirty = true;
  };

  const fit = () => {
    autoFit = true;
    setFollowing(true);
    dirty = true;
  };

  const registerNode = (id: string, element: SVGGElement | null) => {
    if (element) nodeEls.set(id, element);
    else nodeEls.delete(id);
  };

  const registerEdge = (id: string, element: SVGGElement | null) => {
    if (element) edgeEls.set(id, element);
    else edgeEls.delete(id);
  };

  return {
    sync,
    attach,
    startPan,
    startNodeDrag,
    move,
    release,
    zoomBy,
    fit,
    registerNode,
    registerEdge,
  };
}

export type CanvasController = ReturnType<typeof createCanvasController>;
