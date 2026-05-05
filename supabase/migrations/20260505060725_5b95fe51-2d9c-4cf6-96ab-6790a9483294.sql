-- 1. Fix mutable search_path on the two remaining functions
CREATE OR REPLACE FUNCTION public.gen_join_code()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
$$;

CREATE OR REPLACE FUNCTION public.set_school_join_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN NEW.join_code := public.gen_join_code(); END IF;
  RETURN NEW;
END;
$$;

-- 2. Revoke EXECUTE on internal SECURITY DEFINER trigger / helper functions
--    from anon, authenticated, and public. Triggers run as table owner so
--    they don't need explicit grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_attendance_defaults() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_attendance_school_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_student_school_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_school_join_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_join_code() FROM PUBLIC, anon, authenticated;

-- 3. Helpers used inside RLS policies: only signed-in users need EXECUTE.
REVOKE EXECUTE ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_student_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_school_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_parent_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_school_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent_of(uuid) TO authenticated;

-- 4. school_by_code: not referenced from the client; lock it down.
REVOKE EXECUTE ON FUNCTION public.school_by_code(text) FROM PUBLIC, anon, authenticated;

-- 5. Performance: indexes that match our common query patterns.
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance(school_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance(student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_students_school ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_parent ON public.parent_student(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_student_date ON public.attendance(student_id, date);
