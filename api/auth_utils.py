"""Authentication and role-based authorization decorators for Flask routes."""

from functools import wraps
from flask import g, jsonify, request
from api.supabase_client import get_anon_client, get_user_client

ACCESS_COOKIE = "erp_access_token"
REFRESH_COOKIE = "erp_refresh_token"


def _extract_token() -> str | None:
    """Read JWT from HttpOnly cookie first, falling back to Authorization header."""
    cookie_token = request.cookies.get(ACCESS_COOKIE, "").strip()
    if cookie_token:
        return cookie_token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        return token if token else None
    return None


def require_auth(fn):
    """Verify the session token and load the user's profile from the database."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401

        try:
            anon = get_anon_client()
            user_resp = anon.auth.get_user(token)
            user = getattr(user_resp, "user", None)
            if not user:
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
