import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Bell, BookOpen, CalendarCheck, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Shield, Trophy, Users, Wallet } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";

export default function AppSidebar() {
  const { isAdmin, isTeacher, isParent, role, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const items = isParent
    ? [
        { title: "My Children", url: "/parent", icon: LayoutDashboard },
        { title: "Results", url: "/results", icon: Trophy },
        { title: "Fees", url: "/fees", icon: Wallet },
        { title: "Notifications", url: "/notifications", icon: Bell },
      ]
    : [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Students", url: "/", icon: Users },
        { title: "Attendance", url: "/attendance", icon: CalendarCheck },
        { title: "Subjects", url: "/subjects", icon: BookOpen },
        { title: "Exams", url: "/exams", icon: ClipboardList },
        { title: "Results", url: "/results", icon: Trophy },
        { title: "Fees", url: "/fees", icon: Wallet },
        { title: "Notifications", url: "/notifications", icon: Bell },
        ...(isAdmin || isTeacher ? [{ title: "Reports", url: "/reports", icon: BarChart3 }] : []),
        ...(isAdmin ? [{ title: "Team", url: "/team", icon: Shield }] : []),
      ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow shrink-0">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">ClassTrack</div>
              <div className="text-[10px] text-muted-foreground capitalize truncate">{role ?? "user"}</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Main</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.title + item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <NavLink to={item.url} end className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="h-4 w-4" /> {!collapsed && "Sign out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}