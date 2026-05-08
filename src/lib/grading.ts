export function calcGrade(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}
export function gradeColor(g: string) {
  switch (g) {
    case "A": return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    case "B": return "text-sky-400 border-sky-500/40 bg-sky-500/10";
    case "C": return "text-amber-400 border-amber-500/40 bg-amber-500/10";
    case "D": return "text-orange-400 border-orange-500/40 bg-orange-500/10";
    default:  return "text-destructive border-destructive/40 bg-destructive/10";
  }
}
