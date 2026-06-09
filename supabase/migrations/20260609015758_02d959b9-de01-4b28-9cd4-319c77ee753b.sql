
-- 1) Admin DELETE policy for notification_logs (cleanup of sensitive delivery records)
CREATE POLICY "admin delete notification logs"
ON public.notification_logs
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  AND school_id = public.current_school_id()
);

-- 2) Restrict join_code column visibility on schools to prevent leaking the invite code.
-- Non-admins keep row access (for name, etc.) but cannot read join_code directly.
-- Admins fetch it via the existing get_my_school_join_code() security-definer RPC.
REVOKE SELECT (join_code) ON public.schools FROM authenticated;
REVOKE SELECT (join_code) ON public.schools FROM anon;
