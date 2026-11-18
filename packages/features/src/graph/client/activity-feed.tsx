import { ArrowRightIcon, GitBranchIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { Activity } from "./activity";
import { Card, StatusPill, ago } from "./panel-parts";
import { useNow } from "./clock-store";
import { NODE_VISUALS, edgeLabel } from "./visuals";

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
