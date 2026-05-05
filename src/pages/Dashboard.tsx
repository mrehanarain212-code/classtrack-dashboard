import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { BarChart3, CalendarCheck, GraduationCap, LogOut, Plus, Search, Shield, Users } from "lucide-react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import StudentForm from "@/features/students/StudentForm";
import StudentList from "@/features/students/StudentList";
import type { Student } from "@/features/students/types";
import { StatGridSkeleton, StudentRowSkeleton } from "@/components/Skeletons";
import { useDebounce } from "@/hooks/useDebounce";

export default function Dashboard() {
  const { session, schoolId, role, isAdmin, isParent, loading, signOut } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [fetching, setFetching] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toDelete, setToDelete] = useState<Student | null>(null);
  const [todayStats, setTodayStats] = useState<{ present: number; absent: number }>({ present: 0, absent: 0 });
  const [statsDate, setStatsDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [alerts, setAlerts] = useState<{ student_id: string; name: string; roll: string; klass: string; pct: number; absentStreak: number; totalDays: number }[]>([]);
  const debouncedQ = useDebounce(q, 250);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    setFetching(true);
    supabase.from("students")
      .select("id,school_id,full_name,roll_number,class,section,parent_name,parent_contact,photo_url,created_at,updated_at,date_of_birth,admission_date,address")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error(error.message);
      else setStudents((data ?? []) as Student[]);
      setFetching(false);
    });
    return () => { active = false; };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    supabase.from("attendance").select("status").eq("date", statsDate).then(({ data }) => {
      if (!active || !data) return;
      let p = 0, a = 0;
      data.forEach((r: any) => { if (r.status === "Present") p++; else if (r.status === "Absent") a++; });
      setTodayStats({ present: p, absent: a });
    });
    return () => { active = false; };
  }, [schoolId, statsDate, students.length]);

  useEffect(() => {
    if (!schoolId || students.length === 0) { setAlerts([]); return; }
    let active = true;
    const since = new Date(); since.setDate(since.getDate() - 29);
    const sinceISO = since.toISOString().slice(0, 10);
    supabase.from("attendance").select("student_id,date,status").gte("date", sinceISO)
      .order("date", { ascending: false }).then(({ data }) => {
        if (!active || !data) return;
        const byStudent: Record<string, { date: string; status: string }[]> = {};
        (data as any[]).forEach(r => { (byStudent[r.student_id] ||= []).push(r); });
        const out: typeof alerts = [];
        students.forEach(s => {
          const rows = byStudent[s.id] ?? [];
          if (!rows.length) return;
          const present = rows.filter(r => r.status === "Present").length;
          const pct = Math.round((present / rows.length) * 100);
          let streak = 0;
          for (const r of rows) { if (r.status === "Absent") streak++; else break; }
          if (streak >= 3 || pct < 75) {
            out.push({ student_id: s.id, name: s.full_name, roll: s.roll_number, klass: `${s.class}-${s.section}`, pct, absentStreak: streak, totalDays: rows.length });
          }
        });
        out.sort((a, b) => b.absentStreak - a.absentStreak || a.pct - b.pct);
        setAlerts(out);
      });
    return () => { active = false; };
  }, [schoolId, students]);

  const classes = useMemo(() => Array.from(new Set(students.map(s => s.class))).sort(), [students]);

  const attendancePct = useMemo(() => {
    const total = todayStats.present + todayStats.absent;
    if (!total) return 0;
    return Math.round((todayStats.present / total) * 100);
  }, [todayStats]);

  const filtered = useMemo(() => {
    const needle = debouncedQ.trim().toLowerCase();
    return students.filter(s => {
      if (classFilter && s.class !== classFilter) return false;
      if (!needle) return true;
      return s.full_name.toLowerCase().includes(needle)
        || s.roll_number.toLowerCase().includes(needle)
        || `${s.class}-${s.section}`.toLowerCase().includes(needle);
    });
  }, [students, debouncedQ, classFilter]);

  const onSaved = (s: Student) => {
    setStudents(prev => {
      const i = prev.findIndex(x => x.id === s.id);
      if (i >= 0) { const c = [...prev]; c[i] = s; return c; }
      return [s, ...prev];
    });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const snapshot = students;
    setStudents(prev => prev.filter(s => s.id !== toDelete.id));
    const { error } = await supabase.from("students").delete().eq("id", toDelete.id);
    if (error) {
      setStudents(snapshot);
      toast.error(error.message);
    } else {
      toast.success("Student deleted");
    }
    setToDelete(null);
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (isParent) return <Navigate to="/parent" replace />;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">ClassTrack</h1>
            <p className="text-xs text-muted-foreground truncate">Student management</p>
          </div>
          <Link to="/attendance">
            <Button variant="ghost" size="icon" aria-label="Attendance"><CalendarCheck className="h-4 w-4" /></Button>
          </Link>
          <Link to="/reports">
            <Button variant="ghost" size="icon" aria-label="Reports"><BarChart3 className="h-4 w-4" /></Button>
          </Link>
          {isAdmin && (
            <Link to="/team">
              <Button variant="ghost" size="icon" aria-label="Team"><Shield className="h-4 w-4" /></Button>
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 space-y-5">
        {role && (
          <div className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground capitalize">{role}</span>
          </div>
        )}
        {fetching ? <StatGridSkeleton /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Students" value={students.length} icon={<Users className="h-4 w-4" />} />
            <Stat label="Present" value={todayStats.present} />
            <Stat label="Absent" value={todayStats.absent} />
            <Stat label="Attendance %" value={attendancePct} suffix="%" />
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Stats date</label>
          <Input type="date" value={statsDate} max={new Date().toISOString().slice(0,10)}
            onChange={e => setStatsDate(e.target.value)} className="h-9 w-44" />
        </div>

        <Link to="/attendance" className="block">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card flex items-center gap-3 hover:bg-muted/30 transition">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center">
              <CalendarCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Mark attendance</div>
              <div className="text-xs text-muted-foreground">
                {todayStats.present} present • {todayStats.absent} absent
              </div>
            </div>
            <div className="text-sm font-semibold">{attendancePct}%</div>
          </div>
        </Link>

        {alerts.length > 0 && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Attendance alerts
              <span className="ml-auto text-[11px] font-normal text-muted-foreground">Last 30 days</span>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
              {alerts.slice(0, 8).map(a => (
                <li key={a.student_id} className="px-3 py-2 flex items-center gap-2 text-sm">
                  <Link to={`/students/${a.student_id}`} className="flex-1 min-w-0 hover:underline">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">Class {a.klass} • Roll {a.roll}</div>
                  </Link>
                  {a.absentStreak >= 3 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-medium">
                      <AlertTriangle className="h-3 w-3" /> {a.absentStreak}d absent
                    </span>
                  )}
                  {a.pct < 75 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[11px] font-medium">
                      <TrendingDown className="h-3 w-3" /> {a.pct}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {alerts.length > 8 && (
              <div className="text-[11px] text-muted-foreground">+ {alerts.length - 8} more</div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, roll, class…" className="pl-9 tap-44" />
          </div>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm tap-44">
            <option value="">All classes</option>
            {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Add student
            </Button>
          )}
        </div>

        {fetching ? (
          <StudentRowSkeleton count={5} />
        ) : (
          <StudentList
            students={filtered}
            canManage={isAdmin}
            onEdit={s => { setEditing(s); setFormOpen(true); }}
            onDelete={s => setToDelete(s)}
          />
        )}
      </section>

      {schoolId && (
        <StudentForm open={formOpen} onOpenChange={setFormOpen} schoolId={schoolId} editing={editing} onSaved={onSaved} />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete student?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && `${toDelete.full_name} (Roll ${toDelete.roll_number}) will be permanently removed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

const Stat = ({ label, value, icon, suffix }: { label: string; value: number; icon?: React.ReactNode; suffix?: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight">{value}{suffix}</div>
  </div>
);