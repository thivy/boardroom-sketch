import { createStore } from "../../shared/client/create-store";
import { desktop } from "../../shared/client/desktop";

export type UpdateState =
  | { status: "none" }
  | { status: "available"; version: string }
  | { status: "installing"; version: string; percent?: number }
  | { status: "error"; version: string; message: string };

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const updates = createStore(
  {
    state: { status: "none" } as UpdateState,
    updateVersion: undefined as string | undefined,
  },
  {
    // The banner is on screen for as long as the app is open: check on start and every few hours.
    whileUsed: () => {
      // The dev server runs in the desktop window too, but there is no release to update to.
      if (process.env.NODE_ENV !== "production" || desktop()?.updates === undefined)
        return () => {};
      void checkForUpdate();
      const timer = setInterval(checkForUpdate, CHECK_EVERY_MS);
      return () => clearInterval(timer);
    },
    onUnused: () => {},
  },
);

export const useUpdateStore = updates.useStore;

/** Asks the updater for a newer version; offline or no release yet leaves things as they were. */
async function checkForUpdate() {
  try {
    const found = await desktop()?.updates.check();
    if (!found) return;
    updates.set((current) => ({
      updateVersion: found.version,
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
  const { updateVersion } = updates.get();
  const updater = desktop()?.updates;
  if (!updateVersion || !updater) return;

  const version = updateVersion;
  updates.set({ state: { status: "installing", version } });
  const stopProgress = updater.onProgress(({ percent }) => {
    updates.set({ state: { status: "installing", version, percent } });
  });
  try {
    await updater.install();
  } catch (error) {
    updates.set({
      state: {
        status: "error",
        version,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    stopProgress();
  }
}
