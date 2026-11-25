export type DesktopApi = {
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  updates: {
    check(): Promise<{ version: string } | null>;
    install(): Promise<void>;
    onProgress(callback: (progress: { percent: number }) => void): () => void;
  };
};

declare global {
  interface Window {
    boardroomSketch?: DesktopApi;
  }
}

export function desktop() {
  return typeof window === "undefined" ? undefined : window.boardroomSketch;
}
