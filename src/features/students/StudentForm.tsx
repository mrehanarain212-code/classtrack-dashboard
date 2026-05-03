import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { studentSchema, type Student, type StudentInput } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string;
  editing: Student | null;
  onSaved: (s: Student) => void;
}

const empty: StudentInput = {
  full_name: "", roll_number: "", class: "", section: "",
  date_of_birth: "", parent_name: "", parent_contact: "", address: "", admission_date: "",
};

export default function StudentForm({ open, onOpenChange, schoolId, editing, onSaved }: Props) {
  const [form, setForm] = useState<StudentInput>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        full_name: editing.full_name, roll_number: editing.roll_number,
        class: editing.class, section: editing.section,
        date_of_birth: editing.date_of_birth ?? "", parent_name: editing.parent_name ?? "",
        parent_contact: editing.parent_contact ?? "", address: editing.address ?? "",
        admission_date: editing.admission_date ?? "",
      });
      setPreview(editing.photo_url);
    } else {
      setForm(empty);
      setPreview(null);
    }
    setFile(null);
  }, [editing, open]);

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    if (!f.type.startsWith("image/")) { toast.error("Only images allowed"); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = studentSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      let photo_url = editing?.photo_url ?? null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${schoolId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("student-photos").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        photo_url = supabase.storage.from("student-photos").getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        ...parsed.data,
        date_of_birth: parsed.data.date_of_birth || null,
        admission_date: parsed.data.admission_date || null,
        parent_name: parsed.data.parent_name || null,
        parent_contact: parsed.data.parent_contact || null,
        address: parsed.data.address || null,
        photo_url,
        school_id: schoolId,
      };
      if (editing) {
        const { data, error } = await supabase.from("students").update(payload).eq("id", editing.id).select().single();
        if (error) throw error;
        onSaved(data as Student);
        toast.success("Student updated");
      } else {
        const { data, error } = await supabase.from("students").insert(payload).select().single();
        if (error) throw error;
        onSaved(data as Student);
        toast.success("Student added");
      }
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to save";
      if (msg.includes("duplicate") || err?.code === "23505") toast.error("Roll number already exists");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof StudentInput>(k: K, v: StudentInput[K]) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center border border-border">
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="tap-44">
                {preview ? "Change photo" : "Upload photo"}
              </Button>
              {preview && (
                <Button type="button" variant="ghost" size="icon" onClick={() => { setFile(null); setPreview(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full name *"><Input value={form.full_name} onChange={e => set("full_name", e.target.value)} required className="tap-44" /></Field>
            <Field label="Roll number *"><Input value={form.roll_number} onChange={e => set("roll_number", e.target.value)} required className="tap-44" /></Field>
            <Field label="Class *"><Input value={form.class} onChange={e => set("class", e.target.value)} required className="tap-44" /></Field>
            <Field label="Section *"><Input value={form.section} onChange={e => set("section", e.target.value)} required className="tap-44" /></Field>
            <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} className="tap-44" /></Field>
            <Field label="Admission date"><Input type="date" value={form.admission_date} onChange={e => set("admission_date", e.target.value)} className="tap-44" /></Field>
            <Field label="Parent name"><Input value={form.parent_name} onChange={e => set("parent_name", e.target.value)} className="tap-44" /></Field>
            <Field label="Parent contact"><Input value={form.parent_contact} onChange={e => set("parent_contact", e.target.value)} className="tap-44" /></Field>
          </div>
          <Field label="Address"><Textarea value={form.address} onChange={e => set("address", e.target.value)} rows={2} /></Field>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 tap-44">Cancel</Button>
            <Button type="submit" disabled={busy} className="flex-1 tap-44 bg-gradient-primary text-primary-foreground hover:opacity-90">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add student"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);