import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/ui/components/alert-dialog";
import type { StoredSession } from "@app/contracts";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { request } from "../../shared/client/api-request";
import { sessionLabel } from "./session-label";
import { cancelDelete, finishDelete, useTranscriptStore } from "./transcript-store";

const DELETE_KEY = ["transcripts", "delete"];

/** The confirmation. Its content is a fresh component for every session, so it never shows an old error. */
export function DeleteTranscriptDialog() {
  const deleting = useTranscriptStore((state) => state.deleting);
  const pending = useIsMutating({ mutationKey: DELETE_KEY }) > 0;

  return (
    <AlertDialog
      open={deleting !== undefined}
      onOpenChange={(open, details) => {
        if (open) return;
        if (pending) details.cancel();
        else cancelDelete();
      }}
    >
      <AlertDialogContent finalFocus="[data-delete-session-trigger]">
        {deleting && <DeleteConfirmation key={deleting.id} session={deleting} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteConfirmation({ session }: { session: StoredSession }) {
  const queryClient = useQueryClient();
  const deletion = useMutation({
    mutationKey: DELETE_KEY,
    mutationFn: (sessionId: number) =>
      request(`/api/transcripts/session?session=${sessionId}`, { method: "DELETE" }),
    onSuccess: async (_, sessionId) => {
      finishDelete(sessionId);
      await queryClient.invalidateQueries({ queryKey: ["transcripts"] });
    },
  });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this transcript?</AlertDialogTitle>
        <AlertDialogDescription>
          {sessionLabel(session)} is removed from the database. This can&apos;t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {deletion.isError && (
        <p role="alert" className="text-sm text-destructive">
          {deletion.error.message}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deletion.isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          data-agent-confirm="Permanently deletes this transcript."
          disabled={deletion.isPending}
          action={() => deletion.mutateAsync(session.id)}
        >
          {deletion.isPending && <LoaderCircleIcon className="animate-spin" />}
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
