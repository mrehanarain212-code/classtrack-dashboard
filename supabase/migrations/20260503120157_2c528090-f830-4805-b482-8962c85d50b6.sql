
-- Add a join code to schools
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS join_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.gen_join_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
$$;

UPDATE public.schools SET join_code = public.gen_join_code() WHERE join_code IS NULL;

CREATE OR REPLACE FUNCTION public.set_school_join_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.join_code IS NULL THEN NEW.join_code := public.gen_join_code(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS schools_set_join_code ON public.schools;
CREATE TRIGGER schools_set_join_code BEFORE INSERT ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.set_school_join_code();

-- Public lookup of school by join code (returns id + name only)
CREATE OR REPLACE FUNCTION public.school_by_code(_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name FROM public.schools WHERE join_code = upper(_code) LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.school_by_code(text) TO anon, authenticated;

-- Updated signup handler: school_code => join as teacher; otherwise create school as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_school_id uuid;
  school_name text;
  code text;
BEGIN
  code := upper(NULLIF(trim(NEW.raw_user_meta_data->>'school_code'), ''));
  IF code IS NOT NULL THEN
    SELECT id INTO new_school_id FROM public.schools WHERE join_code = code;
    IF new_school_id IS NULL THEN
      RAISE EXCEPTION 'Invalid school code';
    END IF;
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
$$;
