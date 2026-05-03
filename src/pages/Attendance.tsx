import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Calendar as CalendarIcon, Check, Loader2, Save, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Student } from "@/features/students/types";
import type { AttendanceRecord, AttendanceStatus } from "@/features/attendance/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const { session, schoolId, loading } = useAuth();
  const [date, setDate] = useState<string>(todayISO());
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [existing, setExisting] = useState<Record<string, AttendanceRecord>>({});
  const [q, setQ] = useState("");
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    setFetching(true);
    Promise.all([
      supabase.from("students").select("*").order("class").order("roll_number"),
      supabase.from("attendance").select("*").eq("date", date),
    ]).then(([sRes, aRes]) => {
      if (!active) return;
      if (sRes.error) toast.error(sRes.error.message);
      if (aRes.error) toast.error(aRes.error.message);
      const studs = (sRes.data ?? []) as Student[];
      const atts = (aRes.data ?? []) as AttendanceRecord[];
      const exMap: Record<string, AttendanceRecord> = {};
      const mk: Record<string, AttendanceStatus> = {};
      atts.forEach(a => { exMap[a.student_id] = a; mk[a.student_id] = a.status; });
      setStudents(studs);
      setExisting(exMap);
      setMarks(mk);
      setFetching(false);
    });
    return () => { active = false; };
  }, [schoolId, date]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return students;
    return students.filter(s =>
      s.full_name.toLowerCase().includes(n) ||
      s.roll_number.toLowerCase().includes(n) ||
      `${s.class}-${s.section}`.toLowerCase().includes(n)
    );
  }, [students, q]);

  const counts = useMemo(() => {
    let p = 0, a = 0;
    students.forEach(s => {
      const m = marks[s.id];
      if (m === "Present") p++;
      else if (m === "Absent") a++;
    });
    return { present: p, absent: a, unmarked: students.length - p - a };
  }, [students, marks]);

  const set = (id: string, status: AttendanceStatus) =>
    setMarks(prev => ({ ...prev, [id]: status }));

  const markAllPresent = () => {
    const next: Record<string, AttendanceStatus> = {};
    students.forEach(s => { next[s.id] = "Present"; });
    setMarks(next);
    toast.success("All marked present");
  };

  const save = async () => {
    if (!schoolId) return;
    const entries = Object.entries(marks);
    if (entries.length === 0) { toast.error("Nothing to save"); return; }
    setSaving(true);
    try {
      const toInsert: Array<{ student_id: string; date: string; status: AttendanceStatus; school_id: string }> = [];
      const toUpdate: Array<{ id: string; status: AttendanceStatus }> = [];
      for (const [sid, status] of entries) {
        const ex = existing[sid];
        if (ex) {
          if (ex.status !== status) toUpdate.push({ id: ex.id, status });
        } else {
          toInsert.push({ student_id: sid, date, status, school_id: schoolId });
        }
      }
      if (toInsert.length) {
        const { data, error } = await supabase.from("attendance").insert(toInsert).select();
        if (error) throw error;
        const newEx = { ...existing };
        (data as AttendanceRecord[]).forEach(r => { newEx[r.student_id] = r; });
        setExisting(newEx);
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("attendance").update({ status: u.status }).eq("id", u.id);
        if (error) throw error;
      }
      toast.success(`Saved (${toInsert.length} new, ${toUpdate.length} updated)`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Attendance</h1>
            <p className="text-xs text-muted-foreground truncate">Mark daily attendance</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Present" value={counts.present} tone="success" />
          <Stat label="Absent" value={counts.absent} tone="danger" />
          <Stat label="Unmarked" value={counts.unmarked} />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} className="pl-9 tap-44 sm:w-48" />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name, roll, class…" className="pl-9 tap-44" />
          </div>
          <Button variant="outline" onClick={markAllPresent} disabled={fetching || students.length === 0} className="tap-44">
            <Check className="h-4 w-4" /> Mark all present
          </Button>
        </div>

        {fetching ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No students found</div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(s => {
              const m = marks[s.id];
              return (
                <li key={s.id} className="rounded-2xl border border-border bg-card p-3 shadow-card flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {s.photo_url ? <img src={s.photo_url} alt="" className="h-full w-full object-cover" /> :
                      <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">{s.full_name[0]}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground">Roll {s.roll_number} • {s.class}-{s.section}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => set(s.id, "Present")}
                      className={`tap-44 px-3 rounded-lg border text-xs font-medium transition ${
                        m === "Present"
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                      aria-label="Mark present"
                    >
                      <Check className="h-4 w-4 inline" /> P
                    </button>
                    <button
                      type="button"
                      onClick={() => set(s.id, "Absent")}
                      className={`tap-44 px-3 rounded-lg border text-xs font-medium transition ${
                        m === "Absent"
                          ? "bg-destructive/15 border-destructive/40 text-destructive"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                      aria-label="Mark absent"
                    >
                      <X className="h-4 w-4 inline" /> A
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="fixed bottom-0 inset-x-0 border-t border-border bg-background/90 backdrop-blur z-20">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="text-xs text-muted-foreground flex-1">
            {Object.keys(marks).length} of {students.length} marked
          </div>
          <Button onClick={save} disabled={saving || fetching} className="tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save attendance
          </Button>
        </div>
      </div>
    </main>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-1 text-2xl font-semibold tracking-tight ${
      tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-destructive" : ""
    }`}>{value}</div>
  </div>
);