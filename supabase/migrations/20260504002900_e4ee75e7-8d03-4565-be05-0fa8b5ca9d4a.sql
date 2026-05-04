
-- 1. Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'parent';

-- 2. parent_student link table
CREATE TABLE IF NOT EXISTS public.parent_student (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_student ON public.parent_student(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_school ON public.parent_student(school_id);

ALTER TABLE public.parent_student ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a parent of student?
CREATE OR REPLACE FUNCTION public.is_parent_of(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student
    WHERE parent_id = auth.uid() AND student_id = _student_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of(uuid) TO authenticated;

-- RLS: parent_student
CREATE POLICY "parent view own links" ON public.parent_student
FOR SELECT TO authenticated
USING (parent_id = auth.uid());

CREATE POLICY "admin view school parent links" ON public.parent_student
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND school_id = public.current_school_id());

CREATE POLICY "admin insert school parent links" ON public.parent_student
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND school_id = public.current_school_id());

CREATE POLICY "admin delete school parent links" ON public.parent_student
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND school_id = public.current_school_id());

-- 3. Extend students RLS so parents can see their children
CREATE POLICY "parent view own child" ON public.students
FOR SELECT TO authenticated
USING (public.is_parent_of(id));

-- 4. Extend attendance RLS so parents can see their children's attendance
CREATE POLICY "parent view own child attendance" ON public.attendance
FOR SELECT TO authenticated
USING (public.is_parent_of(student_id));

-- 5. Allow parents to view their own school
CREATE POLICY "parent view linked school" ON public.schools
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.parent_student ps WHERE ps.parent_id = auth.uid() AND ps.school_id = schools.id)
);

-- 6. Update handle_new_user to support parent signup via school_code + student_roll
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_school_id uuid;
  school_name text;
  code text;
  signup_role text;
  child_roll text;
  matched_student uuid;
BEGIN
  code := upper(NULLIF(trim(NEW.raw_user_meta_data->>'school_code'), ''));
  signup_role := lower(COALESCE(NEW.raw_user_meta_data->>'signup_role', ''));
  child_roll := NULLIF(trim(NEW.raw_user_meta_data->>'student_roll'), '');

  IF signup_role = 'parent' THEN
    IF code IS NULL OR child_roll IS NULL THEN
      RAISE EXCEPTION 'Parent signup requires school code and student roll number';
    END IF;
    SELECT id INTO new_school_id FROM public.schools WHERE join_code = code;
    IF new_school_id IS NULL THEN RAISE EXCEPTION 'Invalid school code'; END IF;
    SELECT id INTO matched_student FROM public.students
      WHERE school_id = new_school_id AND roll_number = child_roll LIMIT 1;
    IF matched_student IS NULL THEN RAISE EXCEPTION 'No student found with that roll number'; END IF;

    INSERT INTO public.profiles(id, school_id, full_name)
      VALUES (NEW.id, new_school_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'parent');
    INSERT INTO public.parent_student(parent_id, student_id, school_id)
      VALUES (NEW.id, matched_student, new_school_id);

  ELSIF code IS NOT NULL THEN
    SELECT id INTO new_school_id FROM public.schools WHERE join_code = code;
    IF new_school_id IS NULL THEN RAISE EXCEPTION 'Invalid school code'; END IF;
    INSERT INTO public.profiles(id, school_id, full_name)
      VALUES (NEW.id, new_school_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'teacher');
  ELSE
    school_name := COALESCE(NEW.raw_user_meta_data->>'school_name', 'My School');
    INSERT INTO public.schools(name) VALUES (school_name) RETURNING id INTO new_school_id;
    INSERT INTO public.profiles(id, school_id, full_name)
      VALUES (NEW.id, new_school_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$function$;
