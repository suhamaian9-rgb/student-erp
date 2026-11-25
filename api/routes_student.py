"""Student REST API routes for the College ERP System."""

from flask import Blueprint, g, jsonify, request
from api.auth_utils import require_role
from api.helpers import require_fields

student_bp = Blueprint("student", __name__, url_prefix="/api/student")


def _get_student_record():
    resp = (
        g.db.table("students")
        .select("*, courses(id, name, code, departments(name)), academic_sessions(id, name), semesters(id, name)")
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

        records = g.db.table("attendance_records").select("id, status").eq("student_id", sid).execute().data or []
        total_att = len(records)
        present_att = sum(1 for r in records if r.get("status") in ("present", "late"))
        att_pct = round((present_att / total_att) * 100, 1) if total_att > 0 else 0.0

        subjects = []
        if student.get("course_id"):
            subjects = g.db.table("subjects").select("id").eq("course_id", student["course_id"]).execute().data or []

        results = g.db.table("results").select("id").eq("student_id", sid).execute().data or []
        leaves = g.db.table("leave_applications").select("id, status").eq("applicant_id", g.profile["id"]).execute().data or []

        return jsonify({
            "student": student,
            "counts": {
                "attendance_percentage": att_pct,
                "total_classes": total_att,
                "present_classes": present_att,
                "absent_classes": total_att - present_att,
                "subjects": len(subjects),
                "results": len(results),
                "pending_leaves": sum(1 for l in leaves if l.get("status") == "pending"),
            },
        }), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@student_bp.route("/subjects", methods=["GET"])
@require_role("student")
def get_subjects():
    try:
        student = _get_student_record()
        if not student or not student.get("course_id"):
            return jsonify([]), 200
        resp = (
            g.db.table("subjects")
            .select("*, courses(id, name, code), semesters(id, name), teachers(id, employee_id, profiles(first_name, last_name, email))")
            .eq("course_id", student["course_id"])
            .order("name")
            .execute()
        )
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


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
        return jsonify({"error": str(exc)}), 400


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
        return jsonify({"error": str(exc)}), 400


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
        return jsonify({"error": str(exc)}), 400


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
        return jsonify({"error": str(exc)}), 400
