import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarCheck, Plus, Search, Users } from "lucide-react";
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
import AppLayout from "@/components/AppLayout";

const PAGE_SIZE = 20;

export default function Dashboard() {
  const { session, schoolId, role, isAdmin, isParent, loading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [fetching, setFetching] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toDelete, setToDelete] = useState<Student | null>(null);
  const [todayStats, setTodayStats] = useState<{ present: number; absent: number }>({ present: 0, absent: 0 });
  const [statsDate, setStatsDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [alerts, setAlerts] = useState<{ id: string; student_id: string; name: string; roll: string; klass: string; absentStreak: number; threshold: number; streakStart: string }[]>([]);
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
    (supabase as any)
      .from("attendance_alerts")
      .select("id,student_id,streak_length,threshold,streak_start_date,status")
      .eq("status", "active")
      .order("streak_length", { ascending: false })
      .then(({ data }: any) => {
        if (!active || !data) return;
        const byId: Record<string, Student> = {};
        students.forEach(s => { byId[s.id] = s; });
        const out = (data as any[])
          .filter(r => byId[r.student_id])
          .map(r => {
            const s = byId[r.student_id];
            return {
              id: r.id,
              student_id: r.student_id,
              name: s.full_name,
              roll: s.roll_number,
              klass: `${s.class}-${s.section}`,
              absentStreak: r.streak_length,
              threshold: r.threshold,
              streakStart: r.streak_start_date,
            };
          });
        setAlerts(out);
      });
    return () => { active = false; };
  }, [schoolId, students]);

  const acknowledgeAlert = async (id: string) => {
    const prev = alerts;
    setAlerts(prev.filter(a => a.id !== id));
    const { error } = await (supabase as any)
      .from("attendance_alerts")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), acknowledged_by: session?.user?.id })
      .eq("id", id);
    if (error) { setAlerts(prev); toast.error(error.message); }
  };

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <AppLayout title="Dashboard" subtitle="Students & overview">
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {role && (
          <div className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-foreground capitalize">{role}</span>
          </div>
        )}
        {fetching ? <StatGridSkeleton /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
          <div className="relative overflow-hidden rounded-3xl bg-primary p-6 sm:p-8 shadow-glow group">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/15 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 grid place-items-center shrink-0">
                  <CalendarCheck className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-white truncate">Mark attendance</h2>
                  <p className="text-sm text-white/80 truncate">{todayStats.present} present • {todayStats.absent} absent</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{attendancePct}%</div>
                <div className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-0.5">Today</div>
              </div>
            </div>
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
                  <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-medium">
                    <AlertTriangle className="h-3 w-3" /> {a.absentStreak}d absent
                  </span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">≥ {a.threshold}</span>
                  <button
                    type="button"
                    onClick={() => acknowledgeAlert(a.id)}
                    className="text-[11px] font-medium rounded-md border border-border px-2 py-0.5 hover:bg-muted"
                  >
                    Acknowledge
                  </button>
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
            <Input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Search by name, roll, class…" className="pl-9 tap-44" />
          </div>
          <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(0); }}
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
          <>
            <StudentList
              students={paged}
              canManage={isAdmin}
              onEdit={s => { setEditing(s); setFormOpen(true); }}
              onDelete={s => setToDelete(s)}
            />
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between text-xs">
                <div className="text-muted-foreground">Page {page + 1} / {totalPages} • {filtered.length} students</div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
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
    </AppLayout>
  );
}

const Stat = ({ label, value, icon, suffix }: { label: string; value: number; icon?: React.ReactNode; suffix?: string }) => (
  <div className="rounded-3xl border border-border bg-card p-5 shadow-card hover:border-primary/30 transition-colors">
    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">
      {icon}{label}
    </div>
    <div className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">{value}{suffix}</div>
  </div>
);