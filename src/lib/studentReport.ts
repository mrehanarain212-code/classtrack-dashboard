import { supabase } from "@/integrations/supabase/client";

export async function generateStudentReport(studentId: string) {
  const [{ data: student }, { data: school }, { data: rows }] = await Promise.all([
    supabase.from("students").select("full_name,roll_number,class,section,parent_name,parent_contact").eq("id", studentId).maybeSingle(),
    supabase.from("schools").select("name").limit(1).maybeSingle(),
    supabase.from("attendance").select("date,status").eq("student_id", studentId).order("date", { ascending: false }).limit(365),
  ]);
  if (!student) throw new Error("Student not found");

  const since = new Date(); since.setDate(since.getDate() - 29);
  const sinceISO = since.toISOString().slice(0, 10);
  const last30 = (rows ?? []).filter(r => r.date >= sinceISO);
  const present = last30.filter(r => r.status === "Present").length;
  const total = last30.length;
  const pct = total ? Math.round((present / total) * 100) : 0;

  const today = new Date();
  const grid: { date: string; status: string | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const r = (rows ?? []).find(x => x.date === ds);
    grid.push({ date: ds, status: r?.status ?? null });
  }

  const cellRows = grid.map(g => {
    const color = g.status === "Present" ? "#10b981" : g.status === "Absent" ? "#ef4444" : "#e5e7eb";
    const label = g.status === "Present" ? "P" : g.status === "Absent" ? "A" : "—";
    return `<td style="padding:6px;border:1px solid #e5e7eb;text-align:center;background:${color}15;color:${color};font-weight:600">${label}</td><td style="padding:6px;border:1px solid #e5e7eb;font-size:11px;color:#475569">${g.date}</td>`;
  });
  const tableRows: string[] = [];
  for (let i = 0; i < cellRows.length; i += 5) {
    tableRows.push(`<tr>${cellRows.slice(i, i + 5).join("")}</tr>`);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Report - ${student.full_name}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:32px;color:#0f172a;background:#fff}
  h1{margin:0 0 4px;font-size:22px}
  .muted{color:#64748b;font-size:12px}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:16px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
  .stat{border:1px solid #e2e8f0;border-radius:12px;padding:12px}
  .stat .v{font-size:22px;font-weight:700;margin-top:4px}
  table{border-collapse:collapse;width:100%;margin-top:8px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .logo{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
  @media print{.noprint{display:none}}
</style></head><body>
  <div class="brand"><div class="logo">CT</div><div><div style="font-weight:600">${school?.name ?? "ClassTrack"}</div><div class="muted">Student Attendance Report</div></div></div>
  <h1>${student.full_name}</h1>
  <div class="muted">Roll ${student.roll_number} • Class ${student.class}-${student.section}${student.parent_name ? ` • Parent: ${student.parent_name}` : ""}${student.parent_contact ? ` (${student.parent_contact})` : ""}</div>
  <div class="grid">
    <div class="stat"><div class="muted">Attendance</div><div class="v" style="color:${pct >= 75 ? "#10b981" : "#ef4444"}">${pct}%</div></div>
    <div class="stat"><div class="muted">Days marked</div><div class="v">${total}</div></div>
    <div class="stat"><div class="muted">Present</div><div class="v" style="color:#10b981">${present}</div></div>
    <div class="stat"><div class="muted">Absent</div><div class="v" style="color:#ef4444">${total - present}</div></div>
  </div>
  <div class="card">
    <div style="font-weight:600;margin-bottom:6px">Last 30 days</div>
    <table>${tableRows.join("")}</table>
  </div>
  <div class="muted" style="margin-top:24px">Generated ${new Date().toLocaleString()}</div>
  <div class="noprint" style="margin-top:18px"><button onclick="window.print()" style="padding:10px 18px;background:#6366f1;color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer">Save as PDF / Print</button></div>
  <script>setTimeout(()=>window.print(),400)</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup blocked");
  w.document.write(html);
  w.document.close();
}