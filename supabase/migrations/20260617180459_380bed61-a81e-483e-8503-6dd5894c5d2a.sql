
-- 1) Block users from changing their school_id via profile updates
CREATE OR REPLACE FUNCTION public.prevent_profile_school_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.school_id := OLD.school_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_school_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_school_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_school_change();

-- 2) Lock down SECURITY DEFINER trigger function from anon/public execute
REVOKE EXECUTE ON FUNCTION public.resolve_attendance_alerts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_attendance_alerts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_attendance_alerts() FROM authenticated;
