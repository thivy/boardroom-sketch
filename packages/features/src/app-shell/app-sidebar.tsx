import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@app/components/components/sidebar";
import type { NavItem } from "./app-shell";
import { ThemeMenuItem } from "./theme-menu";

export function AppSidebar({ navItems }: { navItems: NavItem[] }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <span className="pl-2 text-[13px] font-[560]">Boardroom Sketch</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, icon: Icon, link }) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton render={link} onClick={() => isMobile && setOpenMobile(false)}>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
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
