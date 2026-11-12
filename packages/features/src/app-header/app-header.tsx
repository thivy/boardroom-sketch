import { SidebarTrigger } from "@app/components/components/sidebar";

export type AppHeaderProps = {
  title: string;
};

export function AppHeader({ title }: AppHeaderProps) {
  return (
    <header className="flex h-12 items-center border-b px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />
        <span className="text-[13px] font-[560]">{title}</span>
      </div>
    </header>
  );
}
