# College ERP Management System

A full-stack College Enterprise Resource Planning (ERP) web application built with **HTML5, CSS3, Vanilla JavaScript, Bootstrap 5, Python (Flask), Supabase PostgreSQL, Vercel, and GitHub Actions**.

## Attribution
Functional and design reference inspired by [Ansarimajid/College-ERP](https://github.com/Ansarimajid/College-ERP) (MIT License, Copyright (c) 2020 Owonubi Job Sunday).

## Tech Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript, Bootstrap 5
- **Backend:** Python 3 + Flask (Vercel Serverless Functions)
- **Database & Auth:** Supabase PostgreSQL + Supabase Auth + Row Level Security (RLS)
- **Migrations:** Supabase CLI + GitHub Actions
- **Hosting:** Vercel (Hobby / Free Tier)

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
   Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`.

3. **Run the local Flask server:**
   ```bash
   python api/index.py
   ```
   Open `http://127.0.0.1:5000` in your browser.
