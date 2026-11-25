import { SidebarTrigger } from "@app/ui/components/sidebar";
import { WindowControls } from "./window-controls";

export type AppHeaderProps = {
  title: string;
};

// In the desktop app the window has no native title bar, so empty space in the header drags it.
export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex h-12 items-center border-b pr-2 pl-4 [-webkit-app-region:drag]">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground [-webkit-app-region:no-drag]" />
        <span className="text-[13px] font-[560]">{title}</span>
      </div>
      <WindowControls />
    </header>
  );
}
