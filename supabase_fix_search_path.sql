-- ============================================================================
-- SUPABASE FIX: Set explicit search_path for update_updated_at_column
-- ============================================================================
-- This fixes the "Function Search Path Mutable" security warning by:
-- 1. Adding an explicit SET search_path = public, pg_temp
-- 2. Using fully qualified function names (pg_catalog.timezone, pg_catalog.now)
--
-- This prevents security issues where the function could resolve objects
-- from unexpected schemas based on the caller's session search_path.
--
-- TO RUN THIS:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run" to execute
-- ============================================================================

-- Drop and recreate the function with explicit search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Use fully qualified function names for security
  NEW.updated_at = pg_catalog.timezone('utc', pg_catalog.now());
  RETURN NEW;
END;
$$;

-- Add comment documenting the security fix
COMMENT ON FUNCTION public.update_updated_at_column() IS
'Auto-updates the updated_at column to current UTC timestamp on row update.
Uses explicit search_path and fully qualified function names for security.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify the function has the correct search_path set
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'update_updated_at_column';

-- ============================================================================
-- TESTING INSTRUCTIONS:
-- ============================================================================
-- 1. Update a row in the users table and verify updated_at is set correctly:
--    UPDATE public.users SET username = username WHERE id = '<some-id>';
--    SELECT updated_at FROM public.users WHERE id = '<some-id>';
--
-- 2. The updated_at should be updated to the current UTC timestamp
--
-- 3. Test with different search_path settings to ensure consistent behavior:
--    SET search_path = pg_temp, public;
--    -- repeat update test above - should work identically
-- ============================================================================
