import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/features/auth/AuthProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, CalendarCheck, Wallet, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import SettingsDialog from "@/components/SettingsDialog";

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "attendance", label: "Attendance" },
  { value: "fee", label: "Fees" },
  { value: "system", label: "System" },
] as const;

function iconFor(category: string) {
  if (category === "attendance") return <CalendarCheck className="h-4 w-4 text-primary" />;
  if (category === "fee") return <Wallet className="h-4 w-4 text-amber-400" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

export default function Notifications() {
  const { user, isAdmin } = useAuth();
  const { items, unread, markAllRead, markRead } = useNotifications(user?.id);
  const [filter, setFilter] = useState<typeof FILTERS[number]["value"]>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const visible = useMemo(() => items.filter(n => {
    if (filter !== "all" && n.category !== filter) return false;
    if (unreadOnly && n.read_at) return false;
    return true;
  }), [items, filter, unreadOnly]);

  return (
    <AppLayout title="Notifications" subtitle={`${unread} unread`}>
      <section className="mx-auto max-w-3xl px-3 sm:px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="flex-1 min-w-0">
            <TabsList className="w-full justify-start overflow-x-auto">
              {FILTERS.map(f => <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <Button variant={unreadOnly ? "default" : "outline"} size="sm" onClick={() => setUnreadOnly(v => !v)}>
            Unread only
          </Button>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <Check className="h-4 w-4" /> Mark all read
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon className="h-4 w-4" /> Settings
            </Button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            <Bell className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No notifications {unreadOnly ? "unread" : "yet"}.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {visible.map(n => {
              const inner = (
                <div className={cn("flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-muted/40 transition", !n.read_at && "bg-primary/5")}>
                  <div className="mt-0.5 shrink-0">{iconFor(n.category)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      <div className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</div>
                    </div>
                    {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                  </div>
                  {!n.read_at && <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                </div>
              );
              return n.link ? (
                <Link key={n.id} to={n.link} onClick={() => markRead(n.id)}>{inner}</Link>
              ) : (
                <button key={n.id} type="button" onClick={() => markRead(n.id)} className="w-full text-left">{inner}</button>
              );
            })}
          </div>
        )}
      </section>
      {isAdmin && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </AppLayout>
  );
}