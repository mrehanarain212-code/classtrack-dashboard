
-- 1. Lifecycle table for attendance alerts
CREATE TABLE IF NOT EXISTS public.attendance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  streak_start_date date NOT NULL,
  streak_end_date date NOT NULL,
  streak_length smallint NOT NULL,
  threshold smallint NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_alerts_unique_streak UNIQUE (student_id, streak_start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_alerts TO authenticated;
GRANT ALL ON public.attendance_alerts TO service_role;

ALTER TABLE public.attendance_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members read alerts"
  ON public.attendance_alerts FOR SELECT TO authenticated
  USING (school_id = public.current_school_id());

CREATE POLICY "school admins/teachers update alerts"
  ON public.attendance_alerts FOR UPDATE TO authenticated
  USING (school_id = public.current_school_id()
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher')))
  WITH CHECK (school_id = public.current_school_id());

CREATE POLICY "school admins delete alerts"
  ON public.attendance_alerts FOR DELETE TO authenticated
  USING (school_id = public.current_school_id() AND public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_attendance_alerts_school_status
  ON public.attendance_alerts (school_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_alerts_student_status
  ON public.attendance_alerts (student_id, status);

CREATE TRIGGER trg_attendance_alerts_updated_at
  BEFORE UPDATE ON public.attendance_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Replace consecutive-absence trigger to use the lifecycle table (idempotent per streak)
CREATE OR REPLACE FUNCTION public.notify_consecutive_absences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  threshold smallint;
  enabled boolean;
  streak int := 0;
  start_date date;
  prev date;
  cur record;
  s_name text;
  s_roll text;
  alert_row public.attendance_alerts;
  inserted boolean := false;
BEGIN
  IF NEW.status <> 'Absent' THEN
    RETURN NEW;
  END IF;

  SELECT alerts_enabled, absence_threshold INTO enabled, threshold
  FROM public.school_settings WHERE school_id = NEW.school_id;

  IF threshold IS NULL THEN threshold := 3; END IF;
  IF enabled IS NOT NULL AND enabled = false THEN RETURN NEW; END IF;

  prev := NEW.date + INTERVAL '1 day';
  start_date := NEW.date;
  FOR cur IN
    SELECT date, status FROM public.attendance
    WHERE student_id = NEW.student_id AND date <= NEW.date
    ORDER BY date DESC LIMIT 60
  LOOP
    IF cur.date = prev - INTERVAL '1 day' AND cur.status = 'Absent' THEN
      streak := streak + 1;
      start_date := cur.date;
      prev := cur.date;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RAISE LOG 'notify_consecutive_absences: student=% streak=% threshold=% start=%',
    NEW.student_id, streak, threshold, start_date;

  IF streak < threshold THEN RETURN NEW; END IF;

  -- Upsert lifecycle row keyed by (student, streak_start_date). Only fire a
  -- notification the first time the alert for this streak is created.
  INSERT INTO public.attendance_alerts(
    school_id, student_id, streak_start_date, streak_end_date,
    streak_length, threshold, status
  ) VALUES (
    NEW.school_id, NEW.student_id, start_date, NEW.date, streak, threshold, 'active'
  )
  ON CONFLICT (student_id, streak_start_date) DO UPDATE
    SET streak_end_date = EXCLUDED.streak_end_date,
        streak_length = EXCLUDED.streak_length,
        threshold = EXCLUDED.threshold,
        updated_at = now()
  RETURNING (xmax = 0) INTO inserted;

  IF NOT inserted THEN
    RAISE LOG 'notify_consecutive_absences: existing alert for streak start=%, skipping notification', start_date;
    RETURN NEW;
  END IF;

  SELECT full_name, roll_number INTO s_name, s_roll FROM public.students WHERE id = NEW.student_id;

  INSERT INTO public.notifications(user_id, school_id, type, category, title, body, link)
  SELECT ps.parent_id, NEW.school_id, 'consecutive_absent', 'attendance',
    s_name || ' absent ' || streak || ' days in a row',
    'Roll ' || s_roll || ' has been marked absent for ' || streak || ' consecutive days.',
    '/parent'
  FROM public.parent_student ps WHERE ps.student_id = NEW.student_id;

  RETURN NEW;
END;
$$;

-- 3. Auto-resolve active alerts when the student is no longer absent
CREATE OR REPLACE FUNCTION public.resolve_attendance_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Absent' THEN RETURN NEW; END IF;
  UPDATE public.attendance_alerts
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE student_id = NEW.student_id
      AND status = 'active'
      AND streak_end_date <= NEW.date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_attendance_alerts_ins ON public.attendance;
DROP TRIGGER IF EXISTS trg_resolve_attendance_alerts_upd ON public.attendance;
CREATE TRIGGER trg_resolve_attendance_alerts_ins
  AFTER INSERT ON public.attendance
  FOR EACH ROW WHEN (NEW.status <> 'Absent')
  EXECUTE FUNCTION public.resolve_attendance_alerts();
CREATE TRIGGER trg_resolve_attendance_alerts_upd
  AFTER UPDATE OF status ON public.attendance
  FOR EACH ROW WHEN (NEW.status <> 'Absent')
  EXECUTE FUNCTION public.resolve_attendance_alerts();
