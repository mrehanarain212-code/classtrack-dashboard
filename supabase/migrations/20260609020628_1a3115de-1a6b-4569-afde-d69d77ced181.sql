
-- Remove per-absence notification triggers so only the consecutive-absence
-- trigger (which respects school_settings.absence_threshold) is used.
DROP TRIGGER IF EXISTS trg_notify_absent_ins ON public.attendance;
DROP TRIGGER IF EXISTS trg_notify_absent_upd ON public.attendance;

-- Replace the consecutive-absence function to add logging that surfaces
-- the loaded threshold and the calculated consecutive count per student.
CREATE OR REPLACE FUNCTION public.notify_consecutive_absences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  threshold smallint;
  enabled boolean;
  streak int := 0;
  prev date;
  cur record;
  s_name text;
  s_roll text;
BEGIN
  IF NEW.status <> 'Absent' THEN
    RETURN NEW;
  END IF;

  SELECT alerts_enabled, absence_threshold
    INTO enabled, threshold
  FROM public.school_settings
  WHERE school_id = NEW.school_id;

  IF threshold IS NULL THEN
    threshold := 3;
  END IF;

  RAISE LOG 'notify_consecutive_absences: school=% student=% date=% loaded_threshold=% alerts_enabled=%',
    NEW.school_id, NEW.student_id, NEW.date, threshold, COALESCE(enabled, true);

  IF enabled IS NOT NULL AND enabled = false THEN
    RAISE LOG 'notify_consecutive_absences: alerts disabled for school %, skipping', NEW.school_id;
    RETURN NEW;
  END IF;

  -- Count consecutive absent days ending at NEW.date.
  -- Any non-Absent day or gap breaks the streak.
  prev := NEW.date + INTERVAL '1 day';
  FOR cur IN
    SELECT date, status
    FROM public.attendance
    WHERE student_id = NEW.student_id
      AND date <= NEW.date
    ORDER BY date DESC
    LIMIT 60
  LOOP
    IF cur.date = prev - INTERVAL '1 day' AND cur.status = 'Absent' THEN
      streak := streak + 1;
      prev := cur.date;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RAISE LOG 'notify_consecutive_absences: student=% consecutive_count=% threshold=%',
    NEW.student_id, streak, threshold;

  IF streak < threshold THEN
    RAISE LOG 'notify_consecutive_absences: streak below threshold, no alert sent';
    RETURN NEW;
  END IF;

  SELECT full_name, roll_number INTO s_name, s_roll
  FROM public.students WHERE id = NEW.student_id;

  INSERT INTO public.notifications(user_id, school_id, type, category, title, body, link)
  SELECT ps.parent_id, NEW.school_id, 'consecutive_absent', 'attendance',
    s_name || ' absent ' || streak || ' days in a row',
    'Roll ' || s_roll || ' has been marked absent for ' || streak || ' consecutive days.',
    '/parent'
  FROM public.parent_student ps WHERE ps.student_id = NEW.student_id;

  RAISE LOG 'notify_consecutive_absences: alert dispatched for student=% streak=%',
    NEW.student_id, streak;

  RETURN NEW;
END;
$function$;
