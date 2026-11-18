import { cn } from "@app/ui/lib/utils";
import type { StoredMeeting } from "@app/contracts";
import { sessionLabel } from "./session-label";
import { selectSession, useTranscriptStore } from "./transcript-store";

export function SessionList({ meetings }: { meetings: StoredMeeting[] }) {
  const selected = useTranscriptStore((state) => state.selectedSessionId);

  return (
    <div className="min-h-0 overflow-y-auto border-b md:border-r md:border-b-0">
      {meetings.map((meeting) => (
        <section key={meeting.id} className="border-b p-3">
          <h2 className="px-2 pb-1 text-[13px] font-[560]">{meeting.title}</h2>
          <ul className="grid gap-0.5">
            {meeting.sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  aria-current={session.id === selected ? "true" : undefined}
                  onClick={() => selectSession(session.id)}
                  className={cn(
                    "w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                    session.id === selected && "bg-muted text-foreground",
                  )}
                >
                  {sessionLabel(session)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
