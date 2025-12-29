import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Initialize Supabase client (lazy loaded)
let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

/**
 * DELETE /api/v1/users/account
 *
 * Soft-deletes a user account by anonymizing PII and setting deleted_at timestamp.
 * This is irreversible - user must contact support to restore account.
 *
 * Auth: Required
 * Body: { confirmation: string } - Must exactly equal "DELETE" (case-sensitive)
 *
 * Actions on deletion:
 * 1. Anonymize PII:
 *    - email → 'deleted_{user_id}@deleted.local'
 *    - full_name → NULL
 *    - phone → NULL
 *    - date_of_birth → NULL
 *    - username → 'deleted_{short_id}' (first 8 chars of user_id)
 * 2. Set deleted_at = NOW()
 * 3. Revoke Supabase auth session (sign out user)
 * 4. Do NOT delete bets (keep for data integrity)
 *
 * Response:
 * {
 *   deleted: true,
 *   message: "Account successfully deleted"
 * }
 *
 * Errors:
 * - 400: Invalid or missing confirmation
 * - 401: Not authenticated
 * - 404: User not found or already deleted
 * - 500: Server error
 */
router.delete('/account', authenticate, async (req: Request, res: Response) => {
  try {
    const { confirmation } = req.body;
    const userId = req.user!.id;

    // Validate confirmation string
    if (!confirmation) {
      return res.status(400).json({
        error: 'Missing confirmation',
        message: 'Please provide confirmation string in request body'
      });
    }

    if (confirmation !== 'DELETE') {
      return res.status(400).json({
        error: 'Invalid confirmation',
        message: 'Confirmation must exactly equal "DELETE" (case-sensitive)'
      });
    }

    const db = getSupabase();

    // Check if user exists and is not already deleted
    const { data: existingUser, error: fetchError } = await db
      .from('users')
      .select('id, username, deleted_at')
      .eq('id', userId)
      .single();

    if (fetchError || !existingUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account does not exist'
      });
    }

    if (existingUser.deleted_at !== null) {
      return res.status(404).json({
        error: 'Account already deleted',
        message: 'This account has already been deleted'
      });
    }

    // Generate anonymized data
    const shortId = userId.substring(0, 8);
    const anonymizedData = {
      email: `deleted_${userId}@deleted.local`,
      username: `deleted_${shortId}`,
      full_name: null,
      phone: null,
      date_of_birth: null,
      deleted_at: new Date().toISOString()
    };

    // Update user record with anonymized data
    const { error: updateError } = await db
      .from('users')
      .update(anonymizedData)
      .eq('id', userId);

    if (updateError) {
      console.error('[Users] Account deletion - update error:', updateError);
      return res.status(500).json({
        error: 'Deletion failed',
        message: 'Failed to anonymize user data'
      });
    }

    // Revoke all auth sessions for this user
    try {
      // Get the user's current session token from the request
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        // Sign out using the current token
        await db.auth.admin.signOut(token);
      }
    } catch (signOutError) {
      // Log but don't fail the deletion if sign out fails
      console.error('[Users] Account deletion - sign out error:', signOutError);
    }

    console.log(`[Users] Account deleted successfully: ${userId} (was: ${existingUser.username})`);

    res.json({
      deleted: true,
      message: 'Account successfully deleted'
    });

  } catch (error) {
    console.error('[Users] Account deletion error:', error);
    res.status(500).json({
      error: 'Deletion failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/users/profile
 * Get current user's profile
 *
 * Auth: Required (via Bearer token)
 * Response: {
 *   id, username, email, full_name, phone, date_of_birth,
 *   overall_bks, total_bets, created_at
 * }
 */
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = getSupabase();

    // Fetch user profile with all fields (exclude deleted accounts)
    const { data: profile, error } = await db
      .from('users')
      .select('id, username, email, full_name, phone, date_of_birth, overall_bks, total_bets, created_at')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return res.status(500).json({
        error: 'Failed to fetch profile',
        message: error.message,
        code: 'PROFILE_FETCH_ERROR'
      });
    }

    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
        message: 'User profile does not exist',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'PROFILE_ERROR'
    });
  }
});

/**
 * PUT /api/v1/users/profile
 * Update current user's profile
 *
 * Auth: Required (via Bearer token)
 * Body: { full_name?: string, phone?: string, date_of_birth?: string }
 * Validation:
 *  - phone: Must be 10-15 digits if provided
 *  - date_of_birth: Must be in the past, format YYYY-MM-DD
 *  - full_name: Max 255 characters
 * Response: Updated profile object
 */
router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { full_name, phone, date_of_birth } = req.body;
    const db = getSupabase();

    // Validate at least one field is provided
    if (full_name === undefined && phone === undefined && date_of_birth === undefined) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'At least one field must be provided (full_name, phone, or date_of_birth)',
        code: 'NO_FIELDS_PROVIDED'
      });
    }

    // Build update object with only provided fields
    const updates: {
      full_name?: string | null;
      phone?: string | null;
      date_of_birth?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString()
    };

    // Validate and add full_name
    if (full_name !== undefined) {
      if (full_name === null || full_name === '') {
        // Allow clearing the field
        updates.full_name = null;
      } else if (typeof full_name !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'full_name must be a string',
          code: 'INVALID_FULL_NAME'
        });
      } else if (full_name.length > 255) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'full_name must be 255 characters or less',
          code: 'FULL_NAME_TOO_LONG'
        });
      } else {
        updates.full_name = full_name.trim();
      }
    }

    // Validate and add phone
    if (phone !== undefined) {
      if (phone === null || phone === '') {
        // Allow clearing the field
        updates.phone = null;
      } else if (typeof phone !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'phone must be a string',
          code: 'INVALID_PHONE'
        });
      } else {
        // Remove non-digit characters for validation
        const phoneDigits = phone.replace(/\D/g, '');

        if (phoneDigits.length < 10 || phoneDigits.length > 15) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'phone must contain 10-15 digits',
            code: 'INVALID_PHONE_LENGTH'
          });
        }

        updates.phone = phone.trim();
      }
    }

    // Validate and add date_of_birth
    if (date_of_birth !== undefined) {
      if (date_of_birth === null || date_of_birth === '') {
        // Allow clearing the field
        updates.date_of_birth = null;
      } else if (typeof date_of_birth !== 'string') {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'date_of_birth must be a string in YYYY-MM-DD format',
          code: 'INVALID_DATE_FORMAT'
        });
      } else {
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date_of_birth)) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'date_of_birth must be in YYYY-MM-DD format',
            code: 'INVALID_DATE_FORMAT'
          });
        }

        // Validate date is in the past
        const dob = new Date(date_of_birth);
        const now = new Date();

        if (isNaN(dob.getTime())) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'date_of_birth must be a valid date',
            code: 'INVALID_DATE'
          });
        }

        if (dob >= now) {
          return res.status(400).json({
            error: 'Validation Error',
            message: 'date_of_birth must be in the past',
            code: 'DATE_IN_FUTURE'
          });
        }

        updates.date_of_birth = date_of_birth;
      }
    }

    // Update the profile (only if not deleted)
    const { data: updatedProfile, error } = await db
      .from('users')
      .update(updates)
      .eq('id', userId)
      .is('deleted_at', null)
      .select('id, username, email, full_name, phone, date_of_birth, overall_bks, total_bets, created_at, updated_at')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({
        error: 'Failed to update profile',
        message: error.message,
        code: 'PROFILE_UPDATE_ERROR'
      });
    }

    if (!updatedProfile) {
      return res.status(404).json({
        error: 'Profile not found',
        message: 'User profile does not exist',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      profile: updatedProfile
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'PROFILE_ERROR'
    });
  }
});

/**
 * PUT /api/v1/users/email
 * Update current user's email address
 *
 * Auth: Required (via Bearer token)
 * Body: { new_email: string }
 * Validation: Valid email format, not already in use
 * Implementation: Update email in Supabase Auth (triggers verification)
 * Response: { success: true, message: "Verification email sent to new address" }
 */
router.put('/email', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { new_email } = req.body;
    const db = getSupabase();

    // Validate new_email is provided
    if (!new_email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'new_email is required',
        code: 'NO_EMAIL_PROVIDED'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(new_email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid email format',
        code: 'INVALID_EMAIL_FORMAT'
      });
    }

    // Normalize email (lowercase)
    const normalizedEmail = new_email.toLowerCase().trim();

    // Check if email is already in use by another user
    const { data: existingUser, error: checkError } = await db
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .neq('id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned (expected)
      console.error('Error checking email availability:', checkError);
      return res.status(500).json({
        error: 'Failed to check email availability',
        message: checkError.message,
        code: 'EMAIL_CHECK_ERROR'
      });
    }

    if (existingUser) {
      return res.status(409).json({
        error: 'Email already in use',
        message: 'This email address is already associated with another account',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Update email in Supabase Auth
    // This will trigger a verification email to the new address
    const { data: authUser, error: authError } = await db.auth.admin.updateUserById(
      userId,
      { email: normalizedEmail }
    );

    if (authError) {
      console.error('Error updating email in Supabase Auth:', authError);
      return res.status(500).json({
        error: 'Failed to update email',
        message: authError.message,
        code: 'AUTH_UPDATE_ERROR'
      });
    }

    // Update email in users table (only if not deleted)
    const { error: dbError } = await db
      .from('users')
      .update({
        email: normalizedEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .is('deleted_at', null);

    if (dbError) {
      console.error('Error updating email in users table:', dbError);
      // Note: Auth email is already updated at this point
      // Consider this a non-critical error since auth is the source of truth
      console.warn('Users table update failed, but auth email was updated successfully');
    }

    res.json({
      success: true,
      message: 'Verification email sent to new address. Please check your inbox to confirm the change.'
    });

  } catch (error) {
    console.error('Email update error:', error);
    res.status(500).json({
      error: 'Failed to update email',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'EMAIL_UPDATE_ERROR'
    });
  }
});

export default router;
