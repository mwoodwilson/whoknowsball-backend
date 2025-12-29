import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../../../middleware/auth.middleware';
import { redisClient, setWithExpiry, getCache, deleteCache } from '../../../config/redis';
import { generate2FACode, validate2FACodeFormat } from '../../../utils/twoFactorAuth';
import { emailService } from '../../../services/EmailService';

const router = Router();

// Initialize Supabase client
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
 * Password validation helper
 */
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 uppercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 number' };
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 symbol' };
  }

  return { valid: true };
}

/**
 * POST /api/v1/auth/register
 * Register a new user with email, password, and username
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    // Validate required fields
    if (!email || !password || !username) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'email, password, and username are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email',
        message: 'Please provide a valid email address'
      });
    }

    // Validate username
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        error: 'Invalid username',
        message: 'Username must be between 3 and 50 characters'
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Invalid password',
        message: passwordValidation.message
      });
    }

    const db = getSupabase();

    // Check if username already exists (excluding deleted accounts)
    const { data: existingUser } = await db
      .from('users')
      .select('username')
      .eq('username', username)
      .is('deleted_at', null)
      .single();

    if (existingUser) {
      return res.status(409).json({
        error: 'Username taken',
        message: 'This username is already in use'
      });
    }

    // Create auth user
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email verification
      user_metadata: {
        username
      }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return res.status(409).json({
          error: 'Email already exists',
          message: 'An account with this email already exists'
        });
      }

      console.error('Auth creation error:', authError);
      return res.status(500).json({
        error: 'Registration failed',
        message: authError.message
      });
    }

    if (!authData.user) {
      return res.status(500).json({
        error: 'Registration failed',
        message: 'Failed to create user account'
      });
    }

    // Create public.users entry
    const { error: userError } = await db
      .from('users')
      .insert({
        id: authData.user.id,
        username,
        email,
        overall_bks: 0,
        total_bets: 0,
        total_won: 0,
        total_lost: 0,
        total_parlays: 0
      });

    if (userError) {
      console.error('User profile creation error:', userError);
      // Try to clean up auth user if profile creation fails
      await db.auth.admin.deleteUser(authData.user.id);

      return res.status(500).json({
        error: 'Registration failed',
        message: 'Failed to create user profile'
      });
    }

    // Generate session tokens
    const { data: sessionData, error: sessionError } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (sessionError || !sessionData.session) {
      // User created but couldn't create session - they can still login later
      return res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        user_id: authData.user.id,
        username,
        email_verification_required: true
      });
    }

    // Return success with tokens
    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user_id: authData.user.id,
      username,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in || 3600,
      refresh_expires_in: 2592000, // 30 days
      email_verification_required: true
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticate user with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'email and password are required'
      });
    }

    const db = getSupabase();

    // Authenticate with Supabase
    const { data: sessionData, error: authError } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !sessionData.session || !sessionData.user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Get user profile
    const { data: userProfile, error: profileError } = await db
      .from('users')
      .select('id, username, created_at, deleted_at')
      .eq('id', sessionData.user.id)
      .single();

    if (profileError || !userProfile) {
      return res.status(500).json({
        error: 'Login failed',
        message: 'Failed to retrieve user profile'
      });
    }

    // Check if account is deleted
    if (userProfile.deleted_at !== null) {
      return res.status(403).json({
        error: 'Account deleted',
        message: 'This account has been deleted and cannot be accessed.',
        code: 'ACCOUNT_DELETED'
      });
    }

    // Check if account is suspended (unverified > 24 hours)
    const createdAt = new Date(userProfile.created_at);
    const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    const isVerified = sessionData.user.email_confirmed_at !== null;

    if (!isVerified && hoursSinceCreation > 24) {
      // Account is suspended
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended due to unverified email. Please contact support.',
        suspension_reason: 'unverified_email',
        created_at: userProfile.created_at
      });
    }

    // Return success with tokens
    res.json({
      success: true,
      user_id: sessionData.user.id,
      username: userProfile.username,
      email: sessionData.user.email,
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in || 3600,
      refresh_expires_in: 2592000, // 30 days
      email_verified: isVerified
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/oauth
 * Get OAuth redirect URL for mobile app
 */
router.post('/oauth', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    // Validate provider
    if (!provider || !['google', 'apple'].includes(provider)) {
      return res.status(400).json({
        error: 'Invalid provider',
        message: 'provider must be either "google" or "apple"'
      });
    }

    const db = getSupabase();

    // Get OAuth URL from Supabase
    const { data, error } = await db.auth.signInWithOAuth({
      provider: provider as 'google' | 'apple',
      options: {
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/auth/callback`
      }
    });

    if (error) {
      console.error('OAuth URL generation error:', error);
      return res.status(500).json({
        error: 'OAuth failed',
        message: error.message
      });
    }

    res.json({
      success: true,
      provider,
      url: data.url
    });

  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).json({
      error: 'OAuth failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Missing refresh token',
        message: 'refresh_token is required'
      });
    }

    const db = getSupabase();

    // Refresh session
    const { data, error } = await db.auth.refreshSession({
      refresh_token
    });

    if (error || !data.session) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Refresh token is invalid or expired'
      });
    }

    res.json({
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in || 3600
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user and revoke refresh token
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Missing refresh token',
        message: 'refresh_token is required'
      });
    }

    const db = getSupabase();

    // Sign out - this revokes the refresh token
    const { error } = await db.auth.admin.signOut(refresh_token);

    if (error) {
      console.error('Logout error:', error);
      // Continue even if sign out fails - token might already be invalid
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/auth/verify
 * Handle email verification callback
 */
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const { token, type } = req.query;

    if (!token || type !== 'email') {
      return res.status(400).json({
        error: 'Invalid verification link',
        message: 'This verification link is invalid or has expired'
      });
    }

    // Use public client with anon key for email verification
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

    const { createClient } = await import('@supabase/supabase-js');
    const publicClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify email with token using the proper client method
    const { data, error } = await publicClient.auth.verifyOtp({
      token_hash: token as string,
      type: 'signup'
    });

    if (error) {
      console.error('Email verification error:', error);
      return res.status(400).json({
        error: 'Verification failed',
        message: error.message || 'This verification link is invalid or has expired'
      });
    }

    return res.json({
      success: true,
      message: 'Email verified successfully!',
      user: data.user
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Verification failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * PUT /api/v1/auth/password
 * Change user's password
 * Auth required
 */
router.put('/password', authenticate, async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;

    // Validate required fields
    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'current_password and new_password are required'
      });
    }

    // Validate new password
    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Password must be at least 8 characters long'
      });
    }

    if (!/[A-Za-z]/.test(new_password)) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Password must contain at least one letter'
      });
    }

    if (!/[0-9]/.test(new_password)) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Password must contain at least one number'
      });
    }

    const db = getSupabase();
    const userId = req.user!.id;
    const email = req.user!.email;

    // Verify current password by attempting to sign in
    const { error: verifyError } = await db.auth.signInWithPassword({
      email,
      password: current_password
    });

    if (verifyError) {
      return res.status(401).json({
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }

    // Update password using admin API
    const { error: updateError } = await db.auth.admin.updateUserById(userId, {
      password: new_password
    });

    if (updateError) {
      console.error('Password update error:', updateError);
      return res.status(500).json({
        error: 'Password update failed',
        message: updateError.message
      });
    }

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Password change failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/2fa/enable
 * Enable two-factor authentication for user
 * Auth required
 */
router.post('/2fa/enable', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const email = req.user!.email;

    const db = getSupabase();

    // Check if 2FA is already enabled
    const { data: userData, error: fetchError } = await db
      .from('users')
      .select('two_factor_enabled')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({
        error: '2FA enable failed',
        message: 'Failed to fetch user data'
      });
    }

    if (userData?.two_factor_enabled) {
      return res.status(400).json({
        error: '2FA already enabled',
        message: 'Two-factor authentication is already enabled for this account'
      });
    }

    // Generate 6-digit code
    const code = generate2FACode();

    // Store code in Redis with 5-minute TTL (300 seconds)
    const redisKey = `2fa:${userId}`;
    await setWithExpiry(redisKey, code, 300);

    // Send code to user's email
    try {
      await emailService.send2FACode(email, code);
    } catch (emailError) {
      console.error('Error sending 2FA email:', emailError);
      // Clean up Redis key if email fails
      await deleteCache(redisKey);
      return res.status(500).json({
        error: 'Email send failed',
        message: 'Failed to send verification code. Please try again.'
      });
    }

    // Update two_factor_enabled in database
    const { error: updateError } = await db
      .from('users')
      .update({ two_factor_enabled: true })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user 2FA status:', updateError);
      await deleteCache(redisKey);
      return res.status(500).json({
        error: '2FA enable failed',
        message: 'Failed to enable two-factor authentication'
      });
    }

    res.json({
      success: true,
      enabled: true,
      message: 'Verification code sent to email'
    });

  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(500).json({
      error: '2FA enable failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/2fa/disable
 * Disable two-factor authentication for user
 * Auth required
 */
router.post('/2fa/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const userId = req.user!.id;

    // Validate code format
    if (!code || !validate2FACodeFormat(code)) {
      return res.status(400).json({
        error: 'Invalid code',
        message: 'Verification code must be 6 digits'
      });
    }

    const db = getSupabase();

    // Check if 2FA is enabled
    const { data: userData, error: fetchError } = await db
      .from('users')
      .select('two_factor_enabled')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({
        error: '2FA disable failed',
        message: 'Failed to fetch user data'
      });
    }

    if (!userData?.two_factor_enabled) {
      return res.status(400).json({
        error: '2FA not enabled',
        message: 'Two-factor authentication is not enabled for this account'
      });
    }

    // Verify code from Redis
    const redisKey = `2fa:${userId}`;
    const storedCode = await getCache<string>(redisKey);

    if (!storedCode) {
      return res.status(400).json({
        error: 'Code expired',
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    if (storedCode !== code) {
      return res.status(401).json({
        error: 'Invalid code',
        message: 'Verification code is incorrect'
      });
    }

    // Disable 2FA in database
    const { error: updateError } = await db
      .from('users')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error disabling 2FA:', updateError);
      return res.status(500).json({
        error: '2FA disable failed',
        message: 'Failed to disable two-factor authentication'
      });
    }

    // Delete Redis key
    await deleteCache(redisKey);

    res.json({
      success: true,
      enabled: false,
      message: 'Two-factor authentication disabled successfully'
    });

  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({
      error: '2FA disable failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/auth/2fa/verify
 * Verify 2FA code during login
 * No auth required (used during login flow)
 */
router.post('/2fa/verify', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    // Validate required fields
    if (!email || !code) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'email and code are required'
      });
    }

    // Validate code format
    if (!validate2FACodeFormat(code)) {
      return res.status(400).json({
        error: 'Invalid code',
        message: 'Verification code must be 6 digits'
      });
    }

    const db = getSupabase();

    // Get user by email
    const { data: { users }, error: userError } = await db.auth.admin.listUsers();

    if (userError) {
      console.error('Error fetching users:', userError);
      return res.status(500).json({
        error: 'Verification failed',
        message: 'Failed to verify code'
      });
    }

    const user = users?.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'No user found with this email'
      });
    }

    // Verify code from Redis
    const redisKey = `2fa:${user.id}`;
    const storedCode = await getCache<string>(redisKey);

    if (!storedCode) {
      return res.status(400).json({
        error: 'Code expired',
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    if (storedCode !== code) {
      return res.status(401).json({
        error: 'Invalid code',
        message: 'Verification code is incorrect'
      });
    }

    // Delete Redis key after successful verification
    await deleteCache(redisKey);

    // Generate session token for the user
    const { data: sessionData, error: sessionError } = await db.auth.admin.createSession({
      user_id: user.id
    });

    if (sessionError || !sessionData) {
      console.error('Error creating session:', sessionError);
      return res.status(500).json({
        error: 'Session creation failed',
        message: 'Failed to create session after verification'
      });
    }

    // Get user profile
    const { data: userProfile } = await db
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single();

    res.json({
      success: true,
      verified: true,
      session: {
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        expires_at: sessionData.expires_at,
        user: {
          id: user.id,
          email: user.email,
          username: userProfile?.username
        }
      }
    });

  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({
      error: '2FA verification failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
