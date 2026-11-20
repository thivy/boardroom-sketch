import { MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

/** The parts of Tauri's global API (`withGlobalTauri`) the window buttons use; absent in a browser. */
type TauriWindow = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
};
type TauriGlobal = { window?: { getCurrentWindow(): TauriWindow } };

const tauriWindow = () =>
  (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__?.window?.getCurrentWindow();

const noSubscription = () => () => {};

const buttons = [
  { label: "Minimize", icon: MinusIcon, run: () => tauriWindow()?.minimize() },
  { label: "Maximize", icon: SquareIcon, run: () => tauriWindow()?.toggleMaximize() },
  { label: "Close", icon: XIcon, run: () => tauriWindow()?.close() },
];

/**
 * Minimize, maximize and close for the desktop app, whose window has no native title bar. Nothing
 * renders in a browser, where the browser has its own.
 */
export function WindowControls() {
  const desktop = useSyncExternalStore(
    noSubscription,
    () => tauriWindow() !== undefined,
    () => false,
  );
  if (!desktop) return null;

  return (
    <div className="ml-auto flex items-center">
      {buttons.map(({ label, icon: Icon, run }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          onClick={() => void run()}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
