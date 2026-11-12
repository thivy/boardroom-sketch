import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from "@app/components/components/sidebar";
import { ThemeMenuItem } from "./theme-menu";

export function AppSidebar() {
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <span className="pl-2 text-[13px] font-[560]">Boardroom Sketch</span>
      </SidebarHeader>
      <SidebarContent />
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <ThemeMenuItem />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
