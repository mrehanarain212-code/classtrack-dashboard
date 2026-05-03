
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL CHECK (status IN ('Present','Absent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);

CREATE INDEX attendance_school_date_idx ON public.attendance(school_id, date);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view school attendance" ON public.attendance
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

CREATE POLICY "insert school attendance" ON public.attendance
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND public.current_school_id() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_school_id())
);

CREATE POLICY "update school attendance" ON public.attendance
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id())
WITH CHECK (school_id = public.current_school_id());

CREATE POLICY "delete school attendance" ON public.attendance
FOR DELETE TO authenticated
USING (school_id = public.current_school_id());

-- Auto-assign school_id from current user's profile
CREATE OR REPLACE FUNCTION public.set_attendance_school_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    NEW.school_id := public.current_school_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_attendance_school_id() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_attendance_school_id_trg
BEFORE INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_school_id();

CREATE TRIGGER attendance_set_updated_at
BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
