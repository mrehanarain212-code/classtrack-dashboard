CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance (school_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance (student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance (school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_school_class ON public.students (school_id, class, section);