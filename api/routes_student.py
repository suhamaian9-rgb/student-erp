"""Student REST API routes for the College ERP System."""

from flask import Blueprint, g, jsonify, request
from api.auth_utils import require_role
from api.helpers import require_fields, run_parallel, safe_error

student_bp = Blueprint("student", __name__, url_prefix="/api/student")


def _get_student_record():
    resp = (
        g.db.table("students")
        .select("*, courses(id, name, code, departments(name)), academic_sessions(id, name), semesters(id, name, semester_number, is_current)")
        .eq("profile_id", g.profile["id"])
        .single()
        .execute()
    )
    return resp.data


@student_bp.route("/stats", methods=["GET"])
@require_role("student")
def get_stats():
    try:
        student = _get_student_record()
        if not student:
            return jsonify({"error": "Student record not found"}), 404
        sid = student["id"]
        db = g.db
        profile_id = g.profile["id"]
        course_id = student.get("course_id")

        tasks = {
            "records": lambda: db.table("attendance_records").select("id, status").eq("student_id", sid).execute().data or [],
            "enrollments": lambda: db.table("enrollments").select("id, semesters(id, is_current)").eq("student_id", sid).execute().data or [],
            "results": lambda: db.table("results").select("id").eq("student_id", sid).execute().data or [],
            "leaves": lambda: db.table("leave_applications").select("id, status").eq("applicant_id", profile_id).execute().data or [],
        }
        if course_id:
            tasks["subjects"] = lambda: db.table("subjects").select("id").eq("course_id", course_id).execute().data or []

        fetched = run_parallel(tasks)
        records = fetched["records"]
        total_att = len(records)
        present_att = sum(1 for r in records if r.get("status") in ("present", "late"))
        att_pct = round((present_att / total_att) * 100, 1) if total_att > 0 else 0.0
        enrollments = fetched.get("enrollments", [])
        subjects = fetched.get("subjects", [])
        subject_count = len(enrollments) if enrollments else len(subjects)
        running_subjects = sum(1 for e in enrollments if (e.get("semesters") or {}).get("is_current"))
        completed_subjects = len(enrollments) - running_subjects
        results = fetched["results"]
        leaves = fetched["leaves"]

        return jsonify({
            "student": student,
            "counts": {
                "attendance_percentage": att_pct,
                "total_classes": total_att,
                "present_classes": present_att,
                "absent_classes": total_att - present_att,
                "subjects": subject_count,
                "running_subjects": running_subjects,
                "completed_subjects": completed_subjects,
                "results": len(results),
                "pending_leaves": sum(1 for l in leaves if l.get("status") == "pending"),
            },
        }), 200
    except Exception as exc:
        return safe_error(exc)


@student_bp.route("/subjects", methods=["GET"])
@require_role("student")
def get_subjects():
    try:
        student = _get_student_record()
        if not student:
            return jsonify([]), 200
        enr_resp = (
            g.db.table("enrollments")
            .select(
                "id, semester_id, semesters(id, name, semester_number, is_current), "
                "subjects(*, courses(id, name, code), teachers(id, employee_id, profiles(first_name, last_name, email)))"
            )
            .eq("student_id", student["id"])
            .execute()
        )
        enr_rows = enr_resp.data or []
        if enr_rows:
            items = []
            for enr in enr_rows:
                subj = enr.get("subjects")
                if not subj:
                    continue
                sem = enr.get("semesters") or subj.get("semesters") or {}
                item = dict(subj)
                item["semesters"] = sem or None
                item["enrollment_id"] = enr.get("id")
                item["semester_status"] = "running" if sem.get("is_current") else "completed"
                items.append(item)
            items.sort(
                key=lambda x: (
                    0 if x.get("semester_status") == "running" else 1,
                    -((x.get("semesters") or {}).get("semester_number") or 0),
                    x.get("code") or "",
                )
            )
            return jsonify(items), 200
        if not student.get("course_id"):
            return jsonify([]), 200
        resp = (
            g.db.table("subjects")
            .select("*, courses(id, name, code), semesters(id, name, semester_number, is_current), teachers(id, employee_id, profiles(first_name, last_name, email))")
            .eq("course_id", student["course_id"])
            .order("name")
            .execute()
        )
        fallback = []
        for subj in (resp.data or []):
            sem = subj.get("semesters") or {}
            item = dict(subj)
            is_run = bool(sem.get("is_current") or (student.get("semester_id") and subj.get("semester_id") == student["semester_id"]))
            item["semester_status"] = "running" if is_run else "catalog"
            fallback.append(item)
        return jsonify(fallback), 200
    except Exception as exc:
        return safe_error(exc)


@student_bp.route("/attendance", methods=["GET"])
@require_role("student")
def get_attendance():
    try:
        student = _get_student_record()
        if not student:
            return jsonify({"records": [], "by_subject": []}), 200

        resp = (
            g.db.table("attendance_records")
            .select("*, attendance_sessions(id, attendance_date, topic, subject_id, subjects(id, name, code))")
            .eq("student_id", student["id"])
            .order("id", desc=True)
            .execute()
        )
        records = resp.data or []

        subject_map = {}
        for r in records:
            ats = r.get("attendance_sessions") or {}
            sub = ats.get("subjects") or {}
            sub_name = sub.get("name", "Unknown")
            if sub_name not in subject_map:
                subject_map[sub_name] = {"subject": sub_name, "code": sub.get("code", ""), "present": 0, "total": 0}
            subject_map[sub_name]["total"] += 1
            if r.get("status") in ("present", "late"):
                subject_map[sub_name]["present"] += 1

        by_subject = []
        for item in subject_map.values():
            item["percentage"] = round((item["present"] / item["total"]) * 100, 1) if item["total"] > 0 else 0.0
            by_subject.append(item)

        return jsonify({"records": records, "by_subject": by_subject}), 200
    except Exception as exc:
        return safe_error(exc)


@student_bp.route("/results", methods=["GET"])
@require_role("student")
def get_results():
    try:
        student = _get_student_record()
        if not student:
            return jsonify([]), 200
        resp = (
            g.db.table("results")
            .select("*, examinations(id, name, exam_type, exam_date), subjects(id, name, code, credits)")
            .eq("student_id", student["id"])
            .order("id", desc=True)
            .execute()
        )
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return safe_error(exc)


@student_bp.route("/leaves", methods=["GET", "POST"])
@require_role("student")
def manage_leaves():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("leave_applications")
                .select("*")
                .eq("applicant_id", g.profile["id"])
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["start_date", "end_date", "reason"])
        if err:
            return err
        resp = g.db.table("leave_applications").insert({
            "applicant_id": g.profile["id"],
            "applicant_role": "student",
            "start_date": data["start_date"],
            "end_date": data["end_date"],
            "reason": data["reason"].strip(),
        }).execute()
        return jsonify(resp.data[0] if resp.data else {}), 201
    except Exception as exc:
        return safe_error(exc)


@student_bp.route("/feedback", methods=["GET", "POST"])
@require_role("student")
def manage_feedback():
    try:
        if request.method == "GET":
            resp = (
                g.db.table("feedback")
                .select("*")
                .eq("sender_id", g.profile["id"])
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["message"])
        if err:
            return err
        resp = g.db.table("feedback").insert({
            "sender_id": g.profile["id"],
            "sender_role": "student",
            "subject": data.get("subject", "General Feedback").strip(),
            "message": data["message"].strip(),
        }).execute()
        return jsonify(resp.data[0] if resp.data else {}), 201
    except Exception as exc:
        return safe_error(exc)
