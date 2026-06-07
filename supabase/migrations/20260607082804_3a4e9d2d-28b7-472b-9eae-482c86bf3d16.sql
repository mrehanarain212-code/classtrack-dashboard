
CREATE OR REPLACE FUNCTION public.get_my_school_join_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.join_code
  FROM public.schools s
  WHERE s.id = public.current_school_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_school_join_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_school_join_code() TO authenticated;
