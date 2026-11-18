import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader } from "@app/ui/components/empty";
import { Input } from "@app/ui/components/input";
import { cn } from "@app/ui/lib/utils";
import type { NodeType } from "@app/contracts";
import { ChevronsUpDownIcon, NetworkIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { AppHeader } from "../../app-header";
import { GraphCanvas } from "./graph-canvas";
import { ActivityFeed } from "./activity-feed";
import { NodeDetail } from "./node-detail";
import { Overview } from "./overview";
import { LiveGraphSwitch } from "./live-graph-switch";
import { useLiveGraph, useMeetings } from "./use-live-graph";
import { useNow } from "./use-now";

const BUSY_MS = 5000;

function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl border bg-muted text-muted-foreground">
            <NetworkIcon className="size-5" />
          </div>
          <p className="text-sm font-[560]">{title}</p>
          <EmptyDescription>{children}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function GraphPage({ meeting: initialMeeting }: { meeting?: string } = {}) {
  const { meetings, loading } = useMeetings();
  const [chosen, setChosen] = useState<string | undefined>(initialMeeting);
  const [selectedId, setSelectedId] = useState<string>();
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<NodeType>>(new Set());
  const [query, setQuery] = useState("");

  const meeting = meetings.find((item) => item.id === chosen) ?? meetings[0];
  const { graph, isError, error, isLoading, activity, fresh, changedAt } = useLiveGraph(
    meeting?.id,
  );

  // "Building" fades back to idle some seconds after the last change.
  const now = useNow(1000);
  const building = changedAt !== undefined && now - changedAt < BUSY_MS;

  const selected = graph?.nodes.find((node) => node.id === selectedId);

  const select = (id: string | undefined) => setSelectedId(id);
  const toggleType = (type: NodeType) =>
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (!next.delete(type)) next.add(type);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader title="Meeting graph" />

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_23rem] lg:overflow-hidden">
        <section className="relative min-h-[26rem] overflow-hidden rounded-2xl border bg-card">
          {graph && (
            <GraphCanvas
              key={meeting?.id}
              graph={graph}
              hiddenTypes={hiddenTypes}
              query={query}
              selectedId={selected?.id}
              fresh={fresh}
              onSelect={select}
            />
          )}

          {!meeting && !loading && (
            <Placeholder title="No meetings yet">
              Record a meeting on the Teams captions page. Switch on Build graph live there, or
              press Generate graph on a saved transcript.
            </Placeholder>
          )}
          {meeting && isLoading && <Placeholder title="Loading graph">One moment…</Placeholder>}
          {isError && <Placeholder title="Could not load the graph">{error?.message}</Placeholder>}
          {graph && graph.nodes.length === 0 && (
            <Placeholder title="Waiting for the first node">
              Decisions, actions, questions and risks appear here as they are said. The graph is
              only built live while Build graph live is switched on; for a saved transcript, press
              Generate graph on the Transcripts page.
            </Placeholder>
          )}

          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="pointer-events-auto h-9 max-w-[18rem] gap-2 rounded-xl bg-card/80 backdrop-blur"
                  />
                }
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    meeting?.live ? "animate-pulse-soft bg-destructive" : "bg-muted-foreground/50",
                  )}
                />
                <span className="truncate">{meeting?.title ?? "Choose a meeting"}</span>
                <ChevronsUpDownIcon className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80">
                <DropdownMenuRadioGroup
                  value={meeting?.id}
                  onValueChange={(value) => {
                    setChosen(value as string);
                    setSelectedId(undefined);
                  }}
                >
                  {meetings.map((item) => (
                    <DropdownMenuRadioItem key={item.id} value={item.id}>
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          item.live ? "bg-destructive" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="truncate">{item.title}</span>
                      {item.live && (
                        <span className="text-[10px] font-[560] tracking-wider text-destructive uppercase">
                          live
                        </span>
                      )}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {meeting && (
              <span
                className={cn(
                  "pointer-events-auto inline-flex h-9 items-center gap-2 rounded-xl border bg-card/80 px-3 text-xs backdrop-blur",
                  building ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    building
                      ? "animate-pulse-soft bg-primary"
                      : meeting.live
                        ? "bg-ok"
                        : "bg-muted-foreground/50",
                  )}
                />
                {building ? "Building…" : meeting.live ? "Live" : "Recorded"}
              </span>
            )}

            <LiveGraphSwitch className="pointer-events-auto h-9 rounded-xl border bg-card/80 px-3 backdrop-blur" />
            <div className="pointer-events-auto relative ml-auto w-full max-w-60 min-w-40">
              <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a node or person"
                aria-label="Find a node or person"
                className="h-9 rounded-xl border-border bg-card/80 pr-8 pl-8 backdrop-blur"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          {graph && <Overview graph={graph} hiddenTypes={hiddenTypes} onToggleType={toggleType} />}
          {graph && selected && (
            <NodeDetail key={selected.id} node={selected} graph={graph} onSelect={select} />
          )}
          {graph && <ActivityFeed activity={activity} onSelect={select} />}
        </aside>
      </div>
    </div>
  );
}
