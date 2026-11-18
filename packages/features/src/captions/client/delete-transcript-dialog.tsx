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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useLayoutEffect } from "react";
import { request } from "../../shared/client/api-request";
import { sessionLabel } from "./session-label";
import { cancelDelete, finishDelete, useTranscriptStore } from "./transcript-store";

export function DeleteTranscriptDialog() {
  const queryClient = useQueryClient();
  const deleting = useTranscriptStore((state) => state.deleting);

  const deletion = useMutation({
    mutationKey: ["transcripts", "delete"],
    mutationFn: (sessionId: number) =>
      request(`/api/transcripts/session?session=${sessionId}`, { method: "DELETE" }),
    onSuccess: async (_, sessionId) => {
      finishDelete(sessionId);
      await queryClient.invalidateQueries({ queryKey: ["transcripts"] });
    },
  });
  const { reset } = deletion;

  // A new confirmation starts without the previous attempt's error, before it is first painted.
  useLayoutEffect(() => {
    if (deleting) reset();
  }, [deleting, reset]);

  return (
    <AlertDialog
      open={deleting !== undefined}
      onOpenChange={(open) => {
        if (!open && !deletion.isPending) cancelDelete();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transcript?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleting && sessionLabel(deleting)} is removed from the database. This can&apos;t be
            undone.
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
            onClick={() => deleting && deletion.mutate(deleting.id)}
          >
            {deletion.isPending && <LoaderCircleIcon className="animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
