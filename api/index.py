"""Main Flask application for the University ERP System.

Deployed as a Vercel Python serverless function via /api/*.
All database and authentication calls are proxied server-side using HttpOnly
cookies so no backend provider URLs, keys, or tokens are exposed to the browser.
"""

import os
import re
import sys
from urllib.parse import urlparse

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
HOST_RE = re.compile(r"^[a-zA-Z0-9.-]+(:\d{1,5})?$")

app.register_blueprint(admin_bp)
app.register_blueprint(teacher_bp)
app.register_blueprint(student_bp)


@app.before_request
def enforce_same_origin_for_mutations():
    """Block cross-origin state-changing API requests (CSRF defense-in-depth)."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.path.startswith("/api/"):
        origin = request.headers.get("Origin", "").strip()
        referer = request.headers.get("Referer", "").strip()
        source = origin or referer
        if source:
            parsed = urlparse(source)
            if parsed.netloc and parsed.netloc != request.host:
                return jsonify({"error": "Cross-origin request blocked"}), 403


@app.after_request
def add_security_and_session_headers(response):
    """Attach security headers and persist rotated session cookies if refreshed."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
        "img-src 'self' data: https:; connect-src 'self'; object-src 'none'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
    )
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif request.path.endswith(".html"):
        response.headers["Cache-Control"] = "no-store, private"
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


def _render_error_page(code: int, headline: str, desc: str):
    """Serve static error page locally, or lightweight OopsBox HTML referencing CDN assets."""
    static_path = os.path.join(app.static_folder or "", f"{code}.html")
    if os.path.isfile(static_path):
        return app.send_static_file(f"{code}.html"), code
    html = (
        f'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1.0">'
        f'<title>{code} — University ERP</title>'
        f'<link rel="icon" type="image/svg+xml" href="/favicon.svg">'
        f'<link href="/css/error.css" rel="stylesheet"></head><body>'
        f'<main id="error-container">'
        f'<span class="geo-shape geo-ring" aria-hidden="true"></span>'
        f'<span class="geo-shape geo-square" aria-hidden="true"></span>'
        f'<span class="geo-shape geo-diamond" aria-hidden="true"></span>'
        f'<span class="geo-shape geo-dots" aria-hidden="true"></span>'
        f'<div class="error-content">'
        f'<h1 id="error-code" class="error-code">{code}</h1>'
        f'<h2 id="error-headline" class="error-badge">{headline}</h2>'
        f'<p id="error-desc" class="error-desc">{desc}</p>'
        f'<div class="error-actions"><a href="/" class="btn-oops">Back To Home</a>'
        f'<button type="button" id="btn-go-back" class="btn-oops btn-oops-secondary">Go Back</button></div>'
        f'</div></main><script src="/js/error.js" defer></script></body></html>'
    )
    return make_response(html, code)


@app.errorhandler(403)
def handle_forbidden(err):
    """Return JSON for API routes or OopsBox 403 page for browser routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Forbidden"}), 403
    return _render_error_page(
        403,
        "Restricted Area! Access denied",
        "You don't have permission to open this portal or resource. Please sign in with an authorized account.",
    )


@app.errorhandler(404)
def handle_not_found(err):
    """Return JSON for API routes or OopsBox 404 page for browser routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return _render_error_page(
        404,
        "Oops! Page not found",
        "The page you were looking for doesn't exist. You may have mistyped the address or the page may have moved.",
    )


@app.errorhandler(500)
def handle_server_error(err):
    """Return JSON for API routes or OopsBox 500 page for browser routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error"}), 500
    return _render_error_page(
        500,
        "Whoa! Something broke on our end",
        "Our servers hit an unexpected bump while processing your request. Please refresh or try again shortly.",
    )


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
    if "avatar_url" in allowed:
        av = str(allowed["avatar_url"] or "").strip()
        if av and not (av.startswith("https://") or av.startswith("/")):
            return jsonify({"error": "Invalid avatar URL"}), 400
        allowed["avatar_url"] = av
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
