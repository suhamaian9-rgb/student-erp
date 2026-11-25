# University ERP Management System

A full-stack, production-style University Enterprise Resource Planning (ERP) web application built with **HTML5, CSS3, Vanilla JavaScript, Bootstrap 5, Python (Flask), Supabase PostgreSQL, Vercel, and GitHub Actions**.

## Attribution
Functional and design reference inspired by [Ansarimajid/College-ERP](https://github.com/Ansarimajid/College-ERP) (MIT License, Copyright (c) 2020 Owonubi Job Sunday).

## Technology Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript, Bootstrap 5, Chart.js
- **Backend:** Python 3 + Flask (Vercel Serverless Functions under `/api/*`)
- **Database & Auth:** Supabase PostgreSQL + Supabase Auth (JWT) + Row Level Security (RLS)
- **Migrations:** Supabase CLI + GitHub Actions (`.github/workflows/supabase-migrate.yml`)
- **Hosting:** Vercel (Hobby / Free Tier — intended for personal, non-commercial university demonstration)

## Implemented Modules
- **Authentication & Security:** Email/password sign-in, password reset via email, role-based access control (`admin`, `teacher`, `student`) verified against the database on every API request, and PostgreSQL RLS on all 16 tables.
- **Admin / HOD Portal:** Institutional overview + Chart.js analytics, Departments, Courses, Academic Sessions & Semesters, Subjects, Teachers & Students CRUD (with search, pagination, and CSV export), Attendance reports, Examinations & Results management, Leave approvals, Feedback replies, and In-App Broadcast Notices.
- **Teacher Portal:** Dashboard + charts, Assigned subjects & filtered student directory, Take Attendance, Update Attendance (with `updated_by` audit trail), Enter/Update Examination Marks (auto-grade calculation), Leave applications, Feedback, and Profile management.
- **Student Portal:** Dashboard + attendance charts, Enrolled subjects, Subject-wise & date-by-date attendance percentage + CSV export, Examination results & grades + CSV export, Leave applications & status tracking, Feedback, and Profile management.

## Database Schema (16 Normalized Tables)
`profiles`, `departments`, `courses`, `academic_sessions`, `semesters`, `teachers`, `students`, `subjects`, `enrollments`, `attendance_sessions`, `attendance_records`, `examinations`, `results`, `leave_applications`, `feedback`, `notifications`.

All schema definitions and RLS policies live in `supabase/migrations/`.

## Local Development Setup
1. **Create and activate a Python virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` (and optionally `SUPABASE_SERVICE_ROLE_KEY` if testing admin user creation locally).
3. **Run the local Flask server:**
   ```bash
   python api/index.py
   ```
   Open `http://127.0.0.1:5000`.
4. **Run automated tests:**
   ```bash
   python -m pytest -v
   ```

## Deployment & Migration Workflow
1. Push changes to `main` on GitHub.
2. **Vercel** automatically builds and deploys the frontend (`public/`) and Flask API (`api/index.py`).
3. **GitHub Actions** detects any new SQL files in `supabase/migrations/` and applies them safely to Supabase via `supabase db push --remote --yes` using migration history (never re-applying past migrations).

## Free-Tier Limitations
- **Vercel Hobby Plan:** Non-commercial/personal use only, 100 GB/month bandwidth, 10s serverless function timeout.
- **Supabase Free Plan:** 500 MB PostgreSQL storage, 50,000 monthly active users, projects pause after 7 days of inactivity.
- **Notifications:** Replaced paid/external Firebase FCM setup with free database-backed in-app notifications.
