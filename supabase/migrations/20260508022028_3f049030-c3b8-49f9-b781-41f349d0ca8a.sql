
-- SUBJECTS
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  class text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(school_id, class, name)
);
CREATE INDEX idx_subjects_school_class ON public.subjects(school_id, class);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view school subjects" ON public.subjects FOR SELECT TO authenticated
  USING (school_id = current_school_id());
CREATE POLICY "admin insert subjects" ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') AND school_id = current_school_id());
CREATE POLICY "admin update subjects" ON public.subjects FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());
CREATE POLICY "admin delete subjects" ON public.subjects FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id());

CREATE TRIGGER subjects_set_updated BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_subject_school_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN NEW.school_id := public.current_school_id(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subjects_set_school BEFORE INSERT ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_subject_school_id();

-- EXAMS
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  exam_type text NOT NULL,
  class text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exams_school_class ON public.exams(school_id, class);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view school exams" ON public.exams FOR SELECT TO authenticated
  USING (school_id = current_school_id());
CREATE POLICY "parent view child class exams" ON public.exams FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parent_student ps
    JOIN public.students s ON s.id = ps.student_id
    WHERE ps.parent_id = auth.uid() AND s.class = exams.class AND s.school_id = exams.school_id
  ));
CREATE POLICY "admin insert exams" ON public.exams FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') AND school_id = current_school_id());
CREATE POLICY "admin update exams" ON public.exams FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());
CREATE POLICY "admin delete exams" ON public.exams FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id());

CREATE TRIGGER exams_set_updated BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_exam_school_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN NEW.school_id := public.current_school_id(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exams_set_school BEFORE INSERT ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.set_exam_school_id();

-- RESULTS
CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  obtained_marks numeric NOT NULL DEFAULT 0,
  total_marks numeric NOT NULL DEFAULT 100,
  grade text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id, subject_id)
);
CREATE INDEX idx_results_exam ON public.results(exam_id);
CREATE INDEX idx_results_student ON public.results(student_id);
CREATE INDEX idx_results_school ON public.results(school_id);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view school results" ON public.results FOR SELECT TO authenticated
  USING (school_id = current_school_id());
CREATE POLICY "parent view child results" ON public.results FOR SELECT TO authenticated
  USING (is_parent_of(student_id));
CREATE POLICY "staff insert results" ON public.results FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
              AND school_id = current_school_id());
CREATE POLICY "staff update results" ON public.results FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher'))
         AND school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());
CREATE POLICY "admin delete results" ON public.results FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id());

CREATE TRIGGER results_set_updated BEFORE UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto grade + school_id default
CREATE OR REPLACE FUNCTION public.set_result_defaults() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pct numeric;
BEGIN
  IF NEW.school_id IS NULL THEN NEW.school_id := public.current_school_id(); END IF;
  IF NEW.total_marks IS NULL OR NEW.total_marks <= 0 THEN NEW.total_marks := 100; END IF;
  pct := (NEW.obtained_marks / NEW.total_marks) * 100.0;
  NEW.grade := CASE
    WHEN pct >= 90 THEN 'A'
    WHEN pct >= 80 THEN 'B'
    WHEN pct >= 70 THEN 'C'
    WHEN pct >= 60 THEN 'D'
    ELSE 'F'
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER results_set_defaults BEFORE INSERT OR UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.set_result_defaults();
