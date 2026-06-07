import { supabase } from "@/integrations/supabase/client";
import { calcGrade } from "./grading";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export async function generateReportCard(studentId: string, examId: string) {
  const [{ data: student }, { data: school }, { data: exam }, { data: results }, { data: subjects }, { data: att }] = await Promise.all([
    supabase.from("students").select("full_name,roll_number,class,section,parent_name").eq("id", studentId).maybeSingle(),
    supabase.from("schools").select("name").limit(1).maybeSingle(),
    supabase.from("exams").select("title,exam_type,start_date,end_date,class").eq("id", examId).maybeSingle(),
    supabase.from("results").select("subject_id,obtained_marks,total_marks,grade,remarks").eq("exam_id", examId).eq("student_id", studentId),
    supabase.from("subjects").select("id,name,code"),
    supabase.from("attendance").select("status").eq("student_id", studentId),
  ]);
  if (!student || !exam) throw new Error("Missing data");

  const subjMap = new Map<string, { name: string; code: string | null }>();
  (subjects ?? []).forEach((s: any) => subjMap.set(s.id, { name: s.name, code: s.code }));

  const rows = (results ?? []).map((r: any) => {
    const subj = subjMap.get(r.subject_id);
    const obt = Number(r.obtained_marks); const tot = Number(r.total_marks);
    const pct = tot ? (obt / tot) * 100 : 0;
    return { subject: subj?.name ?? "—", code: subj?.code ?? "", obt, tot, pct, grade: r.grade ?? calcGrade(pct), remarks: r.remarks ?? "" };
  });

  const totalObt = rows.reduce((s, r) => s + r.obt, 0);
  const totalMax = rows.reduce((s, r) => s + r.tot, 0);
  const overallPct = totalMax ? (totalObt / totalMax) * 100 : 0;
  const overallGrade = calcGrade(overallPct);

  const present = (att ?? []).filter((a: any) => a.status === "Present").length;
  const totalA = (att ?? []).length;
  const attPct = totalA ? Math.round((present / totalA) * 100) : 0;

  const gradeColor = (g: string) => g === "A" ? "#10b981" : g === "B" ? "#0ea5e9" : g === "C" ? "#f59e0b" : g === "D" ? "#fb923c" : "#ef4444";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Report Card - ${esc(student.full_name)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:32px;color:#0f172a;background:#fff}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.logo{width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
h1{margin:0;font-size:22px}.muted{color:#64748b;font-size:12px}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:16px}
.row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
table{border-collapse:collapse;width:100%;margin-top:8px;font-size:13px}
th,td{padding:8px;border:1px solid #e2e8f0;text-align:left}
th{background:#f8fafc;font-weight:600}
.grade{display:inline-block;padding:2px 8px;border-radius:6px;color:#fff;font-weight:700}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.stat{border:1px solid #e2e8f0;border-radius:12px;padding:12px}
.stat .v{font-size:20px;font-weight:700;margin-top:4px}
@media print{.noprint{display:none}}
</style></head><body>
<div class="brand"><div class="logo">CT</div><div><div style="font-weight:600">${esc(school?.name ?? "ClassTrack")}</div><div class="muted">Report Card • ${esc(exam.exam_type)}</div></div></div>
<div class="row">
  <div>
    <h1>${esc(student.full_name)}</h1>
    <div class="muted">Roll ${esc(student.roll_number)} • Class ${esc(student.class)}-${esc(student.section)}${student.parent_name ? ` • Parent: ${esc(student.parent_name)}` : ""}</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:600">${esc(exam.title)}</div>
    <div class="muted">${esc(exam.start_date)} → ${esc(exam.end_date)}</div>
  </div>
</div>

<div class="card">
  <table>
    <thead><tr><th>Subject</th><th>Code</th><th>Obtained</th><th>Total</th><th>%</th><th>Grade</th><th>Remarks</th></tr></thead>
    <tbody>
      ${rows.length ? rows.map(r => `<tr>
        <td>${esc(r.subject)}</td><td>${esc(r.code)}</td>
        <td>${r.obt}</td><td>${r.tot}</td><td>${r.pct.toFixed(1)}%</td>
        <td><span class="grade" style="background:${gradeColor(r.grade)}">${esc(r.grade)}</span></td>
        <td>${esc(r.remarks)}</td>
      </tr>`).join("") : `<tr><td colspan="7" style="text-align:center;color:#64748b">No marks recorded</td></tr>`}
    </tbody>
  </table>
</div>

<div class="summary">
  <div class="stat"><div class="muted">Total marks</div><div class="v">${totalObt}/${totalMax}</div></div>
  <div class="stat"><div class="muted">Percentage</div><div class="v" style="color:${gradeColor(overallGrade)}">${overallPct.toFixed(1)}%</div></div>
  <div class="stat"><div class="muted">Overall grade</div><div class="v"><span class="grade" style="background:${gradeColor(overallGrade)}">${overallGrade}</span></div></div>
  <div class="stat"><div class="muted">Attendance</div><div class="v" style="color:${attPct >= 75 ? '#10b981' : '#ef4444'}">${attPct}%</div></div>
</div>

<div class="muted" style="margin-top:24px">Generated ${new Date().toLocaleString()}</div>
<div class="noprint" style="margin-top:18px"><button onclick="window.print()" style="padding:10px 18px;background:#6366f1;color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer">Save as PDF / Print</button></div>
<script>setTimeout(()=>window.print(),500)</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup blocked");
  w.document.write(html); w.document.close();
}
