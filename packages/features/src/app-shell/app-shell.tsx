import { SidebarInset, SidebarProvider } from "@app/components/components/sidebar";
import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";

export type AppShellProps = {
  /** Whether the sidebar starts open; the app reads it from the cookie the sidebar writes. */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function AppShell({ defaultOpen = true, children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-dvh min-h-0">
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden md:peer-data-[variant=inset]:border">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
