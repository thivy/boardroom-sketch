import { Empty, EmptyDescription, EmptyHeader } from "@app/ui/components/empty";
import { NetworkIcon } from "lucide-react";
import { AppHeader } from "../../app-header";
import { GraphCanvas } from "./graph-canvas";
import { BuildStatusBadge, GraphSearch, MeetingMenu } from "./graph-toolbar";
import { selectNode, toggleNodeType, useGraphViewStore } from "./graph-view-store";
import { ActivityFeed } from "./activity-feed";
import { NodeDetail } from "./node-detail";
import { Overview } from "./overview";
import { LiveGraphSwitch } from "./live-graph-switch";
import { useLiveGraph, useMeetings } from "./use-live-graph";

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
  const chosen = useGraphViewStore((state) => state.chosenMeetingId) ?? initialMeeting;
  const selectedId = useGraphViewStore((state) => state.selectedNodeId);
  const hiddenTypes = useGraphViewStore((state) => state.hiddenTypes);

  const meeting = meetings.find((item) => item.id === chosen) ?? meetings[0];
  const { graph, isError, error, isLoading, activity, fresh, changedAt } = useLiveGraph(
    meeting?.id,
  );

  const selected = graph?.nodes.find((node) => node.id === selectedId);

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
              selectedId={selected?.id}
              fresh={fresh}
              onSelect={selectNode}
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
            <MeetingMenu meetings={meetings} meeting={meeting} />
            <BuildStatusBadge meeting={meeting} changedAt={changedAt} />
            <LiveGraphSwitch className="pointer-events-auto h-9 rounded-xl border bg-card/80 px-3 backdrop-blur" />
            <GraphSearch />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          {graph && (
            <Overview graph={graph} hiddenTypes={hiddenTypes} onToggleType={toggleNodeType} />
          )}
          {graph && selected && (
            <NodeDetail key={selected.id} node={selected} graph={graph} onSelect={selectNode} />
          )}
          {graph && <ActivityFeed activity={activity} onSelect={selectNode} />}
        </aside>
      </div>
    </div>
  );
}
