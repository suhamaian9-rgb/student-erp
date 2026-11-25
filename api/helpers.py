"""Shared validation and calculation helpers for the College ERP API."""

from flask import jsonify


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


def require_fields(data: dict, fields: list[str]):
    """Return a 400 JSON response if any required field is missing or blank, else None."""
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request body"}), 400
    missing = [f for f in fields if data.get(f) is None or str(data.get(f)).strip() == ""]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    return None


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
