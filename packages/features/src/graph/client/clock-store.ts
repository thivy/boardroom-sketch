import { createStore } from "../../shared/client/create-store";

const TICK_MS = 1000;

const clock = createStore(
  { now: Date.now() },
  {
    // Ticks while a component is showing a time, and stops when none is.
    whileUsed: ({ set }) => {
      set({ now: Date.now() });
      const timer = setInterval(() => set({ now: Date.now() }), TICK_MS);
      return () => clearInterval(timer);
    },
    onUnused: () => {},
  },
);

/** A clock that ticks, so relative times and fading states keep moving without new data. */
export const useNow = () => clock.useStore((state) => state.now);

/** Whether `at` is within `windowMs` of now. Re-renders only when that flips, not on every tick. */
export const useRecently = (at: number | undefined, windowMs: number) =>
  clock.useStore((state) => at !== undefined && state.now - at < windowMs);
