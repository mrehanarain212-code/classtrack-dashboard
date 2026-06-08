
-- 1. Storage: restrict student-photos INSERT to admin/teacher only
DROP POLICY IF EXISTS "users upload to own school folder" ON storage.objects;

CREATE POLICY "staff upload to own school folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-photos'
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'teacher'::public.app_role))
  AND public.current_school_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.current_school_id()::text
);

-- 2. profiles: explicit deny INSERT from clients (handled by trigger as SECURITY DEFINER)
CREATE POLICY "no client profile inserts"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 3. user_roles: restrict SELECT to admins only, plus user can see their own role
DROP POLICY IF EXISTS "view roles in own school" ON public.user_roles;

CREATE POLICY "admin view roles in own school"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_school_id(user_id) = public.current_school_id()
);

CREATE POLICY "view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
