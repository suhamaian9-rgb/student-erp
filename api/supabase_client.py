"""Supabase client factories for the University ERP backend.

Provides:
- Anon client (cached): for validating user JWTs via Supabase Auth.
- User-scoped client: attaches the caller's Bearer JWT so PostgreSQL RLS
  policies enforce row-level access control automatically.
- Admin client (optional, cached): uses SUPABASE_SERVICE_ROLE_KEY strictly on
  the server for creating/deleting Auth users and username lookup.
"""

from functools import lru_cache
import os
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions


def get_supabase_url() -> str:
    return os.environ.get("SUPABASE_URL", "").strip()


def get_supabase_anon_key() -> str:
    return os.environ.get("SUPABASE_ANON_KEY", "").strip()


def get_supabase_service_key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()


@lru_cache(maxsize=4)
def _cached_client(url: str, key: str) -> Client:
    """Reuse stateless Supabase clients across requests to preserve HTTP pooling."""
    options = SyncClientOptions(auto_refresh_token=False, persist_session=False)
    return create_client(url, key, options=options)


def get_anon_client() -> Client:
    """Return a cached Supabase client using the public anon key."""
    url = get_supabase_url()
    key = get_supabase_anon_key()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be configured")
    return _cached_client(url, key)


def get_user_client(access_token: str) -> Client:
    """Return a Supabase client authenticated as the requesting user (enforces RLS)."""
    url = get_supabase_url()
    key = get_supabase_anon_key()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be configured")
    options = SyncClientOptions(
        auto_refresh_token=False,
        persist_session=False,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    return create_client(url, key, options=options)


def get_admin_client() -> Client | None:
    """Return a cached server-only Supabase client with service_role privileges, if configured."""
    url = get_supabase_url()
    service_key = get_supabase_service_key()
    if not url or not service_key:
        return None
    return _cached_client(url, service_key)
