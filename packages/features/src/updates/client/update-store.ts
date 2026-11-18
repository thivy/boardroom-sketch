import { createStore } from "../../shared/client/create-store";

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

export type UpdateState =
  | { status: "none" }
  | { status: "available"; version: string }
  | { status: "installing"; version: string; percent?: number }
  | { status: "error"; version: string; message: string };

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const updates = createStore(
  {
    state: { status: "none" } as UpdateState,
    update: undefined as TauriUpdate | undefined,
  },
  {
    // The banner is on screen for as long as the app is open: check on start and every few hours.
    whileUsed: () => {
      // The dev server runs in the desktop window too, but there is no release to update to.
      if (process.env.NODE_ENV !== "production" || tauri()?.updater === undefined) return () => {};
      void checkForUpdate();
      const timer = setInterval(checkForUpdate, CHECK_EVERY_MS);
      return () => clearInterval(timer);
    },
    onUnused: () => {},
  },
);

export const useUpdateStore = updates.useStore;

const tauri = () => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;

/** Asks the updater for a newer version; offline or no release yet leaves things as they were. */
async function checkForUpdate() {
  try {
    const found = await tauri()?.updater?.check();
    if (!found) return;
    updates.set((current) => ({
      update: found,
      state:
        current.state.status === "installing"
          ? current.state
          : { status: "available", version: found.version },
    }));
  } catch {
    // Offline or no release yet: try again later.
  }
}

/** Downloads the found update and restarts into it. */
export async function installUpdate() {
  const { update } = updates.get();
  const process = tauri()?.process;
  if (!update || !process) return;

  const version = update.version;
  updates.set({ state: { status: "installing", version } });
  let total = 0;
  let received = 0;
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data?.contentLength ?? 0;
      if (event.event === "Progress") {
        received += event.data?.chunkLength ?? 0;
        if (total > 0) {
          updates.set({
            state: { status: "installing", version, percent: Math.round((received / total) * 100) },
          });
        }
      }
    });
    await process.relaunch();
  } catch (error) {
    updates.set({
      state: {
        status: "error",
        version,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
