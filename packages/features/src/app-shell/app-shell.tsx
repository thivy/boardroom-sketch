import { SidebarInset, SidebarProvider } from "@app/components/components/sidebar";
import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";

export type NavItem = {
  label: string;
  icon: LucideIcon;
  /** The link the app builds with its router; the sidebar renders its button as this element. */
  link: ReactElement;
};

export type AppShellProps = {
  /** Whether the sidebar starts open; the app reads it from the cookie the sidebar writes. */
  defaultOpen?: boolean;
  navItems?: NavItem[];
  children: ReactNode;
};

export function AppShell({ defaultOpen = true, navItems = [], children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-dvh min-h-0">
      <AppSidebar navItems={navItems} />
      <SidebarInset className="min-w-0 overflow-hidden md:peer-data-[variant=inset]:border">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
