"""Main Flask application for the University ERP System.

Deployed as a Vercel Python serverless function via /api/*.
Also serves static files from ../public during local development.
"""

import os
import sys

# Ensure project root is on sys.path whether invoked from root or api/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request

load_dotenv()

from api.auth_utils import require_auth  # noqa: E402
from api.helpers import USERNAME_RE, require_fields  # noqa: E402
from api.routes_admin import admin_bp  # noqa: E402
from api.routes_student import student_bp  # noqa: E402
from api.routes_teacher import teacher_bp  # noqa: E402
from api.supabase_client import (  # noqa: E402
    get_admin_client,
    get_anon_client,
    get_supabase_anon_key,
    get_supabase_url,
)

app = Flask(__name__, static_folder="../public", static_url_path="")

app.register_blueprint(admin_bp)
app.register_blueprint(teacher_bp)
app.register_blueprint(student_bp)


@app.after_request
def add_security_headers(response):
    """Attach security headers to all Flask responses (defense in depth)."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/")
def serve_index():
    """Serve the landing page when running Flask locally."""
    return app.send_static_file("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verify the Flask API and environment configuration are active."""
    configured = bool(get_supabase_url() and get_supabase_anon_key())
    return jsonify({
        "status": "ok",
        "service": "University ERP API",
        "supabase_configured": configured,
    }), 200


@app.route("/api/config", methods=["GET"])
def public_config():
    """Return public Supabase client configuration for the browser."""
    url = get_supabase_url()
    anon_key = get_supabase_anon_key()
    if not url or not anon_key:
        return jsonify({"error": "Supabase environment variables are not configured"}), 500
    return jsonify({
        "supabaseUrl": url,
        "supabaseAnonKey": anon_key,
    }), 200


@app.route("/api/auth/login", methods=["POST"])
def login_with_identifier():
    """Authenticate a user via either username or email + password."""
    data = request.get_json(silent=True) or {}
    err = require_fields(data, ["identifier", "password"])
    if err:
        return err

    identifier = str(data["identifier"]).strip().lower()
    password = str(data["password"])

    email = identifier
    if "@" not in identifier:
        if not USERNAME_RE.match(identifier):
            return jsonify({"error": "Invalid username or password"}), 401
        admin_client = get_admin_client()
        if not admin_client:
            return jsonify({"error": "Username login is not configured on the server"}), 500
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
        return jsonify({
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
        }), 200
    except Exception:
        return jsonify({"error": "Invalid username or password"}), 401


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
