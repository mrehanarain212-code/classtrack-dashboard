
-- notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "mark own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- absent notification trigger
CREATE OR REPLACE FUNCTION public.notify_parents_on_absent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_name text;
  s_roll text;
BEGIN
  IF NEW.status <> 'Absent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'Absent' THEN RETURN NEW; END IF;

  SELECT full_name, roll_number INTO s_name, s_roll
  FROM public.students WHERE id = NEW.student_id;

  INSERT INTO public.notifications(user_id, school_id, type, title, body, link)
  SELECT ps.parent_id, NEW.school_id, 'child_absent',
    'Absence on ' || NEW.date::text,
    s_name || ' (Roll ' || s_roll || ') was marked absent.',
    '/parent'
  FROM public.parent_student ps
  WHERE ps.student_id = NEW.student_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_absent_ins
AFTER INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_parents_on_absent();

CREATE TRIGGER trg_notify_absent_upd
AFTER UPDATE OF status ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_parents_on_absent();

-- new student trigger
CREATE OR REPLACE FUNCTION public.notify_team_on_new_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications(user_id, school_id, type, title, body, link)
  SELECT p.id, NEW.school_id, 'student_added',
    'New student added',
    NEW.full_name || ' (Roll ' || NEW.roll_number || ', Class ' || NEW.class || '-' || NEW.section || ') joined.',
    '/student/' || NEW.id::text
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.school_id = NEW.school_id
    AND ur.role IN ('admin','teacher')
    AND p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_student
AFTER INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.notify_team_on_new_student();

REVOKE EXECUTE ON FUNCTION public.notify_parents_on_absent() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_team_on_new_student() FROM anon, PUBLIC;
