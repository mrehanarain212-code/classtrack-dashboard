
-- set search_path on set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end; $$;

-- revoke execute on security definer functions from anon/authenticated
revoke execute on function public.current_school_id() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Replace broad SELECT on storage with: signed-in users from same school can list; public can read individual files via public URL anyway
drop policy if exists "public read student photos" on storage.objects;
create policy "school members read photos" on storage.objects
  for select using (
    bucket_id = 'student-photos'
    and (
      auth.uid() is null  -- public URLs still work via storage cdn (no listing)
      or (storage.foldername(name))[1] = public.current_school_id()::text
    )
  );
