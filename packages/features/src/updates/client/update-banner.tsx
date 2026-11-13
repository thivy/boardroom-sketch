import { Button } from "@app/components/components/button";
import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useAppUpdate } from "./use-app-update";

/** A card in the corner that appears when a newer version of the desktop app has been released. */
export function UpdateBanner() {
  const { state, install } = useAppUpdate();
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
          <Button size="sm" onClick={() => void install()}>
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
          <Button size="sm" variant="outline" onClick={() => void install()}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
