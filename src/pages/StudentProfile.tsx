import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import type { Student } from "@/features/students/types";
import { TableRowsSkeleton, StatGridSkeleton } from "@/components/Skeletons";
import AppLayout from "@/components/AppLayout";
import { generateStudentReport } from "@/lib/studentReport";
import { toast } from "sonner";

type Rec = { id: string; date: string; status: string; marked_by: string | null };

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const { session, loading } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setFetching(true);
    Promise.all([
      supabase.from("students").select("*").eq("id", id).maybeSingle(),
      supabase.from("attendance").select("id, date, status, marked_by").eq("student_id", id).order("date", { ascending: false }).limit(500),
      supabase.from("profiles").select("id, full_name"),
    ]).then(([sRes, aRes, pRes]) => {
      if (!active) return;
      setStudent((sRes.data ?? null) as Student | null);
      setRecords((aRes.data ?? []) as Rec[]);
      const m: Record<string, string> = {};
      (pRes.data ?? []).forEach((p: any) => { m[p.id] = p.full_name ?? "—"; });
      setProfiles(m);
      setFetching(false);
    });
    return () => { active = false; };
  }, [id]);

  const stats = useMemo(() => {
    let p = 0, a = 0;
    records.forEach(r => { if (r.status === "Present") p++; else if (r.status === "Absent") a++; });
    const total = p + a;
    return { present: p, absent: a, total, pct: total ? Math.round((p / total) * 100) : 0 };
  }, [records]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;

  return (
    <AppLayout title={student?.full_name ?? "Student"} subtitle={student ? `Roll ${student.roll_number} • Class ${student.class}-${student.section}` : ""}>
      <section className="mx-auto max-w-4xl px-4 py-5 space-y-5">
        {id && (
          <div className="flex justify-end">
            <Button size="sm" onClick={async () => { try { await generateStudentReport(id); } catch (e: any) { toast.error(e?.message ?? "Failed"); } }} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Download className="h-4 w-4" /> Download report
            </Button>
          </div>
        )}
        {fetching ? <StatGridSkeleton /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total days" value={stats.total} />
          <Stat label="Present" value={stats.present} tone="success" />
          <Stat label="Absent" value={stats.absent} tone="danger" />
          <Stat label="Attendance %" value={stats.pct} suffix="%" />
        </div>
        )}

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Marked by</th>
                </tr>
              </thead>
              <tbody>
                {fetching ? (
                  <TableRowsSkeleton rows={5} cols={3} />
                ) : records.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-10 text-center text-muted-foreground">No attendance records</td></tr>
                ) : records.map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs tabular-nums">{r.date}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        r.status === "Present"
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                          : "bg-destructive/15 border-destructive/40 text-destructive"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{profiles[r.marked_by ?? ""] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

const Stat = ({ label, value, tone, suffix }: { label: string; value: number; tone?: "success" | "danger"; suffix?: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-1 text-2xl font-semibold tracking-tight ${
      tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-destructive" : ""
    }`}>{value}{suffix}</div>
  </div>
);