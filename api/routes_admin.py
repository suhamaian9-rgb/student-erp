"""Admin / HOD REST API routes for the College ERP System."""

from datetime import datetime, timezone
import math
from flask import Blueprint, g, jsonify, request
from api.auth_utils import require_role
from api.helpers import compute_grade, require_fields, run_parallel, safe_error
from api.supabase_client import get_admin_client

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _handle_crud(table: str, required: list[str], updatable: list[str], order_col: str = "id"):
    """Uniform CRUD handler for simple reference tables."""
    if request.method == "GET":
        resp = g.db.table(table).select("*").order(order_col, desc=False).execute()
        return jsonify(resp.data or []), 200

    data = request.get_json(silent=True) or {}

    if request.method == "POST":
        err = require_fields(data, required)
        if err:
            return err
        payload = {k: data[k] for k in updatable if k in data}
        resp = g.db.table(table).insert(payload).execute()
        return jsonify(resp.data[0] if resp.data else {}), 201

    if request.method == "PUT":
        item_id = data.get("id")
        if not item_id:
            return jsonify({"error": "Missing 'id' for update"}), 400
        payload = {k: data[k] for k in updatable if k in data}
        if not payload:
            return jsonify({"error": "No valid fields to update"}), 400
        resp = g.db.table(table).update(payload).eq("id", item_id).execute()
        return jsonify(resp.data[0] if resp.data else {}), 200

    if request.method == "DELETE":
        item_id = request.args.get("id") or data.get("id")
        if not item_id:
            return jsonify({"error": "Missing 'id' for delete"}), 400
        g.db.table(table).delete().eq("id", item_id).execute()
        return jsonify({"deleted": True, "id": item_id}), 200


@admin_bp.route("/stats", methods=["GET"])
@require_role("admin")
def get_stats():
    """Return institutional summary counts and chart datasets for the Admin dashboard."""
    db = g.db
    fetched = run_parallel({
        "students": lambda: db.table("students").select("id, course_id").execute().data or [],
        "teachers": lambda: db.table("teachers").select("id").execute().data or [],
        "courses": lambda: db.table("courses").select("id, name, code").execute().data or [],
        "subjects": lambda: db.table("subjects").select("id, name, course_id").execute().data or [],
        "departments": lambda: db.table("departments").select("id").execute().data or [],
        "leaves": lambda: db.table("leave_applications").select("id, status").execute().data or [],
        "att_sessions": lambda: db.table("attendance_sessions").select("id, subject_id").execute().data or [],
        "feedbacks": lambda: db.table("feedback").select("id, reply").execute().data or [],
    })
    students = fetched["students"]
    teachers = fetched["teachers"]
    courses = fetched["courses"]
    subjects = fetched["subjects"]
    departments = fetched["departments"]
    leaves = fetched["leaves"]
    att_sessions = fetched["att_sessions"]
    feedbacks = fetched["feedbacks"]

    # Students and subjects per course
    course_chart = []
    for c in courses:
        cid = c["id"]
        course_chart.append({
            "course": c["name"],
            "code": c["code"],
            "students": sum(1 for s in students if s.get("course_id") == cid),
            "subjects": sum(1 for sub in subjects if sub.get("course_id") == cid),
        })

    # Attendance sessions per subject
    subject_chart = []
    for sub in subjects:
        sid = sub["id"]
        subject_chart.append({
            "subject": sub["name"],
            "sessions": sum(1 for a in att_sessions if a.get("subject_id") == sid),
        })

    return jsonify({
        "counts": {
            "students": len(students),
            "teachers": len(teachers),
            "departments": len(departments),
            "courses": len(courses),
            "subjects": len(subjects),
            "pending_leaves": sum(1 for l in leaves if l.get("status") == "pending"),
            "unanswered_feedback": sum(1 for f in feedbacks if not f.get("reply")),
            "attendance_sessions": len(att_sessions),
        },
        "course_chart": course_chart,
        "subject_chart": subject_chart,
    }), 200


@admin_bp.route("/departments", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_departments():
    try:
        return _handle_crud("departments", ["name", "code"], ["name", "code", "description"], "name")
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/courses", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_courses():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("courses")
                .select("*, departments(id, name, code)")
                .order("name")
                .execute()
            )
            return jsonify(resp.data or []), 200
        return _handle_crud(
            "courses",
            ["name", "code", "department_id"],
            ["name", "code", "department_id", "duration_years"],
            "name",
        )
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/sessions", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_sessions():
    try:
        return _handle_crud(
            "academic_sessions",
            ["name", "start_date", "end_date"],
            ["name", "start_date", "end_date", "is_current"],
            "start_date",
        )
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/semesters", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_semesters():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("semesters")
                .select("*, academic_sessions(id, name)")
                .order("semester_number")
                .execute()
            )
            return jsonify(resp.data or []), 200
        return _handle_crud(
            "semesters",
            ["session_id", "name", "semester_number", "start_date", "end_date"],
            ["session_id", "name", "semester_number", "start_date", "end_date", "is_current"],
            "semester_number",
        )
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/subjects", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_subjects():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("subjects")
                .select("*, courses(id, name, code), semesters(id, name), teachers(id, employee_id, profiles(first_name, last_name, email))")
                .order("name")
                .execute()
            )
            return jsonify(resp.data or []), 200
        return _handle_crud(
            "subjects",
            ["name", "code", "course_id"],
            ["name", "code", "course_id", "semester_id", "teacher_id", "credits"],
            "name",
        )
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/examinations", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_examinations():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("examinations")
                .select("*, academic_sessions(id, name), semesters(id, name)")
                .order("id", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200
        return _handle_crud(
            "examinations",
            ["name", "exam_type", "session_id"],
            ["name", "exam_type", "session_id", "semester_id", "exam_date", "max_marks"],
            "id",
        )
    except Exception as exc:
        return safe_error(exc)


def _create_user_account(email: str, password: str, first_name: str, last_name: str, role: str, gender: str = "M", phone: str = "", address: str = "", username: str | None = None):
    """Create an auth user and update their profile via the server-only admin client."""
    admin_client = get_admin_client()
    if not admin_client:
        raise RuntimeError("User provisioning service is not configured on the server.")
    clean_username = username.strip().lower() if username and username.strip() else None
    created = admin_client.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {
            "first_name": first_name,
            "last_name": last_name,
            "role": role,
            "username": clean_username or "",
        },
    })
    user_id = created.user.id
    admin_client.table("profiles").update({
        "first_name": first_name,
        "last_name": last_name,
        "role": role,
        "username": clean_username,
        "gender": gender or "M",
        "phone": phone or "",
        "address": address or "",
    }).eq("id", user_id).execute()
    return user_id


def _update_user_profile(profile_id: str, data: dict) -> None:
    """Update profile fields for a teacher or student and sync email to Auth if changed."""
    profile_updates = {
        k: data[k]
        for k in ["first_name", "last_name", "username", "gender", "phone", "address", "is_active"]
        if k in data
    }
    if "username" in profile_updates:
        u = str(profile_updates["username"] or "").strip().lower()
        profile_updates["username"] = u if u else None
    if "email" in data and str(data["email"] or "").strip():
        new_email = str(data["email"]).strip().lower()
        if "@" not in new_email or "." not in new_email.split("@")[-1]:
            raise ValueError("Invalid email address")
        admin_client = get_admin_client()
        if admin_client:
            admin_client.auth.admin.update_user_by_id(
                str(profile_id),
                {"email": new_email, "email_confirm": True},
            )
        profile_updates["email"] = new_email
    if profile_updates:
        g.db.table("profiles").update(profile_updates).eq("id", profile_id).execute()


@admin_bp.route("/teachers", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_teachers():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("teachers")
                .select("*, profiles(id, email, username, first_name, last_name, gender, phone, address, is_active), departments(id, name, code)")
                .order("id", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}

        if request.method == "POST":
            err = require_fields(data, ["email", "password", "first_name", "last_name", "employee_id"])
            if err:
                return err
            profile_id = _create_user_account(
                email=data["email"].strip().lower(),
                password=data["password"],
                first_name=data["first_name"].strip(),
                last_name=data["last_name"].strip(),
                role="teacher",
                gender=data.get("gender", "M"),
                phone=data.get("phone", ""),
                address=data.get("address", ""),
                username=data.get("username"),
            )
            teacher_payload = {
                "profile_id": profile_id,
                "employee_id": data["employee_id"].strip(),
                "department_id": data.get("department_id") or None,
                "qualification": data.get("qualification", ""),
            }
            resp = g.db.table("teachers").insert(teacher_payload).execute()
            return jsonify(resp.data[0] if resp.data else {}), 201

        if request.method == "PUT":
            err = require_fields(data, ["id", "profile_id"])
            if err:
                return err
            _update_user_profile(data["profile_id"], data)
            teacher_updates = {
                k: data[k]
                for k in ["department_id", "employee_id", "qualification"]
                if k in data
            }
            if teacher_updates:
                g.db.table("teachers").update(teacher_updates).eq("id", data["id"]).execute()
            return jsonify({"updated": True, "id": data["id"]}), 200

        if request.method == "DELETE":
            profile_id = request.args.get("profile_id") or data.get("profile_id")
            if not profile_id:
                return jsonify({"error": "Missing 'profile_id'"}), 400
            admin_client = get_admin_client()
            if admin_client:
                admin_client.auth.admin.delete_user(profile_id)
            else:
                g.db.table("profiles").delete().eq("id", profile_id).execute()
            return jsonify({"deleted": True}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/students", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_students():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("students")
                .select("*, profiles(id, email, username, first_name, last_name, gender, phone, address, is_active), courses(id, name, code), academic_sessions(id, name), semesters(id, name)")
                .order("id", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}

        if request.method == "POST":
            err = require_fields(data, ["email", "first_name", "last_name", "roll_number"])
            if err:
                return err
            password = str(data.get("password") or "").strip() or "student@prstu"
            profile_id = _create_user_account(
                email=data["email"].strip().lower(),
                password=password,
                first_name=data["first_name"].strip(),
                last_name=data["last_name"].strip(),
                role="student",
                gender=data.get("gender", "M"),
                phone=data.get("phone", ""),
                address=data.get("address", ""),
                username=data.get("username"),
            )
            student_payload = {
                "profile_id": profile_id,
                "roll_number": data["roll_number"].strip(),
                "course_id": data.get("course_id") or None,
                "session_id": data.get("session_id") or None,
                "semester_id": data.get("semester_id") or None,
            }
            resp = g.db.table("students").insert(student_payload).execute()
            return jsonify(resp.data[0] if resp.data else {}), 201

        if request.method == "PUT":
            err = require_fields(data, ["id", "profile_id"])
            if err:
                return err
            _update_user_profile(data["profile_id"], data)
            student_updates = {
                k: data[k]
                for k in ["roll_number", "course_id", "session_id", "semester_id"]
                if k in data
            }
            if student_updates:
                g.db.table("students").update(student_updates).eq("id", data["id"]).execute()
            return jsonify({"updated": True, "id": data["id"]}), 200

        if request.method == "DELETE":
            profile_id = request.args.get("profile_id") or data.get("profile_id")
            if not profile_id:
                return jsonify({"error": "Missing 'profile_id'"}), 400
            admin_client = get_admin_client()
            if admin_client:
                admin_client.auth.admin.delete_user(profile_id)
            else:
                g.db.table("profiles").delete().eq("id", profile_id).execute()
            return jsonify({"deleted": True}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/reset-password", methods=["POST"])
@require_role("admin")
def admin_reset_user_password():
    """Allow an admin to reset a student or teacher password without email/SMTP."""
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["profile_id", "password"])
    if err:
        return err
    new_pw = str(data["password"])
    if len(new_pw) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    admin_client = get_admin_client()
    if not admin_client:
        return jsonify({"error": "Admin auth service unavailable"}), 500
    try:
        admin_client.auth.admin.update_user_by_id(str(data["profile_id"]), {"password": new_pw})
        return jsonify({"reset": True}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/enrollments", methods=["GET", "POST", "DELETE"])
@require_role("admin")
def manage_enrollments():
    try:
        if request.method == "GET":
            semester_id = request.args.get("semester_id")
            student_id = request.args.get("student_id")
            subject_id = request.args.get("subject_id")
            page_size = 1000
            offset = 0
            all_rows = []
            while True:
                query = (
                    g.db.table("enrollments")
                    .select(
                        "*, students(id, roll_number, profiles(first_name, last_name), academic_sessions(name)), "
                        "subjects(id, name, code), semesters(id, name, semester_number, is_current)"
                    )
                )
                if semester_id:
                    query = query.eq("semester_id", semester_id)
                if student_id:
                    query = query.eq("student_id", student_id)
                if subject_id:
                    query = query.eq("subject_id", subject_id)
                chunk = query.order("id", desc=True).range(offset, offset + page_size - 1).execute().data or []
                all_rows.extend(chunk)
                if len(chunk) < page_size:
                    break
                offset += page_size
            return jsonify(all_rows), 200
        data = request.get_json(silent=True) or {}
        if request.method == "POST":
            err = require_fields(data, ["student_id", "subject_id"])
            if err:
                return err
            resp = g.db.table("enrollments").insert({
                "student_id": data["student_id"],
                "subject_id": data["subject_id"],
                "semester_id": data.get("semester_id") or None,
            }).execute()
            return jsonify(resp.data[0] if resp.data else {}), 201
        if request.method == "DELETE":
            eid = request.args.get("id") or data.get("id")
            if not eid:
                return jsonify({"error": "Missing 'id'"}), 400
            g.db.table("enrollments").delete().eq("id", eid).execute()
            return jsonify({"deleted": True}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/attendance", methods=["GET"])
@require_role("admin")
def view_attendance():
    """View attendance sessions and student records filtered by subject/session."""
    try:
        query = g.db.table("attendance_sessions").select(
            "*, subjects(id, name, code), academic_sessions(id, name), teachers(id, profiles(first_name, last_name)), attendance_records(id, status, remarks, students(id, roll_number, profiles(first_name, last_name)))"
        )
        subject_id = request.args.get("subject_id")
        session_id = request.args.get("session_id")
        if subject_id:
            query = query.eq("subject_id", subject_id)
        if session_id:
            query = query.eq("session_id", session_id)
        resp = query.order("attendance_date", desc=True).limit(100).execute()
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/results", methods=["GET", "POST", "PUT", "DELETE"])
@require_role("admin")
def manage_results():
    try:
        if request.method == "GET":
            query = g.db.table("results").select(
                "*, examinations(id, name, exam_type), subjects(id, name, code), students(id, roll_number, profiles(first_name, last_name))"
            )
            exam_id = request.args.get("examination_id")
            subject_id = request.args.get("subject_id")
            if exam_id:
                query = query.eq("examination_id", exam_id)
            if subject_id:
                query = query.eq("subject_id", subject_id)
            resp = query.order("id", desc=True).execute()
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        if request.method in ("POST", "PUT"):
            err = require_fields(data, ["examination_id", "student_id", "subject_id", "marks_obtained", "max_marks"])
            if err:
                return err
            marks = float(data["marks_obtained"])
            max_m = float(data["max_marks"])
            if not (math.isfinite(marks) and math.isfinite(max_m)) or max_m <= 0 or marks < 0 or marks > max_m:
                return jsonify({"error": "marks_obtained must be between 0 and max_marks"}), 400
            payload = {
                "examination_id": data["examination_id"],
                "student_id": data["student_id"],
                "subject_id": data["subject_id"],
                "marks_obtained": marks,
                "max_marks": max_m,
                "grade": compute_grade(marks, max_m),
                "remarks": data.get("remarks", ""),
            }
            resp = g.db.table("results").upsert(payload, on_conflict="examination_id,student_id,subject_id").execute()
            return jsonify(resp.data[0] if resp.data else {}), 200

        if request.method == "DELETE":
            rid = request.args.get("id") or data.get("id")
            if not rid:
                return jsonify({"error": "Missing 'id'"}), 400
            g.db.table("results").delete().eq("id", rid).execute()
            return jsonify({"deleted": True}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/leaves", methods=["GET", "PATCH"])
@require_role("admin")
def manage_leaves():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("leave_applications")
                .select("*, applicant:profiles!leave_applications_applicant_id_fkey(id, first_name, last_name, email, role)")
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["id", "status"])
        if err:
            return err
        if data["status"] not in ("approved", "rejected", "pending"):
            return jsonify({"error": "Invalid leave status"}), 400
        resp = (
            g.db.table("leave_applications")
            .update({
                "status": data["status"],
                "review_note": data.get("review_note", ""),
                "reviewed_by": g.profile["id"],
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", data["id"])
            .execute()
        )
        return jsonify(resp.data[0] if resp.data else {}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/feedback", methods=["GET", "PATCH"])
@require_role("admin")
def manage_feedback():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("feedback")
                .select("*, sender:profiles!feedback_sender_id_fkey(id, first_name, last_name, email, role)")
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["id", "reply"])
        if err:
            return err
        resp = (
            g.db.table("feedback")
            .update({
                "reply": data["reply"].strip(),
                "replied_by": g.profile["id"],
                "replied_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", data["id"])
            .execute()
        )
        return jsonify(resp.data[0] if resp.data else {}), 200
    except Exception as exc:
        return safe_error(exc)


@admin_bp.route("/notifications", methods=["POST"])
@require_role("admin")
def send_notification():
    """Send an in-app notification to a specific user or all users of a role."""
    try:
        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["message"])
        if err:
            return err
        title = data.get("title", "University ERP Notice")
        recipient_id = data.get("recipient_id")
        target_role = data.get("target_role")

        rows = []
        if recipient_id:
            rows.append({"recipient_id": recipient_id, "title": title, "message": data["message"]})
        elif target_role in ("teacher", "student"):
            users = g.db.table("profiles").select("id").eq("role", target_role).execute().data or []
            rows = [{"recipient_id": u["id"], "title": title, "message": data["message"]} for u in users]
        else:
            return jsonify({"error": "Specify recipient_id or target_role ('teacher' or 'student')"}), 400

        if rows:
            g.db.table("notifications").insert(rows).execute()
        return jsonify({"sent": len(rows)}), 201
    except Exception as exc:
        return safe_error(exc)
