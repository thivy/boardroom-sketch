import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { Input } from "@app/ui/components/input";
import { cn } from "@app/ui/lib/utils";
import { ChevronsUpDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useRecently } from "./clock-store";
import { chooseMeeting, setGraphQuery, useGraphViewStore } from "./graph-view-store";
import type { MeetingChoice } from "./use-live-graph";

const BUSY_MS = 5000;

type Meeting = MeetingChoice;

export function MeetingMenu({
  meetings,
  meeting,
}: {
  meetings: readonly Meeting[];
  meeting: Meeting | undefined;
}) {
  return (
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
          onValueChange={(value) => chooseMeeting(value as string)}
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
  );
}

export function BuildStatusBadge({
  meeting,
  changedAt,
}: {
  meeting: Meeting | undefined;
  changedAt: number | undefined;
}) {
  // "Building" fades back to idle some seconds after the last change.
  const building = useRecently(changedAt, BUSY_MS);

  if (!meeting) return null;
  return (
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
  );
}

export function GraphSearch() {
  const query = useGraphViewStore((state) => state.query);

  return (
    <div className="pointer-events-auto relative ml-auto w-full max-w-60 min-w-40">
      <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => setGraphQuery(event.target.value)}
        placeholder="Find a node or person"
        aria-label="Find a node or person"
        className="h-9 rounded-xl border-border bg-card/80 pr-8 pl-8 backdrop-blur"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setGraphQuery("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
