-- Add profile fields to users table
-- Migration: 20251214010000_add_user_profile_fields.sql
-- Purpose: Add email, full_name, phone, date_of_birth, and deleted_at columns to users table

-- Add email column (synced from auth.users)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Add full_name column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Add phone column (optional, stores phone with formatting)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Add date_of_birth column (YYYY-MM-DD format)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add deleted_at column for soft deletes
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for deleted_at for efficient filtering
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at) WHERE deleted_at IS NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Add comment for documentation
COMMENT ON COLUMN public.users.email IS 'User email address (synced from auth.users)';
COMMENT ON COLUMN public.users.full_name IS 'User full name (optional)';
COMMENT ON COLUMN public.users.phone IS 'User phone number with formatting (optional, 10-15 digits)';
COMMENT ON COLUMN public.users.date_of_birth IS 'User date of birth in YYYY-MM-DD format';
COMMENT ON COLUMN public.users.deleted_at IS 'Soft delete timestamp - when user account was deleted';
