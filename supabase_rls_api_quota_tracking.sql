-- ============================================================================
-- SUPABASE RLS: Enable Row Level Security for api_quota_tracking
-- ============================================================================
-- This table tracks backend API quota usage (system-level, not user-scoped).
-- RLS prevents PostgREST access while allowing backend service_role access.
--
-- TO RUN THIS:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run" to execute
-- ============================================================================

-- Enable RLS on api_quota_tracking table
ALTER TABLE public.api_quota_tracking ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES
-- ============================================================================
-- Since this table is system-level (tracks backend API quota, not user data),
-- we only allow service_role access. No authenticated user policies needed.
--
-- The backend uses service_role key to manage quota, which bypasses RLS.
-- This prevents any PostgREST (REST API) access from authenticated users.
-- ============================================================================

-- No user-level policies are created intentionally.
-- Only service_role (backend) can access this table.

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'api_quota_tracking';

-- Verify no policies exist (service_role bypasses RLS)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'api_quota_tracking';

-- ============================================================================
-- TESTING INSTRUCTIONS:
-- ============================================================================
-- 1. Try accessing via PostgREST as authenticated user (should fail):
--    curl -X GET '<supabase-url>/rest/v1/api_quota_tracking' \
--      -H "apikey: <anon-key>" \
--      -H "Authorization: Bearer <user-jwt>"
--    Expected: 403 Forbidden or empty result
--
-- 2. Backend service_role access should work (bypasses RLS):
--    const { data } = await supabase
--      .from('api_quota_tracking')
--      .select('*')
--    Expected: Success (when using service_role key)
-- ============================================================================
