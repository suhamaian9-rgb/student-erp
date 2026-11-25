"""Authentication and role-based authorization decorators for Flask routes."""

from functools import wraps
import os
from flask import g, jsonify, request
from api.supabase_client import get_anon_client, get_user_client

ACCESS_COOKIE = "erp_access_token"
REFRESH_COOKIE = "erp_refresh_token"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7


def is_secure_cookie() -> bool:
    """Use Secure cookies under HTTPS or Vercel deployments."""
    return bool(os.environ.get("VERCEL") or request.is_secure)


def set_auth_cookies(response, access_token: str, refresh_token: str, remember: bool = True) -> None:
    """Attach HttpOnly session cookies onto a Flask response."""
    max_age = COOKIE_MAX_AGE if remember else None
    secure = is_secure_cookie()
    for name, value in ((ACCESS_COOKIE, access_token), (REFRESH_COOKIE, refresh_token)):
        response.set_cookie(
            name,
            value,
            httponly=True,
            secure=secure,
            samesite="Lax",
            max_age=max_age,
            path="/",
        )


def _extract_token() -> tuple[str | None, bool]:
    """Read JWT from HttpOnly cookie first, falling back to Authorization header."""
    cookie_token = request.cookies.get(ACCESS_COOKIE, "").strip()
    if cookie_token:
        return cookie_token, True
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        return (token if token else None), False
    return None, False


def _resolve_user(anon, token: str | None, from_cookie: bool):
    """Validate access token or transparently rotate via refresh cookie if expired."""
    user = None
    refreshed_session = None

    if token:
        try:
            user_resp = anon.auth.get_user(token)
            user = getattr(user_resp, "user", None)
        except Exception:
            user = None

    refresh_token = request.cookies.get(REFRESH_COOKIE, "").strip()
    if not user and refresh_token and (from_cookie or not token):
        refreshed = anon.auth.refresh_session(refresh_token)
        session = getattr(refreshed, "session", None)
        refreshed_user = getattr(refreshed, "user", None) or getattr(session, "user", None)
        if session and refreshed_user:
            token = session.access_token
            user = refreshed_user
            refreshed_session = session

    return token, user, refreshed_session


def require_auth(fn):
    """Verify the session token and load the user's profile from the database."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token, from_cookie = _extract_token()
        refresh_cookie = request.cookies.get(REFRESH_COOKIE, "").strip()
        if not token and not refresh_cookie:
            return jsonify({"error": "Authentication required"}), 401

        try:
            anon = get_anon_client()
            token, user, refreshed_session = _resolve_user(anon, token, from_cookie)
            if not user or not token:
                return jsonify({"error": "Invalid or expired session"}), 401

            db = get_user_client(token)
            profile_resp = (
                db.table("profiles")
                .select("*")
                .eq("id", user.id)
                .single()
                .execute()
            )
            profile = profile_resp.data
            if not profile:
                return jsonify({"error": "User profile not found"}), 403
            if not profile.get("is_active", True):
                return jsonify({"error": "Account is deactivated"}), 403

            g.access_token = token
            g.user = user
            g.profile = profile
            g.role = profile.get("role")
            g.db = db
            g.refreshed_session = refreshed_session
        except Exception:
            return jsonify({"error": "Authentication failed"}), 401

        return fn(*args, **kwargs)

    return wrapper


def require_role(*allowed_roles: str):
    """Restrict an endpoint to specific application roles (checked from DB profile)."""
    def decorator(fn):
        @wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            if g.role not in allowed_roles:
                return jsonify({"error": "Forbidden: insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
