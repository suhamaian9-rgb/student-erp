"""Automated unit, privacy, security header, RBAC, and API tests for University ERP."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from api.helpers import compute_grade
from api.index import app


class _FakeTable:
    """Minimal fluent Supabase table query stub for offline Flask route testing."""

    def __init__(self, rows=None):
        self._rows = list(rows or [])
        self._single = False
        self._maybe_single = False
        self._op = "select"
        self._payload = None
        self.last_upsert = None

    def select(self, *args, **kwargs):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload if isinstance(payload, list) else [payload]
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op = "upsert"
        self._payload = payload if isinstance(payload, list) else [payload]
        self.last_upsert = (payload, on_conflict)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        if self._op == "select":
            self._rows = [r for r in self._rows if str(r.get(col)) == str(val)]
        return self

    def in_(self, col, vals):
        if self._op == "select":
            allowed = {str(v) for v in vals}
            self._rows = [r for r in self._rows if str(r.get(col)) in allowed]
        return self

    def ilike(self, col, val):
        return self.eq(col, val)

    def order(self, *args, **kwargs):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def range(self, start, end):
        self._rows = self._rows[start:end + 1]
        return self

    def single(self):
        self._single = True
        return self

    def maybe_single(self):
        self._maybe_single = True
        return self

    def execute(self):
        if self._op in ("insert", "upsert"):
            return SimpleNamespace(data=self._payload)
        if self._op == "update":
            return SimpleNamespace(data=[self._payload] if self._payload else [])
        if self._op == "delete":
            return SimpleNamespace(data=[])
        if self._single or self._maybe_single:
            return SimpleNamespace(data=self._rows[0] if self._rows else None)
        return SimpleNamespace(data=self._rows)


class _FakeDB:
    """In-memory fake Supabase client backed by table dictionaries."""

    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables
        self.instances: dict[str, _FakeTable] = {}

    def table(self, name: str):
        tbl = _FakeTable(self._tables.get(name, []))
        self.instances[name] = tbl
        return tbl


def _mock_auth(monkeypatch, role="student", is_active=True, tables=None, expired_access=False):
    user = SimpleNamespace(id="user-1", email=f"{role}@uni.edu")
    profile = {
        "id": "user-1",
        "email": f"{role}@uni.edu",
        "username": f"test-{role}",
        "first_name": "Test",
        "last_name": role.title(),
        "role": role,
        "is_active": is_active,
    }
    table_data = {"profiles": [profile], **(tables or {})}
    fake_db = _FakeDB(table_data)

    anon = MagicMock()
    if expired_access:
        anon.auth.get_user.side_effect = RuntimeError("JWT expired")
        anon.auth.refresh_session.return_value = SimpleNamespace(
            session=SimpleNamespace(access_token="new-access", refresh_token="new-refresh", user=user),
            user=user,
        )
    else:
        anon.auth.get_user.return_value = SimpleNamespace(user=user)

    monkeypatch.setattr("api.auth_utils.get_anon_client", lambda: anon)
    monkeypatch.setattr("api.auth_utils.get_user_client", lambda _tok: fake_db)
    return fake_db, anon


def test_public_endpoints_and_no_config_leak():
    client = app.test_client()
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.get_json() == {"status": "ok", "service": "University ERP"}
    assert health.headers.get("X-Content-Type-Options") == "nosniff"
    assert health.headers.get("X-Frame-Options") == "DENY"
    assert health.headers.get("Cache-Control") == "no-store"

    # /api/config must not exist so backend URLs/keys are never exposed to browser DevTools
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
        "/api/admin/enrollments",
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


def test_role_based_access_and_deactivated_account(monkeypatch):
    client = app.test_client()

    _mock_auth(monkeypatch, role="student")
    client.set_cookie("erp_access_token", "tok")
    assert client.get("/api/admin/stats").status_code == 403
    assert client.get("/api/teacher/stats").status_code == 403

    _mock_auth(monkeypatch, role="teacher")
    assert client.get("/api/admin/enrollments").status_code == 403
    assert client.get("/api/student/results").status_code == 403

    _mock_auth(monkeypatch, role="admin", is_active=False)
    assert client.get("/api/admin/stats").status_code == 403


def test_transparent_refresh_cookie_rotation(monkeypatch):
    _mock_auth(
        monkeypatch,
        role="student",
        expired_access=True,
        tables={"students": [{"id": 7, "profile_id": "user-1", "course_id": 1}]},
    )
    client = app.test_client()
    client.set_cookie("erp_access_token", "expired-tok")
    client.set_cookie("erp_refresh_token", "valid-refresh")

    resp = client.get("/api/me")
    assert resp.status_code == 200
    assert resp.get_json()["profile"]["role"] == "student"

    cookies = resp.headers.getlist("Set-Cookie")
    assert any("erp_access_token=new-access" in c and "HttpOnly" in c for c in cookies)
    assert any("erp_refresh_token=new-refresh" in c and "HttpOnly" in c for c in cookies)


def test_parallel_stats_and_admin_enrollments(monkeypatch):
    _mock_auth(
        monkeypatch,
        role="admin",
        tables={
            "students": [{"id": 1, "course_id": 10}],
            "teachers": [{"id": 2}],
            "courses": [{"id": 10, "name": "BSc CS", "code": "CS"}],
            "subjects": [{"id": 100, "name": "Algorithms", "course_id": 10}],
            "departments": [{"id": 5}],
            "leave_applications": [{"id": 9, "status": "pending"}],
            "attendance_sessions": [{"id": 3, "subject_id": 100}],
            "feedback": [{"id": 4, "reply": ""}],
            "enrollments": [{"id": 11, "student_id": 1, "subject_id": 100}],
        },
    )
    client = app.test_client()
    client.set_cookie("erp_access_token", "admin-tok")

    stats = client.get("/api/admin/stats")
    assert stats.status_code == 200
    body = stats.get_json()
    assert body["counts"]["students"] == 1
    assert body["counts"]["pending_leaves"] == 1
    assert body["course_chart"][0]["students"] == 1

    enr_get = client.get("/api/admin/enrollments")
    assert enr_get.status_code == 200
    assert len(enr_get.get_json()) == 1

    enr_post = client.post("/api/admin/enrollments", json={"student_id": 1, "subject_id": 100})
    assert enr_post.status_code == 201

    enr_del = client.delete("/api/admin/enrollments?id=11")
    assert enr_del.status_code == 200


def test_teacher_batch_attendance_upsert_and_student_stats(monkeypatch):
    fake_db, _ = _mock_auth(
        monkeypatch,
        role="teacher",
        tables={
            "teachers": [{"id": 2, "profile_id": "user-1"}],
            "subjects": [{"id": 100, "name": "Algorithms", "code": "CS101", "course_id": 10, "teacher_id": 2}],
            "students": [{"id": 1, "course_id": 10}],
            "attendance_sessions": [{"id": 3, "subject_id": 100}],
            "leave_applications": [],
        },
    )
    client = app.test_client()
    client.set_cookie("erp_access_token", "teacher-tok")

    t_stats = client.get("/api/teacher/stats")
    assert t_stats.status_code == 200
    assert t_stats.get_json()["counts"]["subjects"] == 1

    upd = client.put(
        "/api/teacher/attendance/3",
        json={
            "topic": "Binary Trees",
            "records": [
                {"student_id": 1, "status": "present", "remarks": ""},
                {"student_id": 2, "status": "late", "remarks": "5m"},
            ],
        },
    )
    assert upd.status_code == 200
    assert upd.get_json()["records_updated"] == 2
    payload, conflict = fake_db.instances["attendance_records"].last_upsert
    assert isinstance(payload, list) and len(payload) == 2
    assert conflict == "attendance_session_id,student_id"

    _mock_auth(
        monkeypatch,
        role="student",
        tables={
            "students": [{"id": 1, "profile_id": "user-1", "course_id": 10}],
            "attendance_records": [
                {"id": 1, "student_id": 1, "status": "present"},
                {"id": 2, "student_id": 1, "status": "absent"},
            ],
            "subjects": [{"id": 100, "course_id": 10}],
            "results": [{"id": 5, "student_id": 1}],
            "leave_applications": [{"id": 8, "applicant_id": "user-1", "status": "pending"}],
        },
    )
    s_stats = client.get("/api/student/stats")
    assert s_stats.status_code == 200
    assert s_stats.get_json()["counts"]["attendance_percentage"] == 50.0


def test_compute_grade_boundaries():
    assert compute_grade(95, 100) == "A+"
    assert compute_grade(82, 100) == "A"
    assert compute_grade(74, 100) == "B+"
    assert compute_grade(63, 100) == "B"
    assert compute_grade(55, 100) == "C"
    assert compute_grade(42, 100) == "D"
    assert compute_grade(25, 100) == "F"
    assert compute_grade(10, 0) == "N/A"


def test_student_enrolled_subjects_completed_and_running(monkeypatch):
    _mock_auth(
        monkeypatch,
        role="student",
        tables={
            "students": [{"id": 1, "profile_id": "user-1", "course_id": 1, "semester_id": 6}],
            "attendance_records": [],
            "results": [],
            "leave_applications": [],
            "enrollments": [
                {
                    "id": 10,
                    "student_id": 1,
                    "semester_id": 2,
                    "semesters": {"id": 2, "name": "1st Semester (1/1)", "semester_number": 1, "is_current": False},
                    "subjects": {"id": 101, "code": "CSE 1101", "name": "Structured Programming with C", "credits": 3},
                },
                {
                    "id": 11,
                    "student_id": 1,
                    "semester_id": 6,
                    "semesters": {"id": 6, "name": "5th Semester (3/1)", "semester_number": 5, "is_current": True},
                    "subjects": {"id": 140, "code": "CSE 3101", "name": "Data Communication Engineering", "credits": 3},
                },
            ],
        },
    )
    client = app.test_client()
    client.set_cookie("erp_access_token", "stud-tok")

    stats = client.get("/api/student/stats")
    assert stats.status_code == 200
    counts = stats.get_json()["counts"]
    assert counts["subjects"] == 2
    assert counts["running_subjects"] == 1
    assert counts["completed_subjects"] == 1

    subs = client.get("/api/student/subjects")
    assert subs.status_code == 200
    rows = subs.get_json()
    assert len(rows) == 2
    assert rows[0]["code"] == "CSE 3101"
    assert rows[0]["semester_status"] == "running"
    assert rows[1]["code"] == "CSE 1101"
    assert rows[1]["semester_status"] == "completed"


def test_security_csrf_csp_idor_and_input_validation(monkeypatch):
    _mock_auth(
        monkeypatch,
        role="teacher",
        tables={
            "teachers": [{"id": 2, "profile_id": "user-1"}],
            "subjects": [{"id": 200, "name": "Other Subject", "code": "CS999", "course_id": 10, "teacher_id": 99}],
            "attendance_sessions": [{"id": 50, "subject_id": 200}],
        },
    )
    client = app.test_client()
    client.set_cookie("erp_access_token", "teacher-tok")

    # Strict CSP & no-store headers on API
    me = client.get("/api/me")
    assert me.status_code == 200
    csp = me.headers.get("Content-Security-Policy", "")
    assert "script-src 'self' https://cdn.jsdelivr.net;" in csp
    assert "object-src 'none'" in csp
    assert me.headers.get("Cache-Control") == "no-store"

    # Cross-origin state-changing request blocked (CSRF protection)
    csrf_resp = client.put(
        "/api/me",
        json={"first_name": "Test"},
        headers={"Origin": "https://attacker.example", "Host": "localhost"},
    )
    assert csrf_resp.status_code == 403

    # Invalid avatar URL scheme rejected
    bad_av = client.put("/api/me", json={"avatar_url": "javascript:alert(1)"})
    assert bad_av.status_code == 400

    # Teacher IDOR on attendance update & result entry for unassigned subject
    idor_att = client.put(
        "/api/teacher/attendance/50",
        json={"topic": "Hijack", "records": [{"student_id": 1, "status": "present"}]},
    )
    assert idor_att.status_code == 403

    idor_res = client.post(
        "/api/teacher/results",
        json={"examination_id": 1, "student_id": 1, "subject_id": 200, "marks_obtained": 90, "max_marks": 100},
    )
    assert idor_res.status_code == 403
