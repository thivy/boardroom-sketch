import { MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { desktop } from "../shared/client/desktop";

const noSubscription = () => () => {};

const buttons = [
  { label: "Minimize", icon: MinusIcon, run: () => desktop()?.window.minimize() },
  { label: "Maximize", icon: SquareIcon, run: () => desktop()?.window.toggleMaximize() },
  { label: "Close", icon: XIcon, run: () => desktop()?.window.close() },
];

/**
 * Minimize, maximize and close for the desktop app, whose window has no native title bar. Nothing
 * renders in a browser, where the browser has its own.
 */
export function WindowControls() {
  const desktop = useSyncExternalStore(
    noSubscription,
    () => window.boardroomSketch !== undefined,
    () => false,
  );
  if (!desktop) return null;

  return (
    <div className="ml-auto flex items-center [-webkit-app-region:no-drag]">
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
