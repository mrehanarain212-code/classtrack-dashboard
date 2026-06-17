
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'handle_new_user()',
    'notify_consecutive_absences()',
    'notify_parents_on_absent()',
    'notify_team_on_new_student()',
    'recalc_fee_on_update()',
    'recalc_fee_status()',
    'resolve_attendance_alerts()',
    'set_attendance_defaults()',
    'set_attendance_school_id()',
    'set_exam_school_id()',
    'set_fee_defaults()',
    'set_payment_defaults()',
    'set_result_defaults()',
    'set_student_school_id()',
    'set_subject_school_id()',
    'set_updated_at()',
    'prevent_profile_school_change()',
    'set_school_join_code()',
    'gen_join_code()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
  END LOOP;
END $$;
