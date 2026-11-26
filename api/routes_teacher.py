"""Teacher REST API routes for the College ERP System."""

import math
from datetime import datetime, timedelta, timezone
import secrets
from flask import Blueprint, g, jsonify, request
from api.auth_utils import require_role
from api.helpers import (
    compute_grade,
    require_fields,
    run_parallel,
    safe_error,
)

teacher_bp = Blueprint("teacher", __name__, url_prefix="/api/teacher")


def _get_teacher_record():
    resp = (
        g.db.table("teachers")
        .select("*, departments(id, name, code)")
        .eq("profile_id", g.profile["id"])
        .single()
        .execute()
    )
    return resp.data


@teacher_bp.route("/stats", methods=["GET"])
@require_role("teacher")
def get_stats():
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"error": "Teacher record not found"}), 404
        tid = teacher["id"]

        db = g.db
        profile_id = g.profile["id"]
        subjects = db.table("subjects").select("id, name, code, course_id").eq("teacher_id", tid).execute().data or []
        subject_ids = [s["id"] for s in subjects]
        course_ids = list({s["course_id"] for s in subjects if s.get("course_id")})

        tasks = {
            "leaves": lambda: db.table("leave_applications").select("id, status").eq("applicant_id", profile_id).execute().data or [],
        }
        if course_ids:
            tasks["students"] = lambda: db.table("students").select("id").in_("course_id", course_ids).execute().data or []
        if subject_ids:
            tasks["att_sessions"] = lambda: db.table("attendance_sessions").select("id, subject_id").in_("subject_id", subject_ids).execute().data or []

        fetched = run_parallel(tasks)
        students = fetched.get("students", [])
        att_sessions = fetched.get("att_sessions", [])
        leaves = fetched["leaves"]

        chart_data = [
            {
                "subject": s["name"],
                "sessions": sum(1 for a in att_sessions if a.get("subject_id") == s["id"]),
            }
            for s in subjects
        ]

        return jsonify({
            "teacher": teacher,
            "counts": {
                "subjects": len(subjects),
                "students": len(students),
                "attendance_sessions": len(att_sessions),
                "leaves": len(leaves),
            },
            "subject_chart": chart_data,
        }), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/subjects", methods=["GET"])
@require_role("teacher")
def get_subjects():
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify([]), 200
        resp = (
            g.db.table("subjects")
            .select("*, courses(id, name, code), semesters(id, name, session_id)")
            .eq("teacher_id", teacher["id"])
            .order("name")
            .execute()
        )
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/sessions", methods=["GET"])
@require_role("teacher")
def get_sessions():
    try:
        resp = g.db.table("academic_sessions").select("*").order("start_date", desc=True).execute()
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/examinations", methods=["GET"])
@require_role("teacher")
def get_examinations():
    try:
        resp = (
            g.db.table("examinations")
            .select("*, academic_sessions(id, name), semesters(id, name)")
            .order("id", desc=True)
            .execute()
        )
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/students", methods=["GET"])
@require_role("teacher")
def get_students():
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify([]), 200
        subject_id = request.args.get("subject_id")
        session_id = request.args.get("session_id")

        subjects = g.db.table("subjects").select("id, course_id").eq("teacher_id", teacher["id"]).execute().data or []
        if subject_id:
            subjects = [s for s in subjects if str(s["id"]) == str(subject_id)]
        course_ids = list({s["course_id"] for s in subjects if s.get("course_id")})
        if not course_ids:
            return jsonify([]), 200

        query = (
            g.db.table("students")
            .select("*, profiles(id, first_name, last_name, email, gender), courses(id, name, code), academic_sessions(id, name)")
            .in_("course_id", course_ids)
        )
        if session_id:
            query = query.eq("session_id", session_id)
        resp = query.order("roll_number").execute()
        return jsonify(resp.data or []), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/attendance", methods=["GET", "POST"])
@require_role("teacher")
def manage_attendance():
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"error": "Teacher record not found"}), 404

        if request.method == "GET":
            subject_id = request.args.get("subject_id")
            subs = g.db.table("subjects").select("id").eq("teacher_id", teacher["id"]).execute().data or []
            sub_ids = [s["id"] for s in subs]
            if not sub_ids:
                return jsonify([]), 200
            query = (
                g.db.table("attendance_sessions")
                .select("*, subjects(id, name, code), academic_sessions(id, name), attendance_records(id, student_id, status, remarks, updated_at, students(id, roll_number, profiles(first_name, last_name)))")
            )
            if subject_id:
                if str(subject_id) not in {str(sid) for sid in sub_ids}:
                    return jsonify({"error": "You are not assigned to this subject"}), 403
                query = query.eq("subject_id", subject_id)
            else:
                query = query.in_("subject_id", sub_ids)
            resp = query.order("attendance_date", desc=True).limit(100).execute()
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["subject_id", "session_id", "attendance_date", "records"])
        if err:
            return err

        # Verify teacher owns this subject
        sub_check = (
            g.db.table("subjects")
            .select("id")
            .eq("id", data["subject_id"])
            .eq("teacher_id", teacher["id"])
            .execute()
            .data
        )
        if not sub_check:
            return jsonify({"error": "You are not assigned to this subject"}), 403

        att_session_resp = g.db.table("attendance_sessions").insert({
            "subject_id": data["subject_id"],
            "session_id": data["session_id"],
            "teacher_id": teacher["id"],
            "attendance_date": data["attendance_date"],
            "topic": data.get("topic", ""),
            "updated_by": g.profile["id"],
        }).execute()
        att_session = att_session_resp.data[0]

        records_payload = []
        for rec in data["records"]:
            status = rec.get("status", "absent")
            if status not in ("present", "absent", "late"):
                status = "absent"
            records_payload.append({
                "attendance_session_id": att_session["id"],
                "student_id": rec["student_id"],
                "status": status,
                "remarks": rec.get("remarks", ""),
                "updated_by": g.profile["id"],
            })

        if records_payload:
            g.db.table("attendance_records").insert(records_payload).execute()

        return jsonify({"attendance_session": att_session, "records_saved": len(records_payload)}), 201
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/attendance/<int:att_session_id>", methods=["PUT"])
@require_role("teacher")
def update_attendance(att_session_id: int):
    """Update attendance records with audit tracking (`updated_by`)."""
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"error": "Teacher record not found"}), 404
        sess_rows = (
            g.db.table("attendance_sessions")
            .select("id, subject_id")
            .eq("id", att_session_id)
            .execute()
            .data
        )
        if not sess_rows:
            return jsonify({"error": "Attendance session not found"}), 404
        owned = (
            g.db.table("subjects")
            .select("id")
            .eq("id", sess_rows[0]["subject_id"])
            .eq("teacher_id", teacher["id"])
            .execute()
            .data
        )
        if not owned:
            return jsonify({"error": "You are not assigned to this subject"}), 403

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["records"])
        if err:
            return err

        g.db.table("attendance_sessions").update({
            "topic": data.get("topic", ""),
            "updated_by": g.profile["id"],
        }).eq("id", att_session_id).execute()

        records_payload = []
        for rec in data["records"]:
            status = rec.get("status", "absent")
            if status not in ("present", "absent", "late"):
                status = "absent"
            records_payload.append({
                "attendance_session_id": att_session_id,
                "student_id": rec["student_id"],
                "status": status,
                "remarks": rec.get("remarks", ""),
                "updated_by": g.profile["id"],
            })

        if records_payload:
            g.db.table("attendance_records").upsert(
                records_payload, on_conflict="attendance_session_id,student_id"
            ).execute()

        return jsonify({"updated": True, "records_updated": len(records_payload)}), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/attendance/open", methods=["POST"])
@require_role("teacher")
def open_live_attendance():
    """Open a time-limited classroom attendance window with campus location fencing."""
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"error": "Teacher record not found"}), 404

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["subject_id", "session_id", "attendance_date"])
        if err:
            return err

        sub_check = (
            g.db.table("subjects")
            .select("id")
            .eq("id", data["subject_id"])
            .eq("teacher_id", teacher["id"])
            .execute()
            .data
        )
        if not sub_check:
            return jsonify({"error": "You are not assigned to this subject"}), 403

        try:
            duration_min = min(180, max(1, int(data.get("duration_minutes", 10))))
        except (TypeError, ValueError):
            duration_min = 10

        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(minutes=duration_min)).isoformat()
        code = secrets.token_hex(3).upper()

        payload = {
            "subject_id": data["subject_id"],
            "session_id": data["session_id"],
            "teacher_id": teacher["id"],
            "attendance_date": data["attendance_date"],
            "topic": str(data.get("topic", "")).strip(),
            "is_open": True,
            "expires_at": expires_at,
            "closed_at": None,
            "session_code": code,
            "campus_lat": None,
            "campus_lng": None,
            "updated_by": g.profile["id"],
        }
        resp = g.db.table("attendance_sessions").upsert(
            payload, on_conflict="subject_id,attendance_date"
        ).execute()
        return jsonify(resp.data[0] if resp.data else payload), 201
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/attendance/<int:att_session_id>/close", methods=["POST"])
@require_role("teacher")
def close_live_attendance(att_session_id: int):
    """Close a live attendance window and auto-mark all remaining students absent."""
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"error": "Teacher record not found"}), 404

        ats_resp = (
            g.db.table("attendance_sessions")
            .select("*, subjects(id, course_id, teacher_id)")
            .eq("id", att_session_id)
            .single()
            .execute()
        )
        ats = ats_resp.data
        if not ats or (ats.get("subjects") or {}).get("teacher_id") != teacher["id"]:
            return jsonify({"error": "Attendance session not found or forbidden"}), 403

        now_iso = datetime.now(timezone.utc).isoformat()
        g.db.table("attendance_sessions").update({
            "is_open": False,
            "closed_at": now_iso,
            "updated_by": g.profile["id"],
        }).eq("id", att_session_id).execute()

        subject_id = ats["subject_id"]
        course_id = (ats.get("subjects") or {}).get("course_id")

        enr_rows = g.db.table("enrollments").select("student_id").eq("subject_id", subject_id).execute().data or []
        roster_ids = {r["student_id"] for r in enr_rows}
        if not roster_ids and course_id:
            studs = (
                g.db.table("students")
                .select("id")
                .eq("course_id", course_id)
                .eq("session_id", ats["session_id"])
                .execute()
                .data or []
            )
            roster_ids = {s["id"] for s in studs}

        existing_recs = (
            g.db.table("attendance_records")
            .select("student_id, status")
            .eq("attendance_session_id", att_session_id)
            .execute()
            .data or []
        )
        already_ids = {r["student_id"] for r in existing_recs}
        missing_ids = sorted(roster_ids - already_ids)

        if missing_ids:
            absent_rows = [
                {
                    "attendance_session_id": att_session_id,
                    "student_id": sid,
                    "status": "absent",
                    "remarks": "Auto-marked absent when attendance closed",
                    "updated_by": g.profile["id"],
                }
                for sid in missing_ids
            ]
            g.db.table("attendance_records").insert(absent_rows).execute()

        return jsonify({
            "closed": True,
            "present_count": sum(1 for r in existing_recs if r.get("status") in ("present", "late")),
            "absent_marked": len(missing_ids),
        }), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/results", methods=["GET", "POST", "PUT"])
@require_role("teacher")
def manage_results():
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"error": "Teacher record not found"}), 404

        if request.method == "GET":
            subs = g.db.table("subjects").select("id").eq("teacher_id", teacher["id"]).execute().data or []
            sub_ids = [s["id"] for s in subs]
            if not sub_ids:
                return jsonify([]), 200
            query = g.db.table("results").select(
                "*, examinations(id, name, exam_type), subjects(id, name, code), students(id, roll_number, profiles(first_name, last_name))"
            ).in_("subject_id", sub_ids)
            exam_id = request.args.get("examination_id")
            subject_id = request.args.get("subject_id")
            if exam_id:
                query = query.eq("examination_id", exam_id)
            if subject_id:
                query = query.eq("subject_id", subject_id)
            resp = query.order("id", desc=True).execute()
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["examination_id", "student_id", "subject_id", "marks_obtained", "max_marks"])
        if err:
            return err

        sub_check = (
            g.db.table("subjects")
            .select("id")
            .eq("id", data["subject_id"])
            .eq("teacher_id", teacher["id"])
            .execute()
            .data
        )
        if not sub_check:
            return jsonify({"error": "You are not assigned to this subject"}), 403

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
            "graded_by": teacher["id"],
        }
        resp = g.db.table("results").upsert(payload, on_conflict="examination_id,student_id,subject_id").execute()
        return jsonify(resp.data[0] if resp.data else {}), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/leaves", methods=["GET", "POST"])
@require_role("teacher")
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
        if str(data["end_date"]) < str(data["start_date"]):
            return jsonify({"error": "end_date must be on or after start_date"}), 400
        resp = g.db.table("leave_applications").insert({
            "applicant_id": g.profile["id"],
            "applicant_role": "teacher",
            "start_date": data["start_date"],
            "end_date": data["end_date"],
            "reason": data["reason"].strip(),
        }).execute()
        return jsonify(resp.data[0] if resp.data else {}), 201
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/feedback", methods=["GET", "POST"])
@require_role("teacher")
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
            "sender_role": "teacher",
            "subject": data.get("subject", "General Feedback").strip(),
            "message": data["message"].strip(),
        }).execute()
        return jsonify(resp.data[0] if resp.data else {}), 201
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/insights", methods=["GET"])
@require_role("teacher")
def get_insights():
    """Return low-attendance (<75%) alerts and subject result averages for this teacher."""
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify({"low_attendance": [], "subject_performance": []}), 200

        db = g.db
        subs = db.table("subjects").select("id, name, code, course_id").eq("teacher_id", teacher["id"]).execute().data or []
        sub_ids = [s["id"] for s in subs]
        if not sub_ids:
            return jsonify({"low_attendance": [], "subject_performance": []}), 200

        sub_map = {s["id"]: s for s in subs}
        fetched = run_parallel({
            "att_sessions": lambda: db.table("attendance_sessions").select("id, subject_id").in_("subject_id", sub_ids).execute().data or [],
            "results": lambda: db.table("results").select("subject_id, marks_obtained, max_marks").in_("subject_id", sub_ids).execute().data or [],
        })
        att_sess = fetched["att_sessions"]
        att_ids = [a["id"] for a in att_sess]
        att_to_sub = {a["id"]: a["subject_id"] for a in att_sess}

        att_recs = []
        if att_ids:
            att_recs = (
                db.table("attendance_records")
                .select("attendance_session_id, student_id, status, students(id, roll_number, profiles(first_name, last_name))")
                .in_("attendance_session_id", att_ids)
                .execute()
                .data or []
            )

        stu_sub_att: dict[tuple[int, int], dict] = {}
        for r in att_recs:
            sub_id = att_to_sub.get(r["attendance_session_id"])
            sid = r["student_id"]
            if not sub_id or not sid:
                continue
            key = (sid, sub_id)
            if key not in stu_sub_att:
                st = r.get("students") or {}
                prof = st.get("profiles") or {}
                stu_sub_att[key] = {
                    "student_id": sid,
                    "roll_number": st.get("roll_number") or "",
                    "student_name": f"{prof.get('first_name', '')} {prof.get('last_name', '')}".strip(),
                    "subject_code": sub_map[sub_id]["code"],
                    "subject_name": sub_map[sub_id]["name"],
                    "present": 0,
                    "total": 0,
                }
            stu_sub_att[key]["total"] += 1
            if r.get("status") in ("present", "late"):
                stu_sub_att[key]["present"] += 1

        low_attendance = []
        for item in stu_sub_att.values():
            pct = round((item["present"] / item["total"]) * 100.0, 1) if item["total"] > 0 else 0.0
            if pct < 75.0:
                item["percentage"] = pct
                low_attendance.append(item)
        low_attendance.sort(key=lambda x: x["percentage"])

        res_by_sub: dict[int, list[float]] = {sid: [] for sid in sub_ids}
        for r in fetched["results"]:
            sid = r.get("subject_id")
            max_m = float(r.get("max_marks") or 100)
            marks = float(r.get("marks_obtained") or 0)
            if sid in res_by_sub and max_m > 0:
                res_by_sub[sid].append((marks / max_m) * 100.0)

        subject_performance = []
        for s in subs:
            pcts = res_by_sub.get(s["id"], [])
            avg_pct = round(sum(pcts) / len(pcts), 1) if pcts else 0.0
            pass_cnt = sum(1 for p in pcts if p >= 40.0)
            pass_rate = round((pass_cnt / len(pcts)) * 100.0, 1) if pcts else 0.0
            subject_performance.append({
                "subject_code": s["code"],
                "subject_name": s["name"],
                "graded_count": len(pcts),
                "average_percentage": avg_pct,
                "pass_rate": pass_rate,
            })

        return jsonify({"low_attendance": low_attendance, "subject_performance": subject_performance}), 200
    except Exception as exc:
        return safe_error(exc)


@teacher_bp.route("/notices", methods=["GET", "POST", "DELETE"])
@require_role("teacher")
def manage_course_notices():
    """Post and manage subject announcements and study material links."""
    try:
        teacher = _get_teacher_record()
        if not teacher:
            return jsonify([]), 200

        if request.method == "GET":
            resp = (
                g.db.table("course_notices")
                .select("*, subjects(id, name, code)")
                .eq("teacher_id", teacher["id"])
                .order("created_at", desc=True)
                .execute()
            )
            return jsonify(resp.data or []), 200

        data = request.get_json(silent=True) or {}
        if request.method == "POST":
            err = require_fields(data, ["subject_id", "title", "content"])
            if err:
                return err
            sub_check = (
                g.db.table("subjects")
                .select("id")
                .eq("id", data["subject_id"])
                .eq("teacher_id", teacher["id"])
                .execute()
                .data
            )
            if not sub_check:
                return jsonify({"error": "You are not assigned to this subject"}), 403
            res_url = str(data.get("resource_url") or "").strip()
            if res_url and not (res_url.startswith("https://") or res_url.startswith("http://")):
                return jsonify({"error": "Resource URL must start with http:// or https://"}), 400
            resp = g.db.table("course_notices").insert({
                "subject_id": int(data["subject_id"]),
                "teacher_id": teacher["id"],
                "title": str(data["title"]).strip(),
                "content": str(data["content"]).strip(),
                "resource_url": res_url,
            }).execute()
            return jsonify(resp.data[0] if resp.data else {}), 201

        if request.method == "DELETE":
            nid = request.args.get("id") or data.get("id")
            if not nid:
                return jsonify({"error": "Missing 'id'"}), 400
            g.db.table("course_notices").delete().eq("id", int(nid)).eq("teacher_id", teacher["id"]).execute()
            return jsonify({"deleted": True}), 200
    except Exception as exc:
        return safe_error(exc)
