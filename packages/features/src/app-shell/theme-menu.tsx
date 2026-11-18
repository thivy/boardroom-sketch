"use client";

import { SidebarMenuButton, SidebarMenuItem } from "@app/ui/components/sidebar";
import { MoonIcon, SunIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getTheme = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

/** A menu item that switches between the dark and the light theme; the choice is kept in local storage. */
export function ThemeMenuItem() {
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "dark");
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage can be blocked (private mode); the theme still switches for this visit.
    }
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggle}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        <span>{next === "light" ? "Light theme" : "Dark theme"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
