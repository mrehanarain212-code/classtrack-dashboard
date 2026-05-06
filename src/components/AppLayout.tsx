import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import NotificationBell from "@/components/NotificationBell";
import { useAuth } from "@/features/auth/AuthProvider";

export default function AppLayout({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 h-14 flex items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-3">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              {title && <div className="text-sm font-semibold truncate">{title}</div>}
              {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
            </div>
            <NotificationBell />
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}