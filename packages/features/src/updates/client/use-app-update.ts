import { useCallback, useEffect, useState } from "react";

/** The parts of Tauri's global API (`withGlobalTauri`) that updating uses; absent in a normal browser. */
type TauriUpdate = {
  version: string;
  downloadAndInstall(
    onEvent?: (event: {
      event: "Started" | "Progress" | "Finished";
      data?: { contentLength?: number; chunkLength?: number };
    }) => void,
  ): Promise<void>;
};
type TauriGlobal = {
  updater?: { check(): Promise<TauriUpdate | null> };
  process?: { relaunch(): Promise<void> };
};

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateState =
  | { status: "none" }
  | { status: "available"; version: string }
  | { status: "installing"; version: string; percent?: number }
  | { status: "error"; version: string; message: string };

/**
 * Checks for a new version of the desktop app on start and every few hours. Inside a normal browser
 * there is no updater, so the state stays `none`.
 */
export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>({ status: "none" });
  const [update, setUpdate] = useState<TauriUpdate>();

  useEffect(() => {
    const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
    if (!tauri?.updater) return;

    let cancelled = false;
    const check = async () => {
      try {
        const found = await tauri.updater!.check();
        if (found && !cancelled) {
          setUpdate(found);
          setState((current) =>
            current.status === "installing"
              ? current
              : { status: "available", version: found.version },
          );
        }
      } catch {
        // Offline or no release yet: try again later.
      }
    };
    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const install = useCallback(async () => {
    const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
    if (!update || !tauri?.process) return;
    setState({ status: "installing", version: update.version });
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data?.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data?.chunkLength ?? 0;
          if (total > 0) {
            setState({
              status: "installing",
              version: update.version,
              percent: Math.round((received / total) * 100),
            });
          }
        }
      });
      await tauri.process.relaunch();
    } catch (error) {
      setState({
        status: "error",
        version: update.version,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [update]);

  return { state, install };
}
