import { createStore } from "zustand";

export type SidebarState = {
  /** The desktop sidebar is expanded. */
  open: boolean;
  /** The mobile sheet is showing. */
  openMobile: boolean;
};

/**
 * One store per `SidebarProvider`, not a shared singleton: on the server a module-level store would be
 * shared by every request, and the initial `open` comes from each request's cookie.
 */
export const createSidebarStore = (open: boolean) =>
  createStore<SidebarState>()(() => ({ open, openMobile: false }));

export type SidebarStore = ReturnType<typeof createSidebarStore>;
