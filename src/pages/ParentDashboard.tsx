import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, GraduationCap, LogOut } from "lucide-react";
import { toast } from "sonner";

interface Child {
  id: string;
  full_name: string;
  roll_number: string;
  class: string;
  section: string;
}
interface AttRow { date: string; status: string; student_id: string; }

export default function ParentDashboard() {
  const { session, loading, signOut } = useAuth();
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
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">ClassTrack</h1>
            <p className="text-xs text-muted-foreground truncate">Parent portal</p>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-5 space-y-4">
        {fetching ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
        ) : children.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No child linked to your account yet. Please contact your school admin.
          </div>
        ) : children.map(c => <ChildCard key={c.id} child={c} rows={att[c.id] ?? []} />)}
      </section>
    </main>
  );
}

function ChildCard({ child, rows }: { child: Child; rows: AttRow[] }) {
  const total = rows.length;
  const present = rows.filter(r => r.status === "Present").length;
  const pct = total ? Math.round((present / total) * 100) : 0;

  // last 7 days
  const today = new Date();
  const last7: { date: string; status: string | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const r = rows.find(x => x.date === ds);
    last7.push({ date: ds, status: r?.status ?? null });
  }

  // consecutive recent absents
  let streak = 0;
  for (const d of last7) {
    if (d.status === "Absent") streak++;
    else if (d.status === "Present") break;
  }
  const lowAttendance = total > 0 && pct < 75;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{child.full_name}</div>
          <div className="text-xs text-muted-foreground">Class {child.class}-{child.section} • Roll {child.roll_number}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight">{pct}%</div>
          <div className="text-[11px] text-muted-foreground">attendance</div>
        </div>
      </div>
      <Progress value={pct} />

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
        <div className="text-xs text-muted-foreground mb-2">Last 7 days</div>
        <div className="grid grid-cols-7 gap-1.5">
          {last7.slice().reverse().map(d => (
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