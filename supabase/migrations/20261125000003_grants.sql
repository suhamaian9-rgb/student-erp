-- =============================================================================
-- Migration 003: Schema & Table Grants for Supabase PostgREST Roles
-- =============================================================================
-- Ensures authenticated and service_role have SQL table/sequence privileges
-- so PostgREST can execute queries (RLS policies still enforce row-level access
-- for authenticated users).
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
