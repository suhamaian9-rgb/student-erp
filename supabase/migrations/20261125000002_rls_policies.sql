-- =============================================================================
-- Migration 002: Row Level Security (RLS) Policies
-- =============================================================================
-- Enforces strict role-based data isolation at the database level:
--   - Admins: full access to manage all institutional records
--   - Teachers: access only their assigned subjects, students, attendance, results
--   - Students: access only their own profile, enrollments, attendance, results
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions for RLS (SECURITY DEFINER to avoid infinite recursion)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', FALSE);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS BIGINT AS $$
  SELECT id FROM public.teachers WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS BIGINT AS $$
  SELECT id FROM public.students WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Prevent non-admin users from changing their own role in profiles
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can change user roles';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- -----------------------------------------------------------------------------
-- Enable RLS on ALL tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 1. PROFILES
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Teachers can view profiles of students in their subjects"
  ON public.profiles FOR SELECT
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.subjects sub ON sub.course_id = s.course_id
      WHERE s.profile_id = profiles.id
        AND sub.teacher_id = public.current_teacher_id()
    )
  );

CREATE POLICY "Students can view teacher profiles"
  ON public.profiles FOR SELECT
  USING (
    public.current_user_role() = 'student'
    AND role = 'teacher'
  );

-- -----------------------------------------------------------------------------
-- 2. DEPARTMENTS, COURSES, SESSIONS, SEMESTERS, EXAMINATIONS (Reference data)
-- -----------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view courses"
  ON public.courses FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "Admins can manage courses"
  ON public.courses FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view sessions"
  ON public.academic_sessions FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "Admins can manage sessions"
  ON public.academic_sessions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view semesters"
  ON public.semesters FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "Admins can manage semesters"
  ON public.semesters FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can view examinations"
  ON public.examinations FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "Admins can manage examinations"
  ON public.examinations FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. TEACHERS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all teachers"
  ON public.teachers FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Teachers can view own record"
  ON public.teachers FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Authenticated users can view teacher directory"
  ON public.teachers FOR SELECT
  TO authenticated USING (TRUE);

-- -----------------------------------------------------------------------------
-- 4. STUDENTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all students"
  ON public.students FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Students can view own record"
  ON public.students FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Teachers can view students in their courses"
  ON public.students FOR SELECT
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.subjects sub
      WHERE sub.course_id = students.course_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. SUBJECTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view subjects"
  ON public.subjects FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "Admins can manage subjects"
  ON public.subjects FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. ENROLLMENTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage enrollments"
  ON public.enrollments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Students can view own enrollments"
  ON public.enrollments FOR SELECT
  USING (student_id = public.current_student_id());

CREATE POLICY "Teachers can view enrollments for their subjects"
  ON public.enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subjects sub
      WHERE sub.id = enrollments.subject_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 7. ATTENDANCE SESSIONS & RECORDS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all attendance sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Teachers can manage attendance sessions for assigned subjects"
  ON public.attendance_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.subjects sub
      WHERE sub.id = attendance_sessions.subject_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subjects sub
      WHERE sub.id = attendance_sessions.subject_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  );

CREATE POLICY "Students can view attendance sessions for their course"
  ON public.attendance_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.attendance_session_id = attendance_sessions.id
        AND ar.student_id = public.current_student_id()
    )
  );

CREATE POLICY "Admins can manage all attendance records"
  ON public.attendance_records FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Teachers can manage attendance records for assigned subjects"
  ON public.attendance_records FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.attendance_sessions ats
      JOIN public.subjects sub ON sub.id = ats.subject_id
      WHERE ats.id = attendance_records.attendance_session_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.attendance_sessions ats
      JOIN public.subjects sub ON sub.id = ats.subject_id
      WHERE ats.id = attendance_records.attendance_session_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  );

CREATE POLICY "Students can view own attendance records"
  ON public.attendance_records FOR SELECT
  USING (student_id = public.current_student_id());

-- -----------------------------------------------------------------------------
-- 8. RESULTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all results"
  ON public.results FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Teachers can manage results for assigned subjects"
  ON public.results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.subjects sub
      WHERE sub.id = results.subject_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subjects sub
      WHERE sub.id = results.subject_id
        AND sub.teacher_id = public.current_teacher_id()
    )
  );

CREATE POLICY "Students can view own results"
  ON public.results FOR SELECT
  USING (student_id = public.current_student_id());

-- -----------------------------------------------------------------------------
-- 9. LEAVE APPLICATIONS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all leave applications"
  ON public.leave_applications FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own leave applications"
  ON public.leave_applications FOR SELECT
  USING (applicant_id = auth.uid());

CREATE POLICY "Users can submit own leave applications"
  ON public.leave_applications FOR INSERT
  WITH CHECK (applicant_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 10. FEEDBACK
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all feedback"
  ON public.feedback FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own feedback"
  ON public.feedback FOR SELECT
  USING (sender_id = auth.uid());

CREATE POLICY "Users can submit own feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 11. NOTIFICATIONS
-- -----------------------------------------------------------------------------
CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
