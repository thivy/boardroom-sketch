import { TranscriptsPage, type SessionActions } from "@app/features/captions/client";
import { BuildGraphButton } from "@app/features/graph/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/transcripts")({
  component: TranscriptsRoute,
});

const sessionActions: SessionActions = ({ session, meeting }) => (
  <BuildGraphButton session={session} meetingId={meeting.id} />
);

// Routes compose features: the transcripts page has a slot for what to offer on a session, and the
// graph feature fills it, so neither feature knows about the other.
function TranscriptsRoute() {
  return <TranscriptsPage actions={sessionActions} />;
}
