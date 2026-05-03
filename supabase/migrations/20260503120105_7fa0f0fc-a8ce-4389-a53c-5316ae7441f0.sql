
-- 1) Roles enum + table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'teacher');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) Helper functions (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.user_school_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = _user_id
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_school_id(uuid) TO authenticated;

-- 3) Update signup trigger: first user of new school becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_school_id uuid;
  school_name text;
BEGIN
  school_name := COALESCE(NEW.raw_user_meta_data->>'school_name', 'My School');
  INSERT INTO public.schools(name) VALUES (school_name) RETURNING id INTO new_school_id;
  INSERT INTO public.profiles(id, school_id, full_name)
    VALUES (NEW.id, new_school_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: every existing profile without a role becomes admin of their school
INSERT INTO public.user_roles(user_id, role)
SELECT p.id, 'admin'::public.app_role FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
ON CONFLICT DO NOTHING;

-- 4) RLS for user_roles
DROP POLICY IF EXISTS "view roles in own school" ON public.user_roles;
CREATE POLICY "view roles in own school" ON public.user_roles FOR SELECT TO authenticated
USING (public.user_school_id(user_id) = public.current_school_id());

DROP POLICY IF EXISTS "admin assigns roles in own school" ON public.user_roles;
CREATE POLICY "admin assigns roles in own school" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND public.user_school_id(user_id) = public.current_school_id()
);

DROP POLICY IF EXISTS "admin removes roles in own school" ON public.user_roles;
CREATE POLICY "admin removes roles in own school" ON public.user_roles FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND public.user_school_id(user_id) = public.current_school_id()
  AND user_id <> auth.uid()  -- prevent admin removing own admin role (lock-out safety)
);

-- 5) Allow admins to view all profiles in their school (for teacher management)
DROP POLICY IF EXISTS "admin view school profiles" ON public.profiles;
CREATE POLICY "admin view school profiles" ON public.profiles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND school_id = public.current_school_id()
);

-- 6) Tighten students RLS: only admins can mutate; everyone in school can view
DROP POLICY IF EXISTS "insert school students" ON public.students;
DROP POLICY IF EXISTS "update school students" ON public.students;
DROP POLICY IF EXISTS "delete school students" ON public.students;

CREATE POLICY "admin insert school students" ON public.students FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND public.current_school_id() IS NOT NULL
  AND (school_id IS NULL OR school_id = public.current_school_id())
);
CREATE POLICY "admin update school students" ON public.students FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND school_id = public.current_school_id())
WITH CHECK (school_id = public.current_school_id());
CREATE POLICY "admin delete school students" ON public.students FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND school_id = public.current_school_id());

-- 7) Attendance: add marked_by, update RLS so admins + teachers can insert
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS marked_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.set_attendance_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN NEW.school_id := public.current_school_id(); END IF;
  IF NEW.marked_by IS NULL THEN NEW.marked_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_attendance_school_id_trg ON public.attendance;
DROP TRIGGER IF EXISTS set_attendance_defaults_trg ON public.attendance;
CREATE TRIGGER set_attendance_defaults_trg
BEFORE INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_defaults();

DROP POLICY IF EXISTS "insert school attendance" ON public.attendance;
DROP POLICY IF EXISTS "update school attendance" ON public.attendance;
DROP POLICY IF EXISTS "delete school attendance" ON public.attendance;

CREATE POLICY "insert school attendance" ON public.attendance FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  AND school_id = public.current_school_id()
  AND public.current_school_id() IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = attendance.student_id AND s.school_id = public.current_school_id())
);
CREATE POLICY "update school attendance" ON public.attendance FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
  AND school_id = public.current_school_id()
)
WITH CHECK (school_id = public.current_school_id());
CREATE POLICY "admin delete attendance" ON public.attendance FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND school_id = public.current_school_id());
