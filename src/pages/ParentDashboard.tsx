import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

interface Child {
  id: string;
  full_name: string;
  roll_number: string;
  class: string;
  section: string;
}
interface AttRow { date: string; status: string; student_id: string; }

export default function ParentDashboard() {
  const { session, loading } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [att, setAtt] = useState<Record<string, AttRow[]>>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      const { data: links, error: e1 } = await supabase
        .from("parent_student").select("student_id");
      if (e1) { toast.error(e1.message); setFetching(false); return; }
      const ids = (links ?? []).map((l: any) => l.student_id);
      if (!ids.length) { if (active) { setChildren([]); setFetching(false); } return; }
      const { data: studs, error: e2 } = await supabase
        .from("students").select("id,full_name,roll_number,class,section").in("id", ids);
      if (e2) { toast.error(e2.message); setFetching(false); return; }
      const { data: rows, error: e3 } = await supabase
        .from("attendance").select("student_id,date,status")
        .in("student_id", ids).order("date", { ascending: false });
      if (e3) { toast.error(e3.message); }
      const map: Record<string, AttRow[]> = {};
      (rows ?? []).forEach((r: any) => { (map[r.student_id] ||= []).push(r); });
      if (!active) return;
      setChildren((studs ?? []) as Child[]);
      setAtt(map);
      setFetching(false);
    })();
    return () => { active = false; };
  }, [session]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;

  return (
    <AppLayout title="Parent portal" subtitle="Your children's attendance">
      <section className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        {fetching ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
        ) : children.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No child linked to your account yet. Please contact your school admin.
          </div>
        ) : children.map(c => <ChildCard key={c.id} child={c} rows={att[c.id] ?? []} />)}
      </section>
    </AppLayout>
  );
}

function ChildCard({ child, rows }: { child: Child; rows: AttRow[] }) {
  const total = rows.length;
  const present = rows.filter(r => r.status === "Present").length;
  const pct = total ? Math.round((present / total) * 100) : 0;

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // last 30 days (oldest -> newest)
  const last30: { date: string; status: string | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = iso(d);
    const r = rows.find(x => x.date === ds);
    last30.push({ date: ds, status: r?.status ?? null });
  }
  const last7 = last30.slice(-7);

  // monthly % (current calendar month)
  const monthRows = rows.filter(r => r.date.slice(0, 7) === iso(today).slice(0, 7));
  const mTotal = monthRows.length;
  const mPresent = monthRows.filter(r => r.status === "Present").length;
  const monthPct = mTotal ? Math.round((mPresent / mTotal) * 100) : 0;

  // consecutive recent absents (newest first)
  let streak = 0;
  for (const d of [...last7].reverse()) {
    if (d.status === "Absent") streak++;
    else if (d.status === "Present") break;
  }
  const lowAttendance = total > 0 && pct < 75;
  const tone = pct >= 90 ? "text-emerald-400" : pct >= 75 ? "text-foreground" : "text-destructive";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{child.full_name}</div>
          <div className="text-xs text-muted-foreground">Class {child.class}-{child.section} • Roll {child.roll_number}</div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-semibold tracking-tight ${tone}`}>{pct}%</div>
          <div className="text-[11px] text-muted-foreground">overall</div>
        </div>
      </div>
      <Progress value={pct} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="This month" value={`${monthPct}%`} tone={monthPct >= 75 ? "ok" : "bad"} />
        <MiniStat label="Present" value={`${mPresent}`} />
        <MiniStat label="Absent" value={`${mTotal - mPresent}`} tone={mTotal - mPresent > 0 ? "bad" : undefined} />
      </div>

      {(streak >= 3 || lowAttendance) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex gap-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {streak >= 3 && <div>Absent {streak} days in a row.</div>}
            {lowAttendance && <div>Attendance is below 75%.</div>}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground">Last 30 days</div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary inline-block" />Present</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive inline-block" />Absent</span>
          </div>
        </div>
        <div className="flex items-end gap-[3px] h-16 rounded-lg border border-border bg-muted/30 p-2">
          {last30.map(d => {
            const h = d.status === "Present" ? "h-full" : d.status === "Absent" ? "h-1/2" : "h-1";
            const c = d.status === "Present" ? "bg-primary" : d.status === "Absent" ? "bg-destructive" : "bg-muted-foreground/30";
            return <div key={d.date} title={`${d.date} ${d.status ?? "—"}`} className={`flex-1 rounded-sm ${c} ${h}`} />;
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Last 7 days</div>
        <div className="grid grid-cols-7 gap-1.5">
          {last7.map(d => (
            <div key={d.date} className="text-center">
              <div className={`h-9 rounded-md grid place-items-center text-[11px] font-medium ${
                d.status === "Present" ? "bg-primary/15 text-primary" :
                d.status === "Absent" ? "bg-destructive/15 text-destructive" :
                "bg-muted text-muted-foreground"}`}>
                {d.status === "Present" ? "P" : d.status === "Absent" ? "A" : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Recent records</div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {rows.slice(0, 10).map((r, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{r.date}</span>
              <span className={r.status === "Present" ? "text-primary" : "text-destructive"}>{r.status}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="px-3 py-3 text-xs text-muted-foreground">No attendance records yet.</div>}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-2">
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}