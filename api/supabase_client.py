"""Supabase client factories for the College ERP backend.

Provides:
- Anon client: for validating user JWTs via Supabase Auth.
- User-scoped client: attaches the caller's Bearer JWT so PostgreSQL RLS
  policies enforce row-level access control automatically.
- Admin client (optional): uses SUPABASE_SERVICE_ROLE_KEY strictly on the
  server for creating/deleting Auth users from Admin endpoints.
"""

import os
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions


def get_supabase_url() -> str:
    return os.environ.get("SUPABASE_URL", "").strip()


def get_supabase_anon_key() -> str:
    return os.environ.get("SUPABASE_ANON_KEY", "").strip()


def get_supabase_service_key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def get_anon_client() -> Client:
    """Return a basic Supabase client using the public anon key."""
    url = get_supabase_url()
    key = get_supabase_anon_key()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be configured")
    return create_client(url, key)


def get_user_client(access_token: str) -> Client:
    """Return a Supabase client authenticated as the requesting user (enforces RLS)."""
    url = get_supabase_url()
    key = get_supabase_anon_key()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be configured")
    options = SyncClientOptions(
        headers={"Authorization": f"Bearer {access_token}"}
    )
    return create_client(url, key, options=options)


def get_admin_client() -> Client | None:
    """Return a server-only Supabase client with service_role privileges, if configured."""
    url = get_supabase_url()
    service_key = get_supabase_service_key()
    if not url or not service_key:
        return None
    return create_client(url, service_key)
