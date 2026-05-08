import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Trophy, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { calcGrade, gradeColor } from "@/lib/grading";
import { generateReportCard } from "@/lib/reportCard";
import { toast } from "sonner";

interface Exam { id: string; title: string; class: string; exam_type: string; }
interface Student { id: string; full_name: string; roll_number: string; class: string; section: string; }
interface Subject { id: string; name: string; }
interface Result { student_id: string; subject_id: string; obtained_marks: number; total_marks: number; grade: string | null; }

export default function Results() {
  const { isParent, schoolId } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const { data } = await supabase.from("exams").select("id,title,class,exam_type").order("start_date", { ascending: false }).limit(50);
      setExams((data ?? []) as Exam[]);
      if ((data ?? []).length) setExamId((data as any[])[0].id);
      setLoading(false);
    })();
  }, [schoolId]);

  useEffect(() => {
    if (!examId) return;
    setLoading(true);
    (async () => {
      const exam = exams.find(e => e.id === examId);
      if (!exam) return;
      let studentQuery = supabase.from("students").select("id,full_name,roll_number,class,section").eq("class", exam.class);
      if (isParent) {
        const { data: links } = await supabase.from("parent_student").select("student_id");
        const ids = (links ?? []).map((l: any) => l.student_id);
        if (!ids.length) { setStudents([]); setResults([]); setSubjects([]); setLoading(false); return; }
        studentQuery = studentQuery.in("id", ids);
      }
      const [{ data: studs }, { data: subs }, { data: res }] = await Promise.all([
        studentQuery.order("roll_number"),
        supabase.from("subjects").select("id,name").eq("class", exam.class).order("name"),
        supabase.from("results").select("student_id,subject_id,obtained_marks,total_marks,grade").eq("exam_id", examId),
      ]);
      setStudents((studs ?? []) as Student[]);
      setSubjects((subs ?? []) as Subject[]);
      setResults(((res ?? []) as any[]).map(r => ({ ...r, obtained_marks: Number(r.obtained_marks), total_marks: Number(r.total_marks) })));
      setLoading(false);
    })();
  }, [examId, exams, isParent]);

  const summaries = useMemo(() => {
    const byStudent = new Map<string, { obt: number; tot: number }>();
    results.forEach(r => {
      const cur = byStudent.get(r.student_id) ?? { obt: 0, tot: 0 };
      cur.obt += r.obt ?? r.obtained_marks; cur.tot += r.total_marks;
      byStudent.set(r.student_id, cur);
    });
    const arr = students.map(s => {
      const v = byStudent.get(s.id);
      const pct = v && v.tot ? (v.obt / v.tot) * 100 : null;
      return { student: s, pct, obt: v?.obt ?? 0, tot: v?.tot ?? 0, grade: pct === null ? "—" : calcGrade(pct) };
    });
    return arr;
  }, [students, results]);

  const filtered = summaries.filter(s => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return s.student.full_name.toLowerCase().includes(t) || s.student.roll_number.toLowerCase().includes(t);
  });

  const classAvg = useMemo(() => {
    const valid = summaries.filter(s => s.pct !== null);
    if (!valid.length) return 0;
    return valid.reduce((a, b) => a + (b.pct ?? 0), 0) / valid.length;
  }, [summaries]);

  const toppers = useMemo(() => [...summaries].filter(s => s.pct !== null).sort((a, b) => (b.pct! - a.pct!)).slice(0, 5), [summaries]);
  const passCount = summaries.filter(s => (s.pct ?? 0) >= 60).length;
  const failCount = summaries.filter(s => s.pct !== null && (s.pct ?? 0) < 60).length;

  const subjectAvg = useMemo(() => {
    return subjects.map(sub => {
      const rs = results.filter(r => r.subject_id === sub.id);
      const tot = rs.reduce((a, r) => a + r.total_marks, 0);
      const obt = rs.reduce((a, r) => a + r.obtained_marks, 0);
      return { name: sub.name, avg: tot ? (obt / tot) * 100 : 0, count: rs.length };
    });
  }, [subjects, results]);

  async function downloadCard(studentId: string) {
    try { await generateReportCard(studentId, examId); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <AppLayout title="Results" subtitle="Exam results & report cards">
      <section className="mx-auto max-w-6xl px-3 sm:px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select exam" /></SelectTrigger>
            <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.title} • Class {e.class}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Search student" value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-w-[160px]" />
        </div>

        {!isParent && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Class average" value={`${classAvg.toFixed(1)}%`} />
            <Stat label="Passed" value={String(passCount)} tone="ok" />
            <Stat label="Failed" value={String(failCount)} tone={failCount ? "bad" : undefined} />
            <Stat label="Students" value={String(students.length)} />
          </div>
        )}

        {!isParent && toppers.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-amber-400" /> Top performers</div>
            <div className="grid sm:grid-cols-5 gap-2">
              {toppers.map((t, i) => (
                <div key={t.student.id} className="rounded-lg border border-border p-2">
                  <div className="text-[10px] text-muted-foreground">#{i+1} • Roll {t.student.roll_number}</div>
                  <div className="font-medium truncate text-sm">{t.student.full_name}</div>
                  <div className="text-emerald-400 text-sm font-semibold">{t.pct?.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isParent && subjectAvg.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> Subject performance</div>
            <div className="space-y-2">
              {subjectAvg.map(s => (
                <div key={s.name}>
                  <div className="flex justify-between text-xs mb-0.5"><span>{s.name}</span><span className="text-muted-foreground">{s.avg.toFixed(1)}% ({s.count})</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${Math.min(100, s.avg)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No results yet. Add subjects, then enter marks for the exam.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(({ student, pct, obt, tot, grade }) => (
              <div key={student.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{student.full_name}</div>
                  <div className="text-[11px] text-muted-foreground">Roll {student.roll_number} • Class {student.class}-{student.section}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-semibold">{obt}/{tot}</div>
                    <div className="text-[11px] text-muted-foreground">{pct === null ? "No marks" : `${pct.toFixed(1)}%`}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs border ${pct === null ? "text-muted-foreground border-border" : gradeColor(grade)}`}>{grade}</span>
                  <Button size="sm" variant="outline" onClick={() => downloadCard(student.id)}>
                    <FileText className="h-4 w-4" />Card
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
