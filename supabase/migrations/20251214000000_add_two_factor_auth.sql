-- Migration: Add Two-Factor Authentication Support
-- Created: 2025-12-14
-- Description: Adds columns to users table for 2FA functionality

-- Add two_factor_enabled column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- Add two_factor_secret column (for storing any additional 2FA metadata if needed)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(32);

-- Add comment for documentation
COMMENT ON COLUMN public.users.two_factor_enabled IS 'Whether two-factor authentication is enabled for this user';
COMMENT ON COLUMN public.users.two_factor_secret IS 'Optional secret or metadata for two-factor authentication (currently unused, reserved for future use)';
