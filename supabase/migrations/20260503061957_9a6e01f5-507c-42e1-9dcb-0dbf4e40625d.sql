
-- Recreate students policies scoped to authenticated users
DROP POLICY IF EXISTS "view school students" ON public.students;
DROP POLICY IF EXISTS "insert school students" ON public.students;
DROP POLICY IF EXISTS "update school students" ON public.students;
DROP POLICY IF EXISTS "delete school students" ON public.students;

CREATE POLICY "view school students"
ON public.students FOR SELECT
TO authenticated
USING (school_id = public.current_school_id());

CREATE POLICY "insert school students"
ON public.students FOR INSERT
TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND public.current_school_id() IS NOT NULL
);

CREATE POLICY "update school students"
ON public.students FOR UPDATE
TO authenticated
USING (school_id = public.current_school_id())
WITH CHECK (school_id = public.current_school_id());

CREATE POLICY "delete school students"
ON public.students FOR DELETE
TO authenticated
USING (school_id = public.current_school_id());

-- Same for profiles / schools (scope to authenticated)
DROP POLICY IF EXISTS "view own profile" ON public.profiles;
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "view own school" ON public.schools;
CREATE POLICY "view own school" ON public.schools FOR SELECT TO authenticated USING (id = public.current_school_id());

-- Ensure new user trigger exists (creates profile with school_id used by RLS)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure updated_at trigger on students
DROP TRIGGER IF EXISTS students_set_updated_at ON public.students;
CREATE TRIGGER students_set_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Unique roll number per school
CREATE UNIQUE INDEX IF NOT EXISTS students_school_roll_unique
ON public.students (school_id, roll_number);
