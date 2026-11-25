"""Main Flask application for the University ERP System.

Deployed as a Vercel Python serverless function via /api/*.
All database and authentication calls are proxied server-side using HttpOnly
cookies so no backend provider URLs, keys, or tokens are exposed to the browser.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from flask import Flask, g, jsonify, make_response, request

load_dotenv()

from api.auth_utils import ACCESS_COOKIE, REFRESH_COOKIE, require_auth, set_auth_cookies  # noqa: E402
from api.helpers import USERNAME_RE, require_fields  # noqa: E402
from api.routes_admin import admin_bp  # noqa: E402
from api.routes_student import student_bp  # noqa: E402
from api.routes_teacher import teacher_bp  # noqa: E402
from api.supabase_client import get_admin_client, get_anon_client, get_user_client  # noqa: E402

app = Flask(__name__, static_folder="../public", static_url_path="")

app.register_blueprint(admin_bp)
app.register_blueprint(teacher_bp)
app.register_blueprint(student_bp)


@app.after_request
def add_security_and_session_headers(response):
    """Attach security headers and persist rotated session cookies if refreshed."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    refreshed = getattr(g, "refreshed_session", None)
    if refreshed and getattr(refreshed, "access_token", None):
        set_auth_cookies(
            response,
            refreshed.access_token,
            getattr(refreshed, "refresh_token", "") or request.cookies.get(REFRESH_COOKIE, ""),
            remember=True,
        )
    return response


@app.route("/")
def serve_index():
    """Serve the landing page when running locally."""
    return app.send_static_file("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verify the API service is online without exposing infrastructure details."""
    return jsonify({"status": "ok", "service": "University ERP"}), 200


@app.route("/api/auth/login", methods=["POST"])
def login_with_identifier():
    """Authenticate a user via username or email and set HttpOnly session cookies."""
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["identifier", "password"])
    if err:
        return err

    identifier = str(data["identifier"]).strip().lower()
    password = str(data["password"])
    remember = bool(data.get("remember", True))

    email = identifier
    if "@" not in identifier:
        if not USERNAME_RE.match(identifier):
            return jsonify({"error": "Invalid username or password"}), 401
        admin_client = get_admin_client()
        if not admin_client:
            return jsonify({"error": "Authentication service unavailable"}), 500
        try:
            prof = (
                admin_client.table("profiles")
                .select("email, is_active")
                .ilike("username", identifier)
                .limit(1)
                .execute()
                .data
            )
            if not prof or not prof[0].get("is_active", True):
                return jsonify({"error": "Invalid username or password"}), 401
            email = prof[0]["email"]
        except Exception:
            return jsonify({"error": "Invalid username or password"}), 401

    try:
        anon = get_anon_client()
        res = anon.auth.sign_in_with_password({"email": email, "password": password})
        if not res.session or not res.user:
            return jsonify({"error": "Invalid username or password"}), 401

        db = get_user_client(res.session.access_token)
        prof = db.table("profiles").select("role, is_active").eq("id", res.user.id).single().execute().data
        if not prof or not prof.get("is_active", True):
            return jsonify({"error": "Account is deactivated"}), 403

        resp = make_response(jsonify({"authenticated": True, "role": prof["role"]}), 200)
        set_auth_cookies(resp, res.session.access_token, res.session.refresh_token, remember=remember)
        return resp
    except Exception:
        return jsonify({"error": "Invalid username or password"}), 401


@app.route("/api/auth/logout", methods=["POST"])
def logout_user():
    """Clear HttpOnly session cookies."""
    resp = make_response(jsonify({"logged_out": True}), 200)
    resp.delete_cookie(ACCESS_COOKIE, path="/")
    resp.delete_cookie(REFRESH_COOKIE, path="/")
    return resp


@app.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Trigger a password reset email without exposing account existence."""
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["email"])
    if err:
        return err
    try:
        anon = get_anon_client()
        redirect_to = f"{request.host_url.rstrip('/')}/reset-password.html"
        anon.auth.reset_password_for_email(str(data["email"]).strip(), {"redirect_to": redirect_to})
    except Exception:
        pass
    return jsonify({"message": "If an account exists for that email, a reset link has been sent."}), 200


@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    """Update password using a recovery access token."""
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["access_token", "password"])
    if err:
        return err
    new_pw = str(data["password"])
    if len(new_pw) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    try:
        client = get_user_client(str(data["access_token"]).strip())
        client.auth.update_user({"password": new_pw})
        return jsonify({"updated": True}), 200
    except Exception:
        return jsonify({"error": "Invalid or expired reset link"}), 400


@app.route("/api/me", methods=["GET", "PUT"])
@require_auth
def current_user_profile():
    """Fetch or update the authenticated user's profile."""
    if request.method == "GET":
        role_record = None
        if g.role == "teacher":
            resp = (
                g.db.table("teachers")
                .select("*, departments(id, name, code)")
                .eq("profile_id", g.profile["id"])
                .maybe_single()
                .execute()
            )
            role_record = resp.data
        elif g.role == "student":
            resp = (
                g.db.table("students")
                .select("*, courses(id, name, code), academic_sessions(id, name), semesters(id, name)")
                .eq("profile_id", g.profile["id"])
                .maybe_single()
                .execute()
            )
            role_record = resp.data
        return jsonify({"profile": g.profile, "role_record": role_record}), 200

    data = request.get_json(silent=True) or {}
    allowed = {
        k: data[k]
        for k in ["first_name", "last_name", "gender", "phone", "address", "avatar_url"]
        if k in data
    }
    if not allowed:
        return jsonify({"error": "No valid profile fields provided"}), 400
    resp = g.db.table("profiles").update(allowed).eq("id", g.profile["id"]).execute()
    return jsonify(resp.data[0] if resp.data else {}), 200


@app.route("/api/notifications", methods=["GET"])
@require_auth
def get_notifications():
    """Return the authenticated user's notifications."""
    resp = (
        g.db.table("notifications")
        .select("*")
        .eq("recipient_id", g.profile["id"])
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    return jsonify(resp.data or []), 200


@app.route("/api/notifications/<int:notif_id>/read", methods=["PATCH"])
@require_auth
def mark_notification_read(notif_id: int):
    """Mark a single notification as read."""
    resp = (
        g.db.table("notifications")
        .update({"is_read": True})
        .eq("id", notif_id)
        .eq("recipient_id", g.profile["id"])
        .execute()
    )
    return jsonify(resp.data[0] if resp.data else {}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)
