import { TranscriptsPage } from "@app/features/captions/client";
import { BuildGraphButton } from "@app/features/graph/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/transcripts")({
  component: TranscriptsRoute,
});

// Routes compose features: the transcripts page has a slot for what to offer on a session, and the
// graph feature fills it, so neither feature knows about the other.
function TranscriptsRoute() {
  return (
    <TranscriptsPage
      actions={({ session, meeting }) => (
        <BuildGraphButton session={session} meetingId={meeting.id} />
      )}
    />
  );
}
