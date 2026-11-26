"""Student REST API routes for the College ERP System."""

from datetime import datetime, timezone
from flask import Blueprint, g, jsonify, request
from api.auth_utils import require_role
from api.helpers import haversine_meters, require_fields, run_parallel, safe_error

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


@student_bp.route("/attendance/open", methods=["GET"])
@require_role("student")
def get_open_attendance_sessions():
    """Return currently open live attendance sessions for this student's subjects."""
    try:
        student = _get_student_record()
        if not student:
            return jsonify([]), 200

        enr_rows = g.db.table("enrollments").select("subject_id").eq("student_id", student["id"]).execute().data or []
        subject_ids = [r["subject_id"] for r in enr_rows]
        if not subject_ids and student.get("course_id"):
            subs = g.db.table("subjects").select("id").eq("course_id", student["course_id"]).execute().data or []
            subject_ids = [s["id"] for s in subs]
        if not subject_ids:
            return jsonify([]), 200

        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            open_sessions = (
                g.db.table("attendance_sessions")
                .select("id, subject_id, session_id, attendance_date, topic, is_open, expires_at, radius_meters, campus_lat, campus_lng, subjects(id, name, code), teachers(id, profiles(first_name, last_name))")
                .in_("subject_id", subject_ids)
                .eq("is_open", True)
                .gt("expires_at", now_iso)
                .order("expires_at", desc=False)
                .execute()
                .data or []
            )
        except Exception:
            return jsonify([]), 200
        if not open_sessions:
            return jsonify([]), 200

        session_ids = [s["id"] for s in open_sessions]
        recs = (
            g.db.table("attendance_records")
            .select("attendance_session_id, status")
            .eq("student_id", student["id"])
            .in_("attendance_session_id", session_ids)
            .execute()
            .data or []
        )
        marked_map = {r["attendance_session_id"]: r["status"] for r in recs}

        result = []
        for s in open_sessions:
            result.append({
                "id": s["id"],
                "subject_id": s["subject_id"],
                "attendance_date": s["attendance_date"],
                "topic": s.get("topic") or "",
                "expires_at": s["expires_at"],
                "requires_location": s.get("campus_lat") is not None and s.get("campus_lng") is not None,
                "radius_meters": s.get("radius_meters") or 50,
                "subjects": s.get("subjects"),
                "teachers": s.get("teachers"),
                "already_marked": s["id"] in marked_map,
                "marked_status": marked_map.get(s["id"]),
            })
        return jsonify(result), 200
    except Exception as exc:
        return safe_error(exc)


@student_bp.route("/attendance/checkin", methods=["POST"])
@require_role("student")
def checkin_live_attendance():
    """Allow a student to tick present in an open session after verifying campus location."""
    try:
        student = _get_student_record()
        if not student:
            return jsonify({"error": "Student record not found"}), 404

        data = request.get_json(silent=True) or {}
        err = require_fields(data, ["attendance_session_id"])
        if err:
            return err
        if not data.get("confirmed"):
            return jsonify({"error": "Please tick the confirmation checkbox to mark attendance."}), 400

        att_session_id = data["attendance_session_id"]
        ats = (
            g.db.table("attendance_sessions")
            .select("*")
            .eq("id", att_session_id)
            .single()
            .execute()
            .data
        )
        if not ats or not ats.get("is_open"):
            return jsonify({"error": "This attendance link is closed."}), 400

        expires_at = ats.get("expires_at")
        if expires_at:
            exp_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                return jsonify({"error": "This attendance link has expired."}), 400

        # Verify student is enrolled in this subject (or course fallback)
        enr = (
            g.db.table("enrollments")
            .select("id")
            .eq("student_id", student["id"])
            .eq("subject_id", ats["subject_id"])
            .execute()
            .data or []
        )
        if not enr:
            subj = g.db.table("subjects").select("course_id").eq("id", ats["subject_id"]).single().execute().data
            if not subj or subj.get("course_id") != student.get("course_id"):
                return jsonify({"error": "You are not enrolled in this subject."}), 403

        # Verify physical campus presence via either Campus GPS OR Teacher's live Class Code
        provided_code = str(data.get("session_code") or "").strip().upper()
        expected_code = str(ats.get("session_code") or "").strip().upper()
        code_valid = bool(expected_code and provided_code and provided_code == expected_code)

        if not code_valid:
            if ats.get("campus_lat") is not None and ats.get("campus_lng") is not None:
                if data.get("latitude") is None or data.get("longitude") is None:
                    if provided_code:
                        return jsonify({"error": "Incorrect Class Code. Please check the code from your teacher."}), 403
                    return jsonify({"error": "Allow location access or enter the Class Code from your teacher."}), 400
                try:
                    lat = float(data["latitude"])
                    lng = float(data["longitude"])
                except (TypeError, ValueError):
                    return jsonify({"error": "Invalid location coordinates."}), 400

                dist = haversine_meters(lat, lng, float(ats["campus_lat"]), float(ats["campus_lng"]))
                allowed_m = float(ats.get("radius_meters") or 50)
                if dist > allowed_m:
                    return jsonify({
                        "error": f"Outside campus ({int(dist)}m away; limit {int(allowed_m)}m). Enter your teacher's Class Code if you are in class on a PC."
                    }), 403
            elif expected_code:
                return jsonify({"error": "Please enter the Class Code from your teacher."}), 403

        existing = (
            g.db.table("attendance_records")
            .select("id, status")
            .eq("attendance_session_id", att_session_id)
            .eq("student_id", student["id"])
            .execute()
            .data or []
        )
        if existing:
            return jsonify({"checked_in": True, "status": existing[0]["status"], "already_marked": True}), 200

        g.db.table("attendance_records").insert({
            "attendance_session_id": att_session_id,
            "student_id": student["id"],
            "status": "present",
            "remarks": "Self check-in (campus verified)",
            "updated_by": g.profile["id"],
        }).execute()

        return jsonify({"checked_in": True, "status": "present"}), 201
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
        if str(data["end_date"]) < str(data["start_date"]):
            return jsonify({"error": "end_date must be on or after start_date"}), 400
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
