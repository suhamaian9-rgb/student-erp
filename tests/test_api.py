"""Automated unit and route guard tests for the College ERP Flask API."""

from api.helpers import compute_grade
from api.index import app


def test_public_endpoints():
    client = app.test_client()
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.get_json()["status"] == "ok"

    cfg = client.get("/api/config")
    assert cfg.status_code == 200
    assert "supabaseUrl" in cfg.get_json()
    assert "supabaseAnonKey" in cfg.get_json()
    assert "service_role" not in str(cfg.get_json()).lower()

    idx = client.get("/")
    assert idx.status_code == 200


def test_protected_endpoints_reject_unauthenticated():
    client = app.test_client()
    protected_paths = [
        "/api/me",
        "/api/notifications",
        "/api/admin/stats",
        "/api/admin/departments",
        "/api/admin/courses",
        "/api/admin/students",
        "/api/admin/teachers",
        "/api/admin/subjects",
        "/api/admin/leaves",
        "/api/admin/feedback",
        "/api/teacher/stats",
        "/api/teacher/subjects",
        "/api/teacher/attendance",
        "/api/teacher/results",
        "/api/student/stats",
        "/api/student/attendance",
        "/api/student/results",
    ]
    for path in protected_paths:
        resp = client.get(path)
        assert resp.status_code == 401, f"Expected 401 for {path}, got {resp.status_code}"


def test_compute_grade_boundaries():
    assert compute_grade(95, 100) == "A+"
    assert compute_grade(82, 100) == "A"
    assert compute_grade(74, 100) == "B+"
    assert compute_grade(63, 100) == "B"
    assert compute_grade(55, 100) == "C"
    assert compute_grade(42, 100) == "D"
    assert compute_grade(25, 100) == "F"
    assert compute_grade(10, 0) == "N/A"
