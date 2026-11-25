# University ERP Management System

A full-stack University Enterprise Resource Planning (ERP) web application with dedicated **Admin / HOD**, **Teacher**, and **Student** portals.

## Features
- **Authentication & Privacy:** Username/email login with server-side HttpOnly session cookies, password reset flow, strict Content Security Policy, SameSite/Origin CSRF protection, and database Row-Level Security (RLS).
- **Admin / HOD Portal:** Institutional overview and charts, Departments, Courses, Academic Sessions & Semesters, Subjects, Enrollments, Teachers & Students CRUD (filtering, multi-column sorting, confirmation modals, CSV export), Attendance reports, Examinations & Results, Leave approvals, Feedback replies, and Broadcast Notices.
- **Teacher Portal:** Dashboard analytics, Assigned subjects & student directory, Take & Update Attendance, Examination Result entry with auto-grading, Leave applications, and Feedback.
- **Student Portal:** Dashboard analytics, Enrolled subjects (completed vs. running semesters), Attendance history & percentages, Examination grades & results, Leave applications, and Feedback.

## Local Development Setup
1. Create a Python virtual environment and install `requirements.txt`.
2. Copy `.env.example` to `.env` and populate server-side credentials (never commit `.env` or database configuration files).
3. Run `python api/index.py` and open `http://127.0.0.1:5000`.
4. Run tests with `python -m pytest -v`.

## Attribution
Functional and design reference inspired by [Ansarimajid/College-ERP](https://github.com/Ansarimajid/College-ERP) (MIT License, Copyright (c) 2020 Owonubi Job Sunday).
