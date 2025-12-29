-- ============================================================================
-- SUPABASE TRIGGER: Create user profile ONLY after email verification
-- ============================================================================
-- This trigger creates a user profile in public.users table ONLY when the
-- user's email is verified. This prevents unverified/spam accounts from
-- cluttering the database.
--
-- TO RUN THIS:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run" to execute
-- ============================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_verified ON auth.users;

-- Create or replace the function that handles user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create profile if email is verified
  IF NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.users (id, username, email, overall_bks, total_bets, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
      NEW.email,
      0.0,
      0,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING; -- Prevent errors if user already exists
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for when email is verified (UPDATE event)
-- This handles cases where user signs up first, then verifies email later
CREATE TRIGGER on_auth_user_verified
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL)
  EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for immediate verification (INSERT event)
-- This handles cases where email is auto-verified or verified immediately
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();

-- Verify the triggers were created successfully
SELECT
  tgname AS trigger_name,
  CASE tgenabled
    WHEN 'O' THEN 'enabled'
    WHEN 'D' THEN 'disabled'
    ELSE 'unknown'
  END AS status,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgname IN ('on_auth_user_created', 'on_auth_user_verified')
ORDER BY tgname;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ============================================================================
-- TESTING INSTRUCTIONS:
-- ============================================================================
-- 1. Register a new user via the app
-- 2. Check auth.users - should have a record with email_confirmed_at = NULL
-- 3. Check public.users - should NOT have a matching record yet
-- 4. Verify email via the link sent to user's inbox
-- 5. Check auth.users - email_confirmed_at should now have a timestamp
-- 6. Check public.users - should NOW have a matching record with same id
-- ============================================================================
