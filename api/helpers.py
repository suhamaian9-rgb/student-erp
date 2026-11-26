"""Shared validation, sanitization, concurrency, and calculation helpers."""

from concurrent.futures import ThreadPoolExecutor
import math
import os
import re
from typing import Any, Callable
from flask import jsonify

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,40}$")
DEFAULT_CAMPUS_LAT = float(os.environ.get("CAMPUS_LAT", "22.5791"))
DEFAULT_CAMPUS_LNG = float(os.environ.get("CAMPUS_LNG", "89.9759"))


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in meters between two WGS84 coordinates."""
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def run_parallel(tasks: dict[str, Callable[[], Any]]) -> dict[str, Any]:
    """Execute independent I/O callables concurrently and return results keyed by name."""
    if not tasks:
        return {}
    if len(tasks) == 1:
        key, fn = next(iter(tasks.items()))
        return {key: fn()}
    with ThreadPoolExecutor(max_workers=min(8, len(tasks))) as pool:
        futures = {key: pool.submit(fn) for key, fn in tasks.items()}
        return {key: fut.result() for key, fut in futures.items()}


def compute_grade(marks_obtained: float, max_marks: float) -> str:
    """Compute a standard letter grade from percentage score."""
    if max_marks <= 0:
        return "N/A"
    pct = (marks_obtained / max_marks) * 100.0
    if pct >= 90:
        return "A+"
    if pct >= 80:
        return "A"
    if pct >= 70:
        return "B+"
    if pct >= 60:
        return "B"
    if pct >= 50:
        return "C"
    if pct >= 40:
        return "D"
    return "F"


def grade_point_from_marks(marks_obtained: float, max_marks: float) -> float:
    """Compute 4.00-scale UGC grade point from marks."""
    if max_marks <= 0:
        return 0.0
    pct = (marks_obtained / max_marks) * 100.0
    if pct >= 80:
        return 4.00
    if pct >= 75:
        return 3.75
    if pct >= 70:
        return 3.50
    if pct >= 65:
        return 3.25
    if pct >= 60:
        return 3.00
    if pct >= 55:
        return 2.75
    if pct >= 50:
        return 2.50
    if pct >= 45:
        return 2.25
    if pct >= 40:
        return 2.00
    return 0.00


def compute_cgpa_summary(results: list[dict]) -> dict:
    """Compute credit-weighted CGPA, semester GPAs, and retake/improvement flags."""
    best_by_subject: dict[str, dict] = {}
    for r in results or []:
        subj = r.get("subjects") or {}
        sub_id = str(r.get("subject_id") or subj.get("id") or r.get("id"))
        marks = float(r.get("marks_obtained") or 0)
        max_m = float(r.get("max_marks") or 100)
        gp = grade_point_from_marks(marks, max_m)
        credits = float(subj.get("credits") or 3)
        exam = r.get("examinations") or {}
        sem_info = exam.get("semesters") or subj.get("semesters") or {}
        sem_name = sem_info.get("name") or "General"

        prev = best_by_subject.get(sub_id)
        if prev is None or gp > prev["grade_point"] or (gp == prev["grade_point"] and marks > prev["marks_obtained"]):
            best_by_subject[sub_id] = {
                "subject_id": sub_id,
                "subject_code": subj.get("code") or "",
                "subject_name": subj.get("name") or "Subject",
                "credits": credits,
                "marks_obtained": marks,
                "max_marks": max_m,
                "percentage": round((marks / max_m) * 100.0, 1) if max_m > 0 else 0.0,
                "grade": r.get("grade") or compute_grade(marks, max_m),
                "grade_point": gp,
                "semester": sem_name,
                "exam_name": exam.get("name") or "",
            }

    subjects_list = list(best_by_subject.values())
    total_credits_attempted = sum(s["credits"] for s in subjects_list)
    total_credits_earned = sum(s["credits"] for s in subjects_list if s["grade_point"] > 0)
    weighted_sum = sum(s["grade_point"] * s["credits"] for s in subjects_list)
    cgpa = round(weighted_sum / total_credits_attempted, 2) if total_credits_attempted > 0 else 0.0

    sem_map: dict[str, list[dict]] = {}
    for s in subjects_list:
        sem_map.setdefault(s["semester"], []).append(s)
    semester_gpas = []
    for sem_name, items in sem_map.items():
        sem_cred = sum(i["credits"] for i in items)
        sem_w = sum(i["grade_point"] * i["credits"] for i in items)
        semester_gpas.append({
            "semester": sem_name,
            "credits": sem_cred,
            "sgpa": round(sem_w / sem_cred, 2) if sem_cred > 0 else 0.0,
        })

    retake_required = [s for s in subjects_list if s["grade_point"] == 0.0]
    improvement_eligible = [s for s in subjects_list if 0.0 < s["grade_point"] < 2.50]

    return {
        "cgpa": cgpa,
        "credits_attempted": total_credits_attempted,
        "credits_earned": total_credits_earned,
        "semester_gpas": semester_gpas,
        "retake_required": retake_required,
        "improvement_eligible": improvement_eligible,
        "subject_records": subjects_list,
    }


def require_fields(data: dict, fields: list[str]):
    """Return a 400 JSON response if any required field is missing or blank, else None."""
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request body"}), 400
    missing = [f for f in fields if data.get(f) is None or str(data.get(f)).strip() == ""]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    return None


def safe_error(exc: Exception, default_message: str = "Request could not be completed", status: int = 400):
    """Return a sanitized error response without leaking internal stack traces or DB schemas."""
    msg = str(exc)
    lower = msg.lower()
    if "duplicate key" in lower or "unique constraint" in lower:
        return jsonify({"error": "A record with that identifier already exists."}), 409
    if "violates foreign key" in lower:
        return jsonify({"error": "Referenced record does not exist or is in use."}), 400
    if "violates check constraint" in lower:
        return jsonify({"error": "One or more values are outside the allowed range."}), 400
    if "permission denied" in lower or "row-level security" in lower:
        return jsonify({"error": "You do not have permission to perform this action."}), 403
    return jsonify({"error": default_message}), status


def parse_pagination(args) -> tuple[int, int]:
    """Extract safe page and page_size values from query parameters."""
    try:
        page = max(1, int(args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(args.get("page_size", 20))))
    except (TypeError, ValueError):
        page_size = 20
    return page, page_size
