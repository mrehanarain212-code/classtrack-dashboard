DROP POLICY IF EXISTS "school members read photos" ON storage.objects;
CREATE POLICY "school members read photos" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'student-photos'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (public.current_school_id())::text
);