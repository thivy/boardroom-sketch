import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/ui/components/alert-dialog";
import { Button } from "@app/ui/components/button";
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
      onOpenChange={(open) => {
        if (!open && !pending) cancelDelete();
      }}
    >
      {deleting && <DeleteConfirmation key={deleting.id} session={deleting} />}
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
    <AlertDialogContent>
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
        <Button
          variant="destructive"
          disabled={deletion.isPending}
          onClick={() => deletion.mutate(session.id)}
        >
          {deletion.isPending && <LoaderCircleIcon className="animate-spin" />}
          Delete
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
