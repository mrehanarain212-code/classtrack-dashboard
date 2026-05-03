
-- Ensure current_school_id is callable
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, anon, service_role;

-- Add a safe current_student_id() helper (returns auth.uid()) for any code referencing it
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT auth.uid() $$;

GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated, anon, service_role;

-- Ensure trigger to auto-assign school_id on student insert exists
DROP TRIGGER IF EXISTS set_student_school_id_trg ON public.students;
CREATE TRIGGER set_student_school_id_trg
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_student_school_id();

-- Ensure updated_at trigger
DROP TRIGGER IF EXISTS students_set_updated_at ON public.students;
CREATE TRIGGER students_set_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ensure new user trigger exists (creates school + profile on signup)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Re-affirm RLS enabled
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Recreate schools policies
DROP POLICY IF EXISTS "view own school" ON public.schools;
CREATE POLICY "view own school" ON public.schools
FOR SELECT TO authenticated
USING (id = public.current_school_id());

-- Recreate students policies cleanly
DROP POLICY IF EXISTS "view school students" ON public.students;
DROP POLICY IF EXISTS "insert school students" ON public.students;
DROP POLICY IF EXISTS "update school students" ON public.students;
DROP POLICY IF EXISTS "delete school students" ON public.students;

CREATE POLICY "view school students" ON public.students
FOR SELECT TO authenticated
USING (school_id = public.current_school_id());

CREATE POLICY "insert school students" ON public.students
FOR INSERT TO authenticated
WITH CHECK (
  public.current_school_id() IS NOT NULL
  AND (school_id IS NULL OR school_id = public.current_school_id())
);

CREATE POLICY "update school students" ON public.students
FOR UPDATE TO authenticated
USING (school_id = public.current_school_id())
WITH CHECK (school_id = public.current_school_id());

CREATE POLICY "delete school students" ON public.students
FOR DELETE TO authenticated
USING (school_id = public.current_school_id());

-- Grant table privileges (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT ON public.schools TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
