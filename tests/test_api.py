"""Automated unit, privacy, security header, and route guard tests for the University ERP API."""

from api.helpers import compute_grade
from api.index import app


def test_public_endpoints_and_no_config_leak():
    client = app.test_client()
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.get_json() == {"status": "ok", "service": "University ERP"}
    assert health.headers.get("X-Content-Type-Options") == "nosniff"
    assert health.headers.get("X-Frame-Options") == "DENY"
    assert health.headers.get("Cache-Control") == "no-store"

    # /api/config must not exist so Supabase URL/keys are never exposed to browser DevTools
    assert client.get("/api/config").status_code == 404
    assert client.get("/").status_code == 200


def test_auth_login_logout_and_guards():
    client = app.test_client()
    assert client.post("/api/auth/login", json={}).status_code == 400
    assert client.post("/api/auth/login", json={"identifier": "bad!user", "password": "123"}).status_code == 401
    assert client.post("/api/auth/logout").status_code == 200

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
