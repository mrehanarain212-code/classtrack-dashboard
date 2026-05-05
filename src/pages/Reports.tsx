import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Download, Filter, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Student } from "@/features/students/types";
import { TableRowsSkeleton } from "@/components/Skeletons";
import { useDebounce } from "@/hooks/useDebounce";

const PAGE_SIZE = 25;
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

type Row = {
  id: string;
  date: string;
  status: string;
  marked_by: string | null;
  student_id: string;
};

export default function Reports() {
  const { session, schoolId, loading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [from, setFrom] = useState<string>(daysAgoISO(30));
  const [to, setTo] = useState<string>(todayISO());
  const [nameQ, setNameQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "Present" | "Absent">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debouncedName = useDebounce(nameQ, 300);

  // Fetch students once
  useEffect(() => {
    if (!schoolId) return;
    supabase.from("students").select("id,full_name,roll_number,class,section").order("class").order("section").order("roll_number").then(({ data }) => {
      setStudents((data ?? []) as Student[]);
    });
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { m[p.id] = p.full_name ?? "—"; });
      setProfiles(m);
    });
  }, [schoolId]);

  const studentMap = useMemo(() => {
    const m: Record<string, Student> = {};
    students.forEach(s => { m[s.id] = s; });
    return m;
  }, [students]);

  const classes = useMemo(() => Array.from(new Set(students.map(s => s.class))).sort(), [students]);
  const sections = useMemo(() => {
    const set = new Set(students.filter(s => !classFilter || s.class === classFilter).map(s => s.section));
    return Array.from(set).sort();
  }, [students, classFilter]);

  // Compute filtered student IDs (in-memory: students table is small per school)
  const filteredStudentIds = useMemo(() => {
    const n = debouncedName.trim().toLowerCase();
    return students
      .filter(s => !classFilter || s.class === classFilter)
      .filter(s => !sectionFilter || s.section === sectionFilter)
      .filter(s => !n || s.full_name.toLowerCase().includes(n) || s.roll_number.toLowerCase().includes(n))
      .map(s => s.id);
  }, [students, debouncedName, classFilter, sectionFilter]);

  const studentsScoped = debouncedName || classFilter || sectionFilter;

  const buildQuery = () => {
    let q = supabase.from("attendance").select("id, date, status, marked_by, student_id", { count: "exact" })
      .gte("date", from).lte("date", to);
    if (statusFilter) q = q.eq("status", statusFilter);
    if (studentsScoped) q = q.in("student_id", filteredStudentIds.length ? filteredStudentIds : ["00000000-0000-0000-0000-000000000000"]);
    return q;
  };

  // Fetch attendance page
  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    setFetching(true);
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE - 1;
    buildQuery().order("date", { ascending: false }).range(start, end).then(({ data, count, error }) => {
      if (!active) return;
      if (error) toast.error(error.message);
      setRows((data ?? []) as Row[]);
      setTotal(count ?? 0);
      setFetching(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, from, to, statusFilter, debouncedName, classFilter, sectionFilter, page]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [from, to, statusFilter, debouncedName, classFilter, sectionFilter]);

  // Summary report (fetch all matching for stats)
  const [summary, setSummary] = useState<{
    totalDays: number;
    perStudent: Array<{ id: string; name: string; pct: number; present: number; absent: number }>;
    perClass: Array<{ key: string; pct: number; present: number; absent: number }>;
  }>({ totalDays: 0, perStudent: [], perClass: [] });

  useEffect(() => {
    if (!schoolId || students.length === 0) return;
    let active = true;
    let q = supabase.from("attendance").select("student_id, status, date")
      .gte("date", from).lte("date", to);
    if (studentsScoped) q = q.in("student_id", filteredStudentIds.length ? filteredStudentIds : ["00000000-0000-0000-0000-000000000000"]);
    q.limit(10000).then(({ data, error }) => {
      if (!active || error || !data) return;
      const byStudent: Record<string, { p: number; a: number }> = {};
      const byClass: Record<string, { p: number; a: number }> = {};
      const dates = new Set<string>();
      data.forEach((r: any) => {
        dates.add(r.date);
        const s = studentMap[r.student_id];
        if (!s) return;
        const isP = r.status === "Present";
        byStudent[r.student_id] ||= { p: 0, a: 0 };
        if (isP) byStudent[r.student_id].p++; else byStudent[r.student_id].a++;
        const ck = `${s.class}-${s.section}`;
        byClass[ck] ||= { p: 0, a: 0 };
        if (isP) byClass[ck].p++; else byClass[ck].a++;
      });
      const perStudent = Object.entries(byStudent).map(([id, v]) => {
        const total = v.p + v.a;
        const name = studentMap[id]?.full_name ?? "—";
        return { id, name, present: v.p, absent: v.a, pct: total ? Math.round((v.p / total) * 100) : 0 };
      }).sort((a, b) => b.absent - a.absent);
      const perClass = Object.entries(byClass).map(([key, v]) => {
        const total = v.p + v.a;
        return { key, present: v.p, absent: v.a, pct: total ? Math.round((v.p / total) * 100) : 0 };
      }).sort((a, b) => a.key.localeCompare(b.key));
      setSummary({ totalDays: dates.size, perStudent, perClass });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, from, to, debouncedName, classFilter, sectionFilter, students.length]);

  const exportCSV = async () => {
    setExporting(true);
    try {
      let q = supabase.from("attendance").select("id, date, status, marked_by, student_id")
        .gte("date", from).lte("date", to);
      if (statusFilter) q = q.eq("status", statusFilter);
      if (studentsScoped) q = q.in("student_id", filteredStudentIds.length ? filteredStudentIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data, error } = await q.order("date", { ascending: false }).limit(10000);
      if (error) throw error;
      const lines = ["student_name,roll_number,class,section,date,status,marked_by"];
      (data ?? []).forEach((r: any) => {
        const s = studentMap[r.student_id];
        const name = (s?.full_name ?? "").replace(/"/g, '""');
        const marker = (profiles[r.marked_by ?? ""] ?? "").replace(/"/g, '""');
        lines.push(`"${name}","${s?.roll_number ?? ""}","${s?.class ?? ""}","${s?.section ?? ""}",${r.date},${r.status},"${marker}"`);
      });
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${from}_to_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data?.length ?? 0} rows`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Reports & History</h1>
            <p className="text-xs text-muted-foreground truncate">Attendance analytics</p>
          </div>
          <Button onClick={exportCSV} disabled={exporting} size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 space-y-5">
        {/* Filters */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="h-3.5 w-3.5" /> Filters</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} min={from} max={todayISO()} onChange={e => setTo(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Student</label>
              <Input value={nameQ} onChange={e => setNameQ(e.target.value)} placeholder="name / roll" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Class</label>
              <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setSectionFilter(""); }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">All</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Section</label>
              <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">All</option>
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">All</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryCard label="Total days in range" value={summary.totalDays} />
          <SummaryCard label="Records on this page" value={rows.length} />
          <SummaryCard label="Total matching" value={total} />
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Most absent students</h2>
            {summary.perStudent.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data in range.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.perStudent.slice(0, 5).map(s => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <Link to={`/student/${s.id}`} className="flex-1 truncate hover:underline">{s.name}</Link>
                    <span className="text-xs text-destructive">{s.absent} absent</span>
                    <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Class-wise attendance</h2>
            {summary.perClass.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data in range.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.perClass.map(c => (
                  <li key={c.key} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">Class {c.key}</span>
                    <span className="text-xs text-muted-foreground">{c.present}P / {c.absent}A</span>
                    <span className="text-xs font-medium tabular-nums w-10 text-right">{c.pct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Class</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">Marked by</th>
                </tr>
              </thead>
              <tbody>
                {fetching ? (
                  <TableRowsSkeleton rows={6} cols={5} />
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No records found</td></tr>
                ) : rows.map(r => {
                  const s = studentMap[r.student_id];
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link to={`/student/${r.student_id}`} className="hover:underline">{s?.full_name ?? "—"}</Link>
                        <div className="text-xs text-muted-foreground">Roll {s?.roll_number ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{s ? `${s.class}-${s.section}` : "—"}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{r.date}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          r.status === "Present"
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                            : "bg-destructive/15 border-destructive/40 text-destructive"
                        }`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{profiles[r.marked_by ?? ""] ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border text-xs">
            <div className="text-muted-foreground">Page {page + 1} / {totalPages} • {total} records</div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0 || fetching} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || fetching} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const SummaryCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
  </div>
);