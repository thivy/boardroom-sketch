import { themeScript } from "@app/features/app-header";
import { AppShell } from "@app/features/app-shell";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { CaptionsIcon, FileTextIcon, MessageSquareIcon } from "lucide-react";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

// The sidebar writes this cookie when it is toggled, so the server can render it the way the user left it.
const getSidebarOpen = createServerFn({ method: "GET" }).handler(
  () => getCookie("sidebar_state") !== "false",
);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => ({ sidebarOpen: await getSidebarOpen() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Boardroom Sketch" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
    ],
    scripts: [{ children: themeScript }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { sidebarOpen } = Route.useRouteContext();

  return (
    <RootDocument>
      <AppShell
        defaultOpen={sidebarOpen}
        navItems={[
          { label: "Teams captions", icon: CaptionsIcon, link: <Link to="/captions" /> },
          { label: "Transcripts", icon: FileTextIcon, link: <Link to="/transcripts" /> },
          { label: "Analysis chat", icon: MessageSquareIcon, link: <Link to="/chat" /> },
        ]}
      >
        <Outlet />
      </AppShell>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className="h-full" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="h-full bg-background font-sans text-[15px] leading-[1.6] text-foreground antialiased max-sm:text-base">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
