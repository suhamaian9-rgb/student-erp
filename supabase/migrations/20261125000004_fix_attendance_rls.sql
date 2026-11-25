-- =============================================================================
-- Migration 004: Break circular RLS recursion between attendance_sessions & attendance_records
-- =============================================================================

DROP POLICY IF EXISTS "Students can view attendance sessions for their course" ON public.attendance_sessions;

CREATE POLICY "Students can view attendance sessions for their course"
  ON public.attendance_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN public.students st ON st.course_id = sub.course_id
      WHERE sub.id = attendance_sessions.subject_id
        AND st.id = public.current_student_id()
    )
  );
