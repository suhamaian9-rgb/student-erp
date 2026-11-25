-- =============================================================================
-- Migration 001: Initial College ERP PostgreSQL Schema
-- =============================================================================
-- Creates normalized tables, constraints, indexes, and updated_at triggers
-- for the College ERP Management System.
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper trigger function for automatic updated_at timestamps
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1. PROFILES (maps Supabase auth.users to application roles)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student')),
  gender TEXT CHECK (gender IN ('M', 'F', 'O')),
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatically create a profile row when a new Supabase Auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(
      CASE
        WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'teacher', 'student')
        THEN NEW.raw_user_meta_data->>'role'
        ELSE 'student'
      END,
      'student'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. DEPARTMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE public.departments (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. COURSES
-- -----------------------------------------------------------------------------
CREATE TABLE public.courses (
  id BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  duration_years SMALLINT NOT NULL DEFAULT 4 CHECK (duration_years BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_department ON public.courses(department_id);

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. ACADEMIC SESSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE public.academic_sessions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_session_dates CHECK (end_date > start_date)
);

CREATE TRIGGER trg_academic_sessions_updated_at
  BEFORE UPDATE ON public.academic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. SEMESTERS
-- -----------------------------------------------------------------------------
CREATE TABLE public.semesters (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  semester_number SMALLINT NOT NULL CHECK (semester_number BETWEEN 1 AND 12),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_semester_dates CHECK (end_date >= start_date),
  UNIQUE (session_id, semester_number)
);

CREATE INDEX idx_semesters_session ON public.semesters(session_id);

CREATE TRIGGER trg_semesters_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. TEACHERS
-- -----------------------------------------------------------------------------
CREATE TABLE public.teachers (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES public.departments(id) ON DELETE SET NULL,
  employee_id TEXT NOT NULL UNIQUE,
  qualification TEXT DEFAULT '',
  joined_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teachers_department ON public.teachers(department_id);

CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. STUDENTS
-- -----------------------------------------------------------------------------
CREATE TABLE public.students (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id BIGINT REFERENCES public.courses(id) ON DELETE SET NULL,
  session_id BIGINT REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  semester_id BIGINT REFERENCES public.semesters(id) ON DELETE SET NULL,
  roll_number TEXT NOT NULL UNIQUE,
  admission_year SMALLINT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_course ON public.students(course_id);
CREATE INDEX idx_students_session ON public.students(session_id);

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. SUBJECTS
-- -----------------------------------------------------------------------------
CREATE TABLE public.subjects (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  semester_id BIGINT REFERENCES public.semesters(id) ON DELETE SET NULL,
  teacher_id BIGINT REFERENCES public.teachers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  credits SMALLINT NOT NULL DEFAULT 3 CHECK (credits BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subjects_course ON public.subjects(course_id);
CREATE INDEX idx_subjects_teacher ON public.subjects(teacher_id);

CREATE TRIGGER trg_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 9. ENROLLMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE public.enrollments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  semester_id BIGINT REFERENCES public.semesters(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, subject_id)
);

CREATE INDEX idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_subject ON public.enrollments(subject_id);

-- -----------------------------------------------------------------------------
-- 10. ATTENDANCE SESSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE public.attendance_sessions (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  session_id BIGINT NOT NULL REFERENCES public.academic_sessions(id) ON DELETE RESTRICT,
  teacher_id BIGINT REFERENCES public.teachers(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  topic TEXT DEFAULT '',
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, attendance_date)
);

CREATE INDEX idx_att_sessions_subject ON public.attendance_sessions(subject_id);
CREATE INDEX idx_att_sessions_date ON public.attendance_sessions(attendance_date);

CREATE TRIGGER trg_attendance_sessions_updated_at
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 11. ATTENDANCE RECORDS
-- -----------------------------------------------------------------------------
CREATE TABLE public.attendance_records (
  id BIGSERIAL PRIMARY KEY,
  attendance_session_id BIGINT NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'late')),
  remarks TEXT DEFAULT '',
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attendance_session_id, student_id)
);

CREATE INDEX idx_att_records_session ON public.attendance_records(attendance_session_id);
CREATE INDEX idx_att_records_student ON public.attendance_records(student_id);

CREATE TRIGGER trg_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 12. EXAMINATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE public.examinations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT 'final' CHECK (exam_type IN ('internal', 'midterm', 'final', 'practical')),
  session_id BIGINT NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  semester_id BIGINT REFERENCES public.semesters(id) ON DELETE SET NULL,
  exam_date DATE,
  max_marks NUMERIC(6, 2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_examinations_session ON public.examinations(session_id);

CREATE TRIGGER trg_examinations_updated_at
  BEFORE UPDATE ON public.examinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 13. RESULTS
-- -----------------------------------------------------------------------------
CREATE TABLE public.results (
  id BIGSERIAL PRIMARY KEY,
  examination_id BIGINT NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  marks_obtained NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (marks_obtained >= 0),
  max_marks NUMERIC(6, 2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  grade TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  graded_by BIGINT REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_marks_range CHECK (marks_obtained <= max_marks),
  UNIQUE (examination_id, student_id, subject_id)
);

CREATE INDEX idx_results_student ON public.results(student_id);
CREATE INDEX idx_results_subject ON public.results(subject_id);
CREATE INDEX idx_results_exam ON public.results(examination_id);

CREATE TRIGGER trg_results_updated_at
  BEFORE UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 14. LEAVE APPLICATIONS (unified for teachers and students)
-- -----------------------------------------------------------------------------
CREATE TABLE public.leave_applications (
  id BIGSERIAL PRIMARY KEY,
  applicant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  applicant_role TEXT NOT NULL CHECK (applicant_role IN ('teacher', 'student')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note TEXT DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_applicant ON public.leave_applications(applicant_id);
CREATE INDEX idx_leave_status ON public.leave_applications(status);

CREATE TRIGGER trg_leave_applications_updated_at
  BEFORE UPDATE ON public.leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 15. FEEDBACK (unified for teachers and students)
-- -----------------------------------------------------------------------------
CREATE TABLE public.feedback (
  id BIGSERIAL PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('teacher', 'student')),
  subject TEXT NOT NULL DEFAULT 'General Feedback',
  message TEXT NOT NULL,
  reply TEXT DEFAULT '',
  replied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_sender ON public.feedback(sender_id);

CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 16. NOTIFICATIONS (in-app notifications replacing Firebase FCM)
-- -----------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'College ERP Notice',
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, is_read);
