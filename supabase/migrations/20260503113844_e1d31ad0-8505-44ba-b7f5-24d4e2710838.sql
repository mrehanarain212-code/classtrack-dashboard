
-- Trigger to auto-set school_id on insert from current user's profile
CREATE OR REPLACE FUNCTION public.set_student_school_id()
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

DROP TRIGGER IF EXISTS set_student_school_id_trg ON public.students;
CREATE TRIGGER set_student_school_id_trg
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_student_school_id();

-- Ensure updated_at trigger exists
DROP TRIGGER IF EXISTS students_set_updated_at ON public.students;
CREATE TRIGGER students_set_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recreate insert policy cleanly
DROP POLICY IF EXISTS "insert school students" ON public.students;
CREATE POLICY "insert school students"
ON public.students FOR INSERT
TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND public.current_school_id() IS NOT NULL
);
