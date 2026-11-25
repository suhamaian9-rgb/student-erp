"""Main Flask application for the College ERP System.

Deployed as a Vercel Python serverless function via /api/*.
Also serves static files from ../public during local development.
"""

import os
import sys

# Ensure project root is on sys.path whether invoked from root or api/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request

load_dotenv()

from api.auth_utils import require_auth  # noqa: E402
from api.routes_admin import admin_bp  # noqa: E402
from api.routes_student import student_bp  # noqa: E402
from api.routes_teacher import teacher_bp  # noqa: E402
from api.supabase_client import get_admin_client, get_supabase_anon_key, get_supabase_url  # noqa: E402

app = Flask(__name__, static_folder="../public", static_url_path="")

app.register_blueprint(admin_bp)
app.register_blueprint(teacher_bp)
app.register_blueprint(student_bp)


@app.route("/")
def serve_index():
    """Serve the landing page when running Flask locally."""
    return app.send_static_file("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verify the Flask API and environment configuration are active."""
    configured = bool(get_supabase_url() and get_supabase_anon_key())
    return jsonify({
        "status": "ok",
        "service": "College ERP API",
        "supabase_configured": configured,
    }), 200


@app.route("/api/config", methods=["GET"])
def public_config():
    """Return public Supabase client configuration for the browser."""
    url = get_supabase_url()
    anon_key = get_supabase_anon_key()
    if not url or not anon_key:
        return jsonify({"error": "Supabase environment variables are not configured"}), 500
    return jsonify({
        "supabaseUrl": url,
        "supabaseAnonKey": anon_key,
    }), 200


@app.route("/api/me", methods=["GET", "PUT"])
@require_auth
def current_user_profile():
    """Fetch or update the authenticated user's profile."""
    if request.method == "GET":
        role_record = None
        if g.role == "teacher":
            resp = g.db.table("teachers").select("*, departments(id, name, code)").eq("profile_id", g.profile["id"]).maybe_single().execute()
            role_record = resp.data
        elif g.role == "student":
            resp = g.db.table("students").select("*, courses(id, name, code), academic_sessions(id, name), semesters(id, name)").eq("profile_id", g.profile["id"]).maybe_single().execute()
            role_record = resp.data
        return jsonify({"profile": g.profile, "role_record": role_record}), 200

    data = request.get_json(silent=True) or {}
    allowed = {
        k: data[k]
        for k in ["first_name", "last_name", "gender", "phone", "address", "avatar_url"]
        if k in data
    }
    if not allowed:
        return jsonify({"error": "No valid profile fields provided"}), 400
    resp = g.db.table("profiles").update(allowed).eq("id", g.profile["id"]).execute()
    return jsonify(resp.data[0] if resp.data else {}), 200


@app.route("/api/notifications", methods=["GET"])
@require_auth
def get_notifications():
    """Return the authenticated user's notifications."""
    resp = (
        g.db.table("notifications")
        .select("*")
        .eq("recipient_id", g.profile["id"])
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    return jsonify(resp.data or []), 200


@app.route("/api/notifications/<int:notif_id>/read", methods=["PATCH"])
@require_auth
def mark_notification_read(notif_id: int):
    """Mark a single notification as read."""
    resp = (
        g.db.table("notifications")
        .update({"is_read": True})
        .eq("id", notif_id)
        .eq("recipient_id", g.profile["id"])
        .execute()
    )
    return jsonify(resp.data[0] if resp.data else {}), 200


@app.route("/api/bootstrap-demo", methods=["POST"])
def bootstrap_demo_data():
    """One-time initializer that creates 3 demo accounts and sample academic data
    only when the database has zero profiles. Locks itself permanently afterward.
    """
    admin_client = get_admin_client()
    if not admin_client:
        return jsonify({"error": "SUPABASE_SERVICE_ROLE_KEY is not configured on the server"}), 500

    existing = admin_client.table("profiles").select("id").limit(1).execute().data or []
    if len(existing) > 0:
        return jsonify({"error": "Database is already initialized"}), 409

    # 1. Create 3 demo Auth users (trigger creates profiles automatically)
    demo_users = [
        ("admin@college-erp.edu", "Admin@1234", "HOD", "Admin", "admin"),
        ("teacher@college-erp.edu", "Teacher@1234", "Alan", "Turing", "teacher"),
        ("student@college-erp.edu", "Student@1234", "Ada", "Lovelace", "student"),
    ]
    user_ids = {}
    for email, pw, fn, ln, role in demo_users:
        created = admin_client.auth.admin.create_user({
            "email": email,
            "password": pw,
            "email_confirm": True,
            "user_metadata": {"first_name": fn, "last_name": ln, "role": role},
        })
        uid = created.user.id
        admin_client.table("profiles").update({
            "first_name": fn,
            "last_name": ln,
            "role": role,
        }).eq("id", uid).execute()
        user_ids[role] = uid

    # 2. Seed Department, Course, Session, Semester
    dept = admin_client.table("departments").insert({
        "name": "Computer Science & Engineering",
        "code": "CSE",
        "description": "Department of Computer Science and Software Engineering",
    }).execute().data[0]

    course = admin_client.table("courses").insert({
        "department_id": dept["id"],
        "name": "B.Tech Computer Science",
        "code": "BTCS",
        "duration_years": 4,
    }).execute().data[0]

    session = admin_client.table("academic_sessions").insert({
        "name": "2026-2027",
        "start_date": "2026-08-01",
        "end_date": "2027-05-31",
        "is_current": True,
    }).execute().data[0]

    semester = admin_client.table("semesters").insert({
        "session_id": session["id"],
        "name": "Fall 2026",
        "semester_number": 1,
        "start_date": "2026-08-01",
        "end_date": "2026-12-20",
        "is_current": True,
    }).execute().data[0]

    # 3. Seed Teacher, Student, Subject, Enrollment, Examination
    teacher = admin_client.table("teachers").insert({
        "profile_id": user_ids["teacher"],
        "department_id": dept["id"],
        "employee_id": "EMP-101",
        "qualification": "Ph.D. Computer Science",
    }).execute().data[0]

    student = admin_client.table("students").insert({
        "profile_id": user_ids["student"],
        "course_id": course["id"],
        "session_id": session["id"],
        "semester_id": semester["id"],
        "roll_number": "CSE-2026-001",
    }).execute().data[0]

    subject = admin_client.table("subjects").insert({
        "course_id": course["id"],
        "semester_id": semester["id"],
        "teacher_id": teacher["id"],
        "name": "Data Structures & Algorithms",
        "code": "CS201",
        "credits": 4,
    }).execute().data[0]

    admin_client.table("enrollments").insert({
        "student_id": student["id"],
        "subject_id": subject["id"],
        "semester_id": semester["id"],
    }).execute()

    admin_client.table("examinations").insert({
        "name": "Midterm Fall 2026",
        "exam_type": "midterm",
        "session_id": session["id"],
        "semester_id": semester["id"],
        "exam_date": "2026-10-15",
        "max_marks": 100,
    }).execute()

    return jsonify({"initialized": True, "accounts_created": 3}), 201


if __name__ == "__main__":
    app.run(debug=True, port=5000)
