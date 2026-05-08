import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface Subject { id: string; name: string; class: string; code: string | null; }

export default function Subjects() {
  const { isAdmin, schoolId } = useAuth();
  const [rows, setRows] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Subject | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("subjects").select("id,name,class,code").order("class").order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Subject[]);
    setLoading(false);
  }
  useEffect(() => { if (schoolId) load(); }, [schoolId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(t) || r.class.toLowerCase().includes(t) || (r.code ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  async function remove(id: string) {
    if (!confirm("Delete this subject? Linked results will be removed.")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  }

  return (
    <AppLayout title="Subjects" subtitle="Manage class subjects">
      <section className="mx-auto max-w-4xl px-3 sm:px-4 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Search name / class / code" value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-w-[180px]" />
          {isAdmin && <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />New subject</Button>}
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-60" />
            No subjects yet.{isAdmin && " Click \"New subject\" to add."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name} {s.code && <span className="text-xs text-muted-foreground">({s.code})</span>}</div>
                  <div className="text-[11px] text-muted-foreground">Class {s.class}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      {isAdmin && <SubjectDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />}
    </AppLayout>
  );
}

function SubjectDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; editing: Subject | null; onSaved: () => void;
}) {
  const [name, setName] = useState(""); const [klass, setKlass] = useState(""); const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setName(editing?.name ?? ""); setKlass(editing?.class ?? ""); setCode(editing?.code ?? ""); }
  }, [open, editing]);

  async function save() {
    if (!name.trim() || !klass.trim()) return toast.error("Name and class required");
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("subjects").update({ name: name.trim(), class: klass.trim(), code: code.trim() || null }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subjects").insert({ name: name.trim(), class: klass.trim(), code: code.trim() || null } as any);
        if (error) throw error;
      }
      toast.success("Saved"); onOpenChange(false); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></div>
          <div><Label>Class</Label><Input value={klass} onChange={e => setKlass(e.target.value)} maxLength={20} placeholder="e.g. 5" /></div>
          <div><Label>Code (optional)</Label><Input value={code} onChange={e => setCode(e.target.value)} maxLength={20} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
