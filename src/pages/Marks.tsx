import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { calcGrade, gradeColor } from "@/lib/grading";

interface Exam { id: string; title: string; exam_type: string; class: string; }
interface Student { id: string; full_name: string; roll_number: string; }
interface Subject { id: string; name: string; }
interface Result { id?: string; student_id: string; subject_id: string; obtained_marks: number; total_marks: number; grade?: string | null; remarks?: string | null; }

export default function Marks() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { isAdmin, isTeacher, schoolId } = useAuth();
  const canEdit = isAdmin || isTeacher;

  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [marks, setMarks] = useState<Record<string, Result>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    const { data: ex } = await supabase.from("exams").select("id,title,exam_type,class").eq("id", id).maybeSingle();
    if (!ex) { toast.error("Exam not found"); setLoading(false); return; }
    setExam(ex as Exam);
    const [{ data: studs }, { data: subs }] = await Promise.all([
      supabase.from("students").select("id,full_name,roll_number").eq("class", (ex as any).class).order("roll_number"),
      supabase.from("subjects").select("id,name").eq("class", (ex as any).class).order("name"),
    ]);
    setStudents((studs ?? []) as Student[]);
    setSubjects((subs ?? []) as Subject[]);
    if ((subs ?? []).length && !subjectId) setSubjectId((subs as any[])[0].id);
    setLoading(false);
  }
  useEffect(() => { if (schoolId && id) loadAll(); }, [schoolId, id]);

  useEffect(() => {
    if (!id || !subjectId) return;
    (async () => {
      const { data } = await supabase.from("results").select("id,student_id,subject_id,obtained_marks,total_marks,grade,remarks").eq("exam_id", id).eq("subject_id", subjectId);
      const m: Record<string, Result> = {};
      (data ?? []).forEach((r: any) => { m[r.student_id] = { ...r, obtained_marks: Number(r.obtained_marks), total_marks: Number(r.total_marks) }; });
      setMarks(m);
    })();
  }, [id, subjectId]);

  function setField(studentId: string, patch: Partial<Result>) {
    setMarks(prev => ({
      ...prev,
      [studentId]: { student_id: studentId, subject_id: subjectId, obtained_marks: 0, total_marks: 100, ...prev[studentId], ...patch },
    }));
  }

  async function saveAll() {
    if (!id || !subjectId) return;
    const rows = Object.values(marks).filter(r => r.obtained_marks !== undefined && r.total_marks > 0);
    if (!rows.length) return toast.error("Nothing to save");
    setSaving(true);
    const payload = rows.map(r => ({
      id: r.id, exam_id: id, student_id: r.student_id, subject_id: subjectId,
      obtained_marks: Number(r.obtained_marks), total_marks: Number(r.total_marks),
      remarks: r.remarks ?? null,
    }));
    const { error } = await supabase.from("results").upsert(payload as any, { onConflict: "exam_id,student_id,subject_id" });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Marks saved"); }
  }

  function exportCSV() {
    if (!exam) return;
    const subj = subjects.find(s => s.id === subjectId)?.name ?? "";
    const rows = [["Roll", "Name", "Subject", "Obtained", "Total", "Percent", "Grade", "Remarks"]];
    students.forEach(s => {
      const r = marks[s.id];
      if (!r) return;
      const pct = r.total_marks ? (r.obtained_marks / r.total_marks) * 100 : 0;
      rows.push([s.roll_number, s.full_name, subj, String(r.obtained_marks), String(r.total_marks), pct.toFixed(1), calcGrade(pct), r.remarks ?? ""]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${exam.title}_${subj}.csv`.replace(/\s+/g,"_"); a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout title="Marks entry" subtitle={exam ? `${exam.title} • Class ${exam.class}` : ""}>
      <section className="mx-auto max-w-5xl px-3 sm:px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={() => nav("/exams")}><ArrowLeft className="h-4 w-4" />Back</Button>
          <div className="flex-1" />
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select subject" /></SelectTrigger>
            <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button>
          {canEdit && <Button size="sm" onClick={saveAll} disabled={saving || !subjectId}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}</Button>}
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !subjects.length ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No subjects for class {exam?.class}. Add subjects first.
          </div>
        ) : !students.length ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No students in class {exam?.class}.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <div className="col-span-5 sm:col-span-4">Student</div>
              <div className="col-span-2 text-center">Obtained</div>
              <div className="col-span-2 text-center">Total</div>
              <div className="col-span-3 sm:col-span-2 text-center">Grade</div>
              <div className="hidden sm:block sm:col-span-2">Remarks</div>
            </div>
            <div className="divide-y divide-border">
              {students.map(s => {
                const r = marks[s.id];
                const obt = Number(r?.obtained_marks ?? 0);
                const tot = Number(r?.total_marks ?? 100);
                const pct = tot > 0 ? (obt / tot) * 100 : 0;
                const g = r ? calcGrade(pct) : "—";
                return (
                  <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm">
                    <div className="col-span-5 sm:col-span-4 min-w-0">
                      <div className="truncate font-medium">{s.full_name}</div>
                      <div className="text-[10px] text-muted-foreground">Roll {s.roll_number}</div>
                    </div>
                    <Input className="col-span-2 h-8 text-center" type="number" min="0" disabled={!canEdit}
                      value={r?.obtained_marks ?? ""} onChange={e => setField(s.id, { obtained_marks: Number(e.target.value) })} />
                    <Input className="col-span-2 h-8 text-center" type="number" min="1" disabled={!canEdit}
                      value={r?.total_marks ?? 100} onChange={e => setField(s.id, { total_marks: Number(e.target.value) })} />
                    <div className="col-span-3 sm:col-span-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs border ${r ? gradeColor(g) : "text-muted-foreground border-border"}`}>{g}{r ? ` • ${pct.toFixed(0)}%` : ""}</span>
                    </div>
                    <Input className="hidden sm:block sm:col-span-2 h-8" disabled={!canEdit} placeholder="Remarks"
                      value={r?.remarks ?? ""} onChange={e => setField(s.id, { remarks: e.target.value })} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
