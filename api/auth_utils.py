"""Authentication and role-based authorization decorators for Flask routes."""

from functools import wraps
from flask import g, jsonify, request
from api.supabase_client import get_anon_client, get_user_client


def _extract_bearer_token() -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        return token if token else None
    return None


def require_auth(fn):
    """Verify the Supabase JWT and load the user's profile from the database."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_bearer_token()
        if not token:
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        try:
            anon = get_anon_client()
            user_resp = anon.auth.get_user(token)
            user = getattr(user_resp, "user", None)
            if not user:
                return jsonify({"error": "Invalid or expired session token"}), 401

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

            # Attach authenticated context to Flask's request-local `g`
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
