export type LayoutNode = {
  id: string;
  radius: number;
  /** How wide the node reads, label included. */
  width: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** While set, the node is held here (being dragged). */
  fx?: number;
  fy?: number;
};

export type LayoutLink = { source: string; target: string; distance: number; strength: number };

const REPULSION = 7000;
const REPULSION_RANGE = 640;
const GRAVITY = 0.012;
const DAMPING = 0.6;
const MIN_ALPHA = 0.012;

/**
 * A small force-directed layout: nodes push each other apart, links pull their ends to a rest
 * length and gravity keeps separate clusters on screen. Nodes keep their positions when the graph
 * changes, so a growing graph settles instead of reshuffling.
 */
export class ForceLayout {
  readonly nodes = new Map<string, LayoutNode>();
  private links: LayoutLink[] = [];
  private alpha = 1;

  /** Replaces the graph; existing nodes keep their place and new ones start next to a neighbour. */
  sync(nodes: { id: string; radius: number; width: number }[], links: LayoutLink[]) {
    const incoming = new Set(nodes.map((node) => node.id));
    let changed = false;
    for (const id of this.nodes.keys()) {
      if (!incoming.has(id)) {
        this.nodes.delete(id);
        changed = true;
      }
    }

    const neighbours = new Map<string, string[]>();
    const remember = (from: string, to: string) => {
      const list = neighbours.get(from) ?? [];
      list.push(to);
      neighbours.set(from, list);
    };
    for (const { source, target } of links) {
      remember(source, target);
      remember(target, source);
    }

    for (const { id, radius, width } of nodes) {
      const existing = this.nodes.get(id);
      if (existing) {
        existing.radius = radius;
        existing.width = width;
        continue;
      }
      changed = true;
      const anchor = neighbours
        .get(id)
        ?.map((other) => this.nodes.get(other))
        .find(Boolean);
      const angle = Math.random() * Math.PI * 2;
      const spread = anchor ? 40 : 60 + this.nodes.size * 6;
      this.nodes.set(id, {
        id,
        radius,
        width,
        x: (anchor?.x ?? 0) + Math.cos(angle) * spread,
        y: (anchor?.y ?? 0) + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
      });
    }

    const previous = this.links.length;
    this.links = links.filter((link) => this.nodes.has(link.source) && this.nodes.has(link.target));
    if (changed || this.links.length !== previous) this.reheat(0.7);
  }

  reheat(alpha = 0.5) {
    this.alpha = Math.max(this.alpha, alpha);
  }

  pin(id: string, x: number, y: number) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.fx = x;
    node.fy = y;
    this.reheat(0.3);
  }

  unpin(id: string) {
    const node = this.nodes.get(id);
    if (node) {
      node.fx = undefined;
      node.fy = undefined;
    }
  }

  get settled() {
    return this.alpha <= MIN_ALPHA;
  }

  tick() {
    if (this.settled) return;
    const list = [...this.nodes.values()];
    const strength = Math.max(this.alpha, 0.2);

    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 === 0) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        if (d < REPULSION_RANGE) {
          const push = (REPULSION * this.alpha) / d2;
          a.vx -= (dx / d) * push;
          a.vy -= (dy / d) * push;
          b.vx += (dx / d) * push;
          b.vy += (dy / d) * push;
        }
        // Labels are wider than they are tall, so nodes keep a box apart rather than a circle.
        const overlapX = (a.width + b.width) / 2 + 14 - Math.abs(dx);
        const overlapY = a.radius + b.radius + 44 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const shove = Math.sign(dx || Math.random() - 0.5) * overlapX * 0.12;
            a.vx -= shove;
            b.vx += shove;
          } else {
            const shove = Math.sign(dy || Math.random() - 0.5) * overlapY * 0.12;
            a.vy -= shove;
            b.vy += shove;
          }
        }
      }
    }

    for (const link of this.links) {
      const a = this.nodes.get(link.source)!;
      const b = this.nodes.get(link.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = ((d - link.distance) / d) * link.strength * strength;
      a.vx += dx * pull;
      a.vy += dy * pull;
      b.vx -= dx * pull;
      b.vy -= dy * pull;
    }

    for (const node of list) {
      if (node.fx !== undefined && node.fy !== undefined) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx -= node.x * GRAVITY * strength;
      node.vy -= node.y * GRAVITY * strength;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
    }

    this.alpha *= 0.985;
  }

  /** The box around every node (with room for labels), or nothing for an empty graph. */
  bounds() {
    if (this.nodes.size === 0) return undefined;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { x, y, radius } of this.nodes.values()) {
      minX = Math.min(minX, x - radius);
      minY = Math.min(minY, y - radius);
      maxX = Math.max(maxX, x + radius);
      maxY = Math.max(maxY, y + radius + 18);
    }
    return { minX, minY, maxX, maxY };
  }
}
