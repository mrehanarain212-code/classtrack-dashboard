import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import StudentForm from "@/features/students/StudentForm";
import StudentList from "@/features/students/StudentList";
import type { Student } from "@/features/students/types";
import { StudentRowSkeleton } from "@/components/Skeletons";
import { useDebounce } from "@/hooks/useDebounce";
import AppLayout from "@/components/AppLayout";

const PAGE_SIZE = 20;

export default function Students() {
  const { session, schoolId, isAdmin, isParent, loading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [fetching, setFetching] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [toDelete, setToDelete] = useState<Student | null>(null);
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

  const classes = useMemo(() => Array.from(new Set(students.map(s => s.class))).sort(), [students]);

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
    if (error) { setStudents(snapshot); toast.error(error.message); }
    else toast.success("Student deleted");
    setToDelete(null);
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (isParent) return <Navigate to="/parent" replace />;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const isEmpty = !fetching && students.length === 0;

  return (
    <AppLayout title="Students" subtitle="Manage your student roster">
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Students</h1>
            <p className="text-sm text-muted-foreground">{students.length} enrolled</p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Add student
            </Button>
          )}
        </div>

        {isEmpty ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-muted grid place-items-center mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold">No students yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {isAdmin ? "Add your first student to start tracking attendance, fees, and results." : "Ask an admin to add students to this school."}
            </p>
            {isAdmin && (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="mt-5 bg-gradient-primary text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" /> Add your first student
              </Button>
            )}
          </div>
        ) : (
          <>
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