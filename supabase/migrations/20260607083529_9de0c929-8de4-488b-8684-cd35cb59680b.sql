
-- 1. notification_logs: admin-only SELECT
DROP POLICY IF EXISTS "view school notification logs" ON public.notification_logs;
CREATE POLICY "admin view school notification logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id());

-- 2. user_roles: tighten INSERT (require non-null school match), block UPDATE
DROP POLICY IF EXISTS "admin assigns roles in own school" ON public.user_roles;
CREATE POLICY "admin assigns roles in own school" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'admin')
    AND current_school_id() IS NOT NULL
    AND user_school_id(user_id) IS NOT NULL
    AND user_school_id(user_id) = current_school_id()
  );

CREATE POLICY "no role updates" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

-- 3. fees: staff-only broad SELECT
DROP POLICY IF EXISTS "view school fees" ON public.fees;
CREATE POLICY "staff view school fees" ON public.fees
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
         AND school_id = current_school_id());

-- 4. payments: staff-only broad SELECT
DROP POLICY IF EXISTS "view school payments" ON public.payments;
CREATE POLICY "staff view school payments" ON public.payments
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
         AND school_id = current_school_id());

-- 5. students: split staff vs parent
DROP POLICY IF EXISTS "view school students" ON public.students;
CREATE POLICY "staff view school students" ON public.students
  FOR SELECT TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
         AND school_id = current_school_id());
-- parent view own child policy already exists

-- 6. schools: hide join_code from non-admins via column privileges
REVOKE SELECT ON public.schools FROM authenticated;
GRANT SELECT (id, name, created_at) ON public.schools TO authenticated;
-- join_code remains accessible only via get_my_school_join_code() (admin-only, SECURITY DEFINER)

-- 7. storage student-photos: restrict UPDATE/DELETE to admin/teacher
DROP POLICY IF EXISTS "users update own school photos" ON storage.objects;
DROP POLICY IF EXISTS "users delete own school photos" ON storage.objects;

CREATE POLICY "staff update school photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (storage.foldername(name))[1] = current_school_id()::text
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
  )
  WITH CHECK (
    bucket_id = 'student-photos'
    AND (storage.foldername(name))[1] = current_school_id()::text
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
  );

CREATE POLICY "staff delete school photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (storage.foldername(name))[1] = current_school_id()::text
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
  );
