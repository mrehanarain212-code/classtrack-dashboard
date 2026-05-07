
-- Fees table
CREATE TABLE public.fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  year smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  total_fee numeric(10,2) NOT NULL CHECK (total_fee >= 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, month, year)
);

CREATE INDEX idx_fees_school ON public.fees(school_id);
CREATE INDEX idx_fees_student ON public.fees(student_id);
CREATE INDEX idx_fees_period ON public.fees(school_id, year, month);

-- Payments table
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_id uuid REFERENCES public.fees(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL CHECK (method IN ('cash','easypaisa','jazzcash','bank','other')),
  note text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_school ON public.payments(school_id);
CREATE INDEX idx_payments_student ON public.payments(student_id);
CREATE INDEX idx_payments_fee ON public.payments(fee_id);
CREATE INDEX idx_payments_date ON public.payments(school_id, payment_date);

-- Enable RLS
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- FEES policies
CREATE POLICY "view school fees" ON public.fees FOR SELECT TO authenticated
  USING (school_id = current_school_id());

CREATE POLICY "parent view child fees" ON public.fees FOR SELECT TO authenticated
  USING (is_parent_of(student_id));

CREATE POLICY "admin insert fees" ON public.fees FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') AND school_id = current_school_id());

CREATE POLICY "admin update fees" ON public.fees FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());

CREATE POLICY "admin delete fees" ON public.fees FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id());

-- PAYMENTS policies
CREATE POLICY "view school payments" ON public.payments FOR SELECT TO authenticated
  USING (school_id = current_school_id());

CREATE POLICY "parent view child payments" ON public.payments FOR SELECT TO authenticated
  USING (is_parent_of(student_id));

CREATE POLICY "admin insert payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') AND school_id = current_school_id());

CREATE POLICY "admin update payments" ON public.payments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id())
  WITH CHECK (school_id = current_school_id());

CREATE POLICY "admin delete payments" ON public.payments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') AND school_id = current_school_id());

-- Defaults trigger: school_id + recorded_by
CREATE OR REPLACE FUNCTION public.set_fee_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN NEW.school_id := public.current_school_id(); END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_fee_defaults() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.set_payment_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN NEW.school_id := public.current_school_id(); END IF;
  IF NEW.recorded_by IS NULL THEN NEW.recorded_by := auth.uid(); END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_payment_defaults() FROM PUBLIC, anon;

CREATE TRIGGER trg_set_fee_defaults BEFORE INSERT ON public.fees
  FOR EACH ROW EXECUTE FUNCTION public.set_fee_defaults();
CREATE TRIGGER trg_set_payment_defaults BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_defaults();

CREATE TRIGGER trg_fees_updated_at BEFORE UPDATE ON public.fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recompute fee status when payments change
CREATE OR REPLACE FUNCTION public.recalc_fee_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_fee uuid;
  s_id uuid;
  total_paid numeric;
  total_due numeric;
BEGIN
  target_fee := COALESCE(NEW.fee_id, OLD.fee_id);
  s_id := COALESCE(NEW.student_id, OLD.student_id);

  IF target_fee IS NULL THEN
    -- try infer fee record from payment_date month/year
    IF TG_OP <> 'DELETE' THEN
      SELECT f.id INTO target_fee FROM public.fees f
      WHERE f.student_id = s_id
        AND f.month = EXTRACT(MONTH FROM NEW.payment_date)::smallint
        AND f.year = EXTRACT(YEAR FROM NEW.payment_date)::smallint
      LIMIT 1;
      IF target_fee IS NOT NULL THEN
        UPDATE public.payments SET fee_id = target_fee WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;

  IF target_fee IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.payments WHERE fee_id = target_fee;
  SELECT total_fee INTO total_due FROM public.fees WHERE id = target_fee;

  UPDATE public.fees SET status =
    CASE
      WHEN total_paid <= 0 THEN 'unpaid'
      WHEN total_paid < total_due THEN 'partial'
      ELSE 'paid'
    END,
    updated_at = now()
  WHERE id = target_fee;

  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.recalc_fee_status() FROM PUBLIC, anon;

CREATE TRIGGER trg_payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.recalc_fee_status();

-- Recalc when fee total changes
CREATE OR REPLACE FUNCTION public.recalc_fee_on_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total_paid numeric;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO total_paid FROM public.payments WHERE fee_id = NEW.id;
  NEW.status := CASE
    WHEN total_paid <= 0 THEN 'unpaid'
    WHEN total_paid < NEW.total_fee THEN 'partial'
    ELSE 'paid'
  END;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.recalc_fee_on_update() FROM PUBLIC, anon;

CREATE TRIGGER trg_fees_recalc BEFORE UPDATE OF total_fee ON public.fees
FOR EACH ROW EXECUTE FUNCTION public.recalc_fee_on_update();
