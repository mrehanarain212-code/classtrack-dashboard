import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ClipboardList, FileEdit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const EXAM_TYPES = ["Midterm", "Final", "Monthly", "Quiz"] as const;
interface Exam { id: string; title: string; exam_type: string; class: string; start_date: string; end_date: string; }

export default function Exams() {
  const { isAdmin, isTeacher, schoolId } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("exams").select("id,title,exam_type,class,start_date,end_date").order("start_date", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Exam[]);
    setLoading(false);
  }
  useEffect(() => { if (schoolId) load(); }, [schoolId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => r.title.toLowerCase().includes(t) || r.class.toLowerCase().includes(t) || r.exam_type.toLowerCase().includes(t));
  }, [rows, q]);

  async function remove(id: string) {
    if (!confirm("Delete exam and all results?")) return;
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  }

  return (
    <AppLayout title="Exams" subtitle="Schedule and manage exams">
      <section className="mx-auto max-w-5xl px-3 sm:px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Search title / class / type" value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-w-[180px]" />
          {isAdmin && <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />New exam</Button>}
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-60" />
            No exams yet.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map(e => (
              <div key={e.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Class {e.class} • {e.start_date} → {e.end_date}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0">{e.exam_type}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1 justify-end">
                  {(isAdmin || isTeacher) && (
                    <Button size="sm" variant="outline" onClick={() => nav(`/marks/${e.id}`)}>
                      <FileEdit className="h-4 w-4" />Marks
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(e); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(e.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {isAdmin && <ExamDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />}
    </AppLayout>
  );
}

function ExamDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: Exam | null; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("Midterm");
  const [klass, setKlass] = useState("");
  const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? ""); setType(editing?.exam_type ?? "Midterm");
      setKlass(editing?.class ?? ""); setStart(editing?.start_date ?? ""); setEnd(editing?.end_date ?? "");
    }
  }, [open, editing]);

  async function save() {
    if (!title.trim() || !klass.trim() || !start || !end) return toast.error("All fields required");
    if (end < start) return toast.error("End date must be after start");
    setSaving(true);
    try {
      const payload = { title: title.trim(), exam_type: type, class: klass.trim(), start_date: start, end_date: end };
      if (editing) {
        const { error } = await supabase.from("exams").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exams").insert(payload as any);
        if (error) throw error;
      }
      toast.success("Saved"); onOpenChange(false); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit exam" : "New exam"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Class</Label><Input value={klass} onChange={e => setKlass(e.target.value)} maxLength={20} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><Label>End</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
