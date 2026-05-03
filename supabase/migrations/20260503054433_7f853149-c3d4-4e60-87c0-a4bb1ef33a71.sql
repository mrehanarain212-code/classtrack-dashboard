
-- SCHOOLS
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.schools enable row level security;

-- PROFILES (one per user, links to school)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Helper: get current user's school_id (security definer to avoid recursion)
create or replace function public.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid()
$$;

-- STUDENTS
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  roll_number text not null,
  class text not null,
  section text not null,
  date_of_birth date,
  parent_name text,
  parent_contact text,
  address text,
  admission_date date,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, roll_number)
);
alter table public.students enable row level security;

create index students_school_idx on public.students(school_id);
create index students_search_idx on public.students(school_id, class, section);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

-- RLS POLICIES
-- profiles
create policy "view own profile" on public.profiles
  for select using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());

-- schools
create policy "view own school" on public.schools
  for select using (id = public.current_school_id());

-- students: scoped by school
create policy "view school students" on public.students
  for select using (school_id = public.current_school_id());
create policy "insert school students" on public.students
  for insert with check (school_id = public.current_school_id());
create policy "update school students" on public.students
  for update using (school_id = public.current_school_id());
create policy "delete school students" on public.students
  for delete using (school_id = public.current_school_id());

-- AUTO PROVISION: create school + profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_school_id uuid;
  school_name text;
begin
  school_name := coalesce(new.raw_user_meta_data->>'school_name', 'My School');
  insert into public.schools(name) values (school_name) returning id into new_school_id;
  insert into public.profiles(id, school_id, full_name)
    values (new.id, new_school_id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- STORAGE BUCKET for student photos
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', true);

-- Storage policies: files are stored under "<school_id>/..."
create policy "public read student photos" on storage.objects
  for select using (bucket_id = 'student-photos');

create policy "users upload to own school folder" on storage.objects
  for insert with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.current_school_id()::text
  );

create policy "users update own school photos" on storage.objects
  for update using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.current_school_id()::text
  );

create policy "users delete own school photos" on storage.objects
  for delete using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.current_school_id()::text
  );
