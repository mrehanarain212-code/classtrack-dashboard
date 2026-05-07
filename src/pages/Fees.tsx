import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Bell, Download, Plus, Wallet, Trash2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

type Status = "unpaid" | "partial" | "paid";
interface Student { id: string; full_name: string; roll_number: string; class: string; section: string; }
interface Fee { id: string; student_id: string; month: number; year: number; total_fee: number; due_date: string; status: Status; }
interface Payment { id: string; student_id: string; fee_id: string | null; amount: number; payment_date: string; method: string; note: string | null; }

const METHODS = ["cash", "easypaisa", "jazzcash", "bank", "other"] as const;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function statusBadge(s: Status) {
  if (s === "paid") return <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">Paid</Badge>;
  if (s === "partial") return <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">Partial</Badge>;
  return <Badge className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/20">Unpaid</Badge>;
}

export default function Fees() {
  const { isAdmin, isParent, schoolId } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 200);
  const [createOpen, setCreateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<{ student: Student; fee?: Fee } | null>(null);

  async function load() {
    setLoading(true);
    let studentQuery = supabase.from("students").select("id,full_name,roll_number,class,section").order("class").order("roll_number");
    if (isParent) {
      const { data: links } = await supabase.from("parent_student").select("student_id");
      const ids = (links ?? []).map((l: any) => l.student_id);
      if (!ids.length) { setStudents([]); setFees([]); setPayments([]); setLoading(false); return; }
      studentQuery = studentQuery.in("id", ids);
    }
    const [{ data: studs, error: e1 }, { data: fs, error: e2 }, { data: ps, error: e3 }] = await Promise.all([
      studentQuery,
      supabase.from("fees").select("id,student_id,month,year,total_fee,due_date,status").eq("month", month).eq("year", year),
      supabase.from("payments").select("id,student_id,fee_id,amount,payment_date,method,note").order("payment_date", { ascending: false }),
    ]);
    if (e1 || e2 || e3) toast.error((e1 || e2 || e3)!.message);
    setStudents((studs ?? []) as Student[]);
    setFees(((fs ?? []) as any[]).map(f => ({ ...f, total_fee: Number(f.total_fee) })));
    setPayments(((ps ?? []) as any[]).map(p => ({ ...p, amount: Number(p.amount) })));
    setLoading(false);
  }

  useEffect(() => { if (schoolId) load(); /* eslint-disable-next-line */ }, [schoolId, month, year, isParent]);

  const filtered = useMemo(() => {
    const t = dq.trim().toLowerCase();
    if (!t) return students;
    return students.filter(s =>
      s.full_name.toLowerCase().includes(t) ||
      s.roll_number.toLowerCase().includes(t) ||
      `${s.class}${s.section}`.toLowerCase().includes(t)
    );
  }, [students, dq]);

  const paidByFee = useMemo(() => {
    const m: Record<string, number> = {};
    payments.forEach(p => { if (p.fee_id) m[p.fee_id] = (m[p.fee_id] ?? 0) + p.amount; });
    return m;
  }, [payments]);

  const monthCollected = useMemo(() => {
    const ym = `${year}-${String(month).padStart(2,"0")}`;
    return payments.filter(p => p.payment_date.startsWith(ym)).reduce((s, p) => s + p.amount, 0);
  }, [payments, month, year]);

  const totalDue = fees.reduce((s, f) => s + f.total_fee, 0);
  const totalPaidMonth = fees.reduce((s, f) => s + (paidByFee[f.id] ?? 0), 0);
  const totalPending = Math.max(0, totalDue - totalPaidMonth);

  function exportCSV() {
    const rows = [["Roll","Name","Class","Month","Year","Total","Paid","Remaining","Status","Due Date"]];
    filtered.forEach(s => {
      const fee = fees.find(f => f.student_id === s.id);
      if (!fee) return;
      const paid = paidByFee[fee.id] ?? 0;
      rows.push([s.roll_number, s.full_name, `${s.class}-${s.section}`, String(month), String(year),
        fee.total_fee.toFixed(2), paid.toFixed(2), (fee.total_fee - paid).toFixed(2), fee.status, fee.due_date]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fees_${year}_${String(month).padStart(2,"0")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppLayout title="Fees" subtitle={`${MONTHS[month-1]} ${year}`}>
      <section className="mx-auto max-w-5xl px-3 sm:px-4 py-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m,i) => <SelectItem key={m} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[year-1, year, year+1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Search name / roll / class" value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-w-[160px]" />
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New fee</Button>
            </>
          )}
        </div>

        {/* Admin stats */}
        {(isAdmin || !isParent) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Total billed" value={fmt(totalDue)} />
            <Stat label="Collected" value={fmt(totalPaidMonth)} tone="ok" />
            <Stat label="Pending" value={fmt(totalPending)} tone={totalPending > 0 ? "bad" : undefined} />
            <Stat label="This month rcvd" value={fmt(monthCollected)} />
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No students found.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => {
              const fee = fees.find(f => f.student_id === s.id);
              const paid = fee ? (paidByFee[fee.id] ?? 0) : 0;
              const remaining = fee ? Math.max(0, fee.total_fee - paid) : 0;
              const overdue = fee && fee.status !== "paid" && new Date(fee.due_date) < new Date(new Date().toDateString());
              const sPays = payments.filter(p => p.student_id === s.id && fee && p.fee_id === fee.id);
              return (
                <FeeCard
                  key={s.id} student={s} fee={fee} paid={paid} remaining={remaining}
                  overdue={!!overdue} payments={sPays}
                  canEdit={isAdmin}
                  onPay={() => setPayOpen({ student: s, fee })}
                  onDeleted={load}
                />
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && (
        <CreateFeeDialog
          open={createOpen} onOpenChange={setCreateOpen}
          students={students} month={month} year={year} onSaved={load}
        />
      )}
      {isAdmin && payOpen && (
        <RecordPaymentDialog
          open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}
          student={payOpen.student} fee={payOpen.fee} month={month} year={year} onSaved={load}
        />
      )}
    </AppLayout>
  );
}

function fmt(n: number) { return `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function FeeCard({ student, fee, paid, remaining, overdue, payments, canEdit, onPay, onDeleted }: {
  student: Student; fee?: Fee; paid: number; remaining: number; overdue: boolean;
  payments: Payment[]; canEdit: boolean; onPay: () => void; onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function deleteFee() {
    if (!fee) return;
    if (!confirm("Delete this fee record? Linked payments will remain in history.")) return;
    const { error } = await supabase.from("fees").delete().eq("id", fee.id);
    if (error) toast.error(error.message); else { toast.success("Fee deleted"); onDeleted(); }
  }

  async function sendReminder() {
    if (!fee) return;
    const { data, error } = await supabase.rpc("send_fee_reminder", { _fee_id: fee.id });
    if (error) toast.error(error.message);
    else toast.success(`Reminder sent to ${data ?? 0} parent(s)`);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{student.full_name}</div>
          <div className="text-[11px] text-muted-foreground">Class {student.class}-{student.section} • Roll {student.roll_number}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {fee ? statusBadge(fee.status) : <Badge variant="outline" className="text-muted-foreground">No fee</Badge>}
        </div>
      </div>

      {fee && (
        <>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Mini label="Total" value={fmt(fee.total_fee)} />
            <Mini label="Paid" value={fmt(paid)} tone="ok" />
            <Mini label="Remaining" value={fmt(remaining)} tone={remaining > 0 ? "bad" : "ok"} />
          </div>

          {overdue && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Overdue since {fee.due_date}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="text-[11px] text-muted-foreground">Due {fee.due_date}</div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
                {open ? "Hide" : `History (${payments.length})`}
              </Button>
              {canEdit && (
                <>
                  <Button size="sm" onClick={onPay} disabled={fee.status === "paid"}>
                    <Wallet className="h-4 w-4" />Add payment
                  </Button>
                  {fee.status !== "paid" && (
                    <Button variant="outline" size="sm" onClick={sendReminder}>
                      <Bell className="h-4 w-4" />Remind
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={deleteFee} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {open && (
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              {payments.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No payments yet.</div>
              ) : payments.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div>{fmt(p.amount)} <span className="text-xs text-muted-foreground capitalize">• {p.method}</span></div>
                    {p.note && <div className="text-[11px] text-muted-foreground truncate">{p.note}</div>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{p.payment_date}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!fee && canEdit && (
        <div className="mt-3 text-xs text-muted-foreground">Use "New fee" to bill this student for the month.</div>
      )}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-2">
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function CreateFeeDialog({ open, onOpenChange, students, month, year, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  students: Student[]; month: number; year: number; onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [total, setTotal] = useState("");
  const [due, setDue] = useState(`${year}-${String(month).padStart(2,"0")}-10`);
  const [bulk, setBulk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDue(`${year}-${String(month).padStart(2,"0")}-10`); }, [month, year]);

  async function save() {
    const amount = Number(total);
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Enter a valid amount");
    if (!due) return toast.error("Pick a due date");
    setSaving(true);
    try {
      const rows = (bulk ? students : students.filter(s => s.id === studentId)).map(s => ({
        student_id: s.id, month, year, total_fee: amount, due_date: due,
      }));
      if (!rows.length) return toast.error("Select a student");
      const { error } = await supabase.from("fees").upsert(rows as any, { onConflict: "student_id,month,year" });
      if (error) throw error;
      toast.success(bulk ? `Billed ${rows.length} students` : "Fee created");
      onOpenChange(false); setStudentId(""); setTotal(""); setBulk(false);
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New fee — {MONTHS[month-1]} {year}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <input id="bulk" type="checkbox" checked={bulk} onChange={e => setBulk(e.target.checked)} className="accent-primary" />
            <Label htmlFor="bulk">Apply to all students</Label>
          </div>
          {!bulk && (
            <div>
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>{students.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name} • {s.class}-{s.section} • {s.roll_number}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Total fee (Rs)</Label>
            <Input type="number" min="0" step="1" value={total} onChange={e => setTotal(e.target.value)} />
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
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

function RecordPaymentDialog({ open, onOpenChange, student, fee, month, year, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  student: Student; fee?: Fee; month: number; year: number; onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [method, setMethod] = useState<typeof METHODS[number]>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fee) return toast.error("Create a fee record first");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      const { error } = await supabase.from("payments").insert({
        student_id: student.id, fee_id: fee.id, amount: amt, payment_date: date, method, note: note || null,
      } as any);
      if (error) throw error;
      toast.success("Payment recorded");
      onOpenChange(false); setAmount(""); setNote("");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">{student.full_name} • {MONTHS[month-1]} {year}</div>
        <div className="space-y-3">
          <div>
            <Label>Amount (Rs)</Label>
            <Input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map(m => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} maxLength={200} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !fee}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}