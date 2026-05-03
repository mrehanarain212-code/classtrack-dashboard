import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, LogOut, Plus, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import StudentForm from "@/features/students/StudentForm";
import StudentList from "@/features/students/StudentList";
import type { Student } from "@/features/students/types";

export default function Dashboard() {
  const { session, schoolId, loading, signOut } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [fetching, setFetching] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toDelete, setToDelete] = useState<Student | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    setFetching(true);
    supabase.from("students").select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error(error.message);
      else setStudents((data ?? []) as Student[]);
      setFetching(false);
    });
    return () => { active = false; };
  }, [schoolId]);

  const classes = useMemo(() => Array.from(new Set(students.map(s => s.class))).sort(), [students]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter(s => {
      if (classFilter && s.class !== classFilter) return false;
      if (!needle) return true;
      return s.full_name.toLowerCase().includes(needle)
        || s.roll_number.toLowerCase().includes(needle)
        || `${s.class}-${s.section}`.toLowerCase().includes(needle);
    });
  }, [students, q, classFilter]);

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
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Students" value={students.length} icon={<Users className="h-4 w-4" />} />
          <Stat label="Classes" value={classes.length} />
          <Stat label="Showing" value={filtered.length} />
        </div>

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
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Add student
          </Button>
        </div>

        {fetching ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading students…</div>
        ) : (
          <StudentList students={filtered} onEdit={s => { setEditing(s); setFormOpen(true); }} onDelete={s => setToDelete(s)} />
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

const Stat = ({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
    <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
  </div>
);