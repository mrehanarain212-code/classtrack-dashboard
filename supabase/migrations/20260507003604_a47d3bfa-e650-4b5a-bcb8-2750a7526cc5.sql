
-- 1. school_settings
CREATE TABLE public.school_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  alerts_enabled boolean NOT NULL DEFAULT true,
  absence_threshold smallint NOT NULL DEFAULT 3,
  fee_reminder_days smallint NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view school settings" ON public.school_settings
FOR SELECT TO authenticated USING (school_id = public.current_school_id());

CREATE POLICY "admin upsert settings" ON public.school_settings
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') AND school_id = public.current_school_id());

CREATE POLICY "admin update settings" ON public.school_settings
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') AND school_id = public.current_school_id())
WITH CHECK (school_id = public.current_school_id());

-- 2. notifications: add category
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system';
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- Allow admin/teacher to insert notifications for their school (for "Send Reminder" + future use)
CREATE POLICY "school staff insert notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher'))
);

-- 3. notification_logs
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id uuid,
  channel text NOT NULL DEFAULT 'in_app', -- in_app | whatsapp | sms | email
  recipient text,                          -- phone or email used
  delivery_status text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  provider text,
  provider_message_id text,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notif_logs_school_created ON public.notification_logs(school_id, created_at DESC);

CREATE POLICY "view school notification logs" ON public.notification_logs
FOR SELECT TO authenticated USING (school_id = public.current_school_id());

CREATE POLICY "admin insert notification logs" ON public.notification_logs
FOR INSERT TO authenticated
WITH CHECK (school_id = public.current_school_id()
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher')));

-- 4. Update absent trigger to respect alerts_enabled + tag category
CREATE OR REPLACE FUNCTION public.notify_parents_on_absent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s_name text; s_roll text; enabled boolean;
BEGIN
  IF NEW.status <> 'Absent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'Absent' THEN RETURN NEW; END IF;

  SELECT alerts_enabled INTO enabled FROM public.school_settings WHERE school_id = NEW.school_id;
  IF enabled IS NOT NULL AND enabled = false THEN RETURN NEW; END IF;

  SELECT full_name, roll_number INTO s_name, s_roll FROM public.students WHERE id = NEW.student_id;

  INSERT INTO public.notifications(user_id, school_id, type, category, title, body, link)
  SELECT ps.parent_id, NEW.school_id, 'child_absent', 'attendance',
    'Absence on ' || NEW.date::text,
    s_name || ' (Roll ' || s_roll || ') was marked absent.',
    '/parent'
  FROM public.parent_student ps WHERE ps.student_id = NEW.student_id;

  RETURN NEW;
END; $$;

-- 5. Consecutive absence trigger
CREATE OR REPLACE FUNCTION public.notify_consecutive_absences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  threshold smallint; enabled boolean;
  streak int := 0; prev date; cur record;
  s_name text; s_roll text;
BEGIN
  IF NEW.status <> 'Absent' THEN RETURN NEW; END IF;

  SELECT alerts_enabled, absence_threshold INTO enabled, threshold
  FROM public.school_settings WHERE school_id = NEW.school_id;
  IF enabled IS NOT NULL AND enabled = false THEN RETURN NEW; END IF;
  IF threshold IS NULL THEN threshold := 3; END IF;

  -- count consecutive absent days ending at NEW.date (any prior 'Present' breaks streak)
  prev := NEW.date + INTERVAL '1 day';
  FOR cur IN
    SELECT date, status FROM public.attendance
    WHERE student_id = NEW.student_id AND date <= NEW.date
    ORDER BY date DESC LIMIT 60
  LOOP
    IF cur.date = prev - INTERVAL '1 day' AND cur.status = 'Absent' THEN
      streak := streak + 1;
      prev := cur.date;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  IF streak < threshold THEN RETURN NEW; END IF;

  SELECT full_name, roll_number INTO s_name, s_roll FROM public.students WHERE id = NEW.student_id;

  INSERT INTO public.notifications(user_id, school_id, type, category, title, body, link)
  SELECT ps.parent_id, NEW.school_id, 'consecutive_absent', 'attendance',
    s_name || ' absent ' || streak || ' days in a row',
    'Roll ' || s_roll || ' has been marked absent for ' || streak || ' consecutive days.',
    '/parent'
  FROM public.parent_student ps WHERE ps.student_id = NEW.student_id;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_consecutive ON public.attendance;
CREATE TRIGGER trg_notify_consecutive
AFTER INSERT OR UPDATE OF status ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_consecutive_absences();

REVOKE EXECUTE ON FUNCTION public.notify_consecutive_absences() FROM anon, public;

-- 6. RPC: admin sends fee reminder
CREATE OR REPLACE FUNCTION public.send_fee_reminder(_fee_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f record; s_name text; s_roll text; cnt int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can send reminders';
  END IF;

  SELECT * INTO f FROM public.fees WHERE id = _fee_id;
  IF NOT FOUND OR f.school_id <> public.current_school_id() THEN
    RAISE EXCEPTION 'Fee not found';
  END IF;

  SELECT full_name, roll_number INTO s_name, s_roll FROM public.students WHERE id = f.student_id;

  WITH ins AS (
    INSERT INTO public.notifications(user_id, school_id, type, category, title, body, link)
    SELECT ps.parent_id, f.school_id, 'fee_reminder', 'fee',
      'Fee reminder: ' || s_name,
      'Fee for ' || to_char(make_date(f.year, f.month, 1), 'Mon YYYY') ||
      ' (Rs ' || f.total_fee || ') is due ' || f.due_date::text || '.',
      '/fees'
    FROM public.parent_student ps WHERE ps.student_id = f.student_id
    RETURNING id, user_id
  )
  INSERT INTO public.notification_logs(school_id, notification_id, user_id, channel, delivery_status, payload)
  SELECT f.school_id, ins.id, ins.user_id, 'in_app', 'sent',
    jsonb_build_object('fee_id', f.id, 'student_id', f.student_id)
  FROM ins;

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END; $$;

REVOKE EXECUTE ON FUNCTION public.send_fee_reminder(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_fee_reminder(uuid) TO authenticated;
