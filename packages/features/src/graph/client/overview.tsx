import { cn } from "@app/ui/lib/utils";
import type { MeetingGraph, NodeType } from "@app/contracts";
import { NODE_TYPES } from "@app/contracts";
import { Card } from "./panel-parts";
import { NODE_VISUALS, TONE_VISUALS, type Tone, toneOf } from "./visuals";

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
  // One pass over the nodes for both the per-type counts and the per-tone counts.
  const countByType = new Map<NodeType, number>();
  const tones: Record<Tone, number> = { open: 0, resolved: 0, contested: 0, dead: 0 };
  for (const node of graph.nodes) {
    countByType.set(node.type, (countByType.get(node.type) ?? 0) + 1);
    tones[toneOf(node.status)]++;
  }
  const counts = NODE_TYPES.map((type) => [type, countByType.get(type) ?? 0] as [NodeType, number]);
  const present = counts.filter(([, count]) => count > 0);
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
