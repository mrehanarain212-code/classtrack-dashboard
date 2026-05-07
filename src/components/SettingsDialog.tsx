import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { toast } from "sonner";

interface Settings {
  alerts_enabled: boolean;
  absence_threshold: number;
  fee_reminder_days: number;
}

const DEFAULTS: Settings = { alerts_enabled: true, absence_threshold: 3, fee_reminder_days: 3 };

export default function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { schoolId } = useAuth();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !schoolId) return;
    setLoading(true);
    supabase.from("school_settings").select("alerts_enabled,absence_threshold,fee_reminder_days").eq("school_id", schoolId).maybeSingle()
      .then(({ data }) => { if (data) setS(data as any); else setS(DEFAULTS); setLoading(false); });
  }, [open, schoolId]);

  async function save() {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await supabase.from("school_settings").upsert({ school_id: schoolId, ...s, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); onOpenChange(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Notification settings</DialogTitle></DialogHeader>
        {loading ? <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div> : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Automatic alerts</div>
                <div className="text-xs text-muted-foreground">Send absence and fee notifications automatically</div>
              </div>
              <Switch checked={s.alerts_enabled} onCheckedChange={(v) => setS({ ...s, alerts_enabled: v })} />
            </div>
            <div>
              <Label>Absence threshold (consecutive days)</Label>
              <Input type="number" min={1} max={30} value={s.absence_threshold}
                onChange={e => setS({ ...s, absence_threshold: Math.max(1, Number(e.target.value) || 1) })} />
              <div className="text-[11px] text-muted-foreground mt-1">Alert parents after this many absent days in a row.</div>
            </div>
            <div>
              <Label>Fee reminder window (days before due)</Label>
              <Input type="number" min={0} max={30} value={s.fee_reminder_days}
                onChange={e => setS({ ...s, fee_reminder_days: Math.max(0, Number(e.target.value) || 0) })} />
              <div className="text-[11px] text-muted-foreground mt-1">Used to flag fees as approaching due date.</div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}