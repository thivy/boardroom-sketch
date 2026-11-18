import { useEffect } from "react";
import { createStore } from "../../shared/client/create-store";

const TICK_MS = 1000;

const clock = createStore({ now: Date.now() });
const useClockStore = clock.useStore;

let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** Ticks while at least one component is using it, and stops when none is. */
function startClock() {
  if (subscribers++ === 0) {
    clock.set({ now: Date.now() });
    timer = setInterval(() => clock.set({ now: Date.now() }), TICK_MS);
  }
  return () => {
    if (--subscribers === 0) clearInterval(timer);
  };
}

/** A clock that ticks, so relative times and fading states keep moving without new data. */
export function useNow() {
  useEffect(startClock, []);
  return useClockStore((state) => state.now);
}

/** Whether `at` is within `windowMs` of now. Re-renders only when that flips, not on every tick. */
export function useRecently(at: number | undefined, windowMs: number) {
  useEffect(startClock, []);
  return useClockStore((state) => at !== undefined && state.now - at < windowMs);
}
