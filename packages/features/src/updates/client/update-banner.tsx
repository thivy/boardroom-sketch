import { Button } from "@app/ui/components/button";
import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect } from "react";
import { canUpdate, checkForUpdate, installUpdate, useUpdateStore } from "./update-store";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * A card in the corner that appears when a newer version of the desktop app has been released. It
 * checks on start and every few hours; inside a normal browser there is no updater, so nothing shows.
 */
export function UpdateBanner() {
  const state = useUpdateStore((store) => store.state);

  useEffect(() => {
    if (!canUpdate()) return;
    void checkForUpdate();
    const timer = setInterval(checkForUpdate, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  if (state.status === "none") return null;

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 grid w-72 gap-2 rounded-2xl border bg-popover p-4 text-sm shadow-lg"
    >
      <div className="font-[560]">Version {state.version} is available</div>

      {state.status === "available" && (
        <>
          <p className="text-muted-foreground">Download the update and restart to use it.</p>
          <Button size="sm" onClick={() => void installUpdate()}>
            <DownloadIcon />
            Update and restart
          </Button>
        </>
      )}

      {state.status === "installing" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" />
          {state.percent === undefined ? "Downloading…" : `Downloading… ${state.percent}%`}
        </p>
      )}

      {state.status === "error" && (
        <>
          <p role="alert" className="text-destructive">
            The update failed: {state.message}
          </p>
          <Button size="sm" variant="outline" onClick={() => void installUpdate()}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
