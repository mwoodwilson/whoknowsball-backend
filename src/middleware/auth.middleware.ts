import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username?: string;
        email_verified: boolean;
      };
    }
  }
}

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
 * Authentication middleware
 *
 * Verifies JWT tokens from Supabase Auth and extracts user information.
 * Supports auto-refresh if access token expired but refresh token is valid.
 * Checks for suspended accounts (unverified > 24 hours).
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization token provided',
        code: 'NO_TOKEN'
      });
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization header format. Expected: Bearer <token>',
        code: 'INVALID_FORMAT'
      });
    }

    const token = parts[1];
    const db = getSupabase();

    // Verify token with Supabase
    const { data: { user }, error } = await db.auth.getUser(token);

    if (error || !user) {
      // Check if refresh token was provided as fallback
      const refreshToken = req.headers['x-refresh-token'] as string;

      if (refreshToken) {
        // Try to refresh the session
        const { data: refreshData, error: refreshError } = await db.auth.refreshSession({
          refresh_token: refreshToken
        });

        if (refreshError || !refreshData.session || !refreshData.user) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token expired and refresh failed',
            code: 'TOKEN_EXPIRED'
          });
        }

        // Set the new tokens in response headers
        res.setHeader('X-New-Access-Token', refreshData.session.access_token);
        res.setHeader('X-New-Refresh-Token', refreshData.session.refresh_token);
        res.setHeader('X-Token-Refreshed', 'true');

        // Use the refreshed user
        req.user = {
          id: refreshData.user.id,
          email: refreshData.user.email!,
          email_verified: refreshData.user.email_confirmed_at !== null
        };
      } else {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }
    } else {
      // Token is valid
      req.user = {
        id: user.id,
        email: user.email!,
        email_verified: user.email_confirmed_at !== null
      };
    }

    // Get user profile to check for suspension and deletion
    const { data: userProfile, error: profileError } = await db
      .from('users')
      .select('username, created_at, deleted_at')
      .eq('id', req.user!.id)
      .single();

    if (profileError || !userProfile) {
      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Failed to retrieve user profile',
        code: 'PROFILE_ERROR'
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

    // Add username to request user
    req.user!.username = userProfile.username;

    // Check if account is suspended (unverified > 24 hours)
    const createdAt = new Date(userProfile.created_at);
    const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    if (!req.user!.email_verified && hoursSinceCreation > 24) {
      return res.status(403).json({
        error: 'Account suspended',
        message: 'Your account has been suspended due to unverified email. Please verify your email or contact support.',
        code: 'ACCOUNT_SUSPENDED',
        suspension_reason: 'unverified_email',
        created_at: userProfile.created_at
      });
    }

    // User is authenticated and not suspended
    next();

  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional authentication middleware
 *
 * Similar to authenticate() but doesn't require auth.
 * If token is provided and valid, sets req.user. Otherwise continues without user.
 * Useful for endpoints that work with or without authentication.
 */
export async function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      // No token provided, continue without user
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      // Invalid format, continue without user
      return next();
    }

    const token = parts[1];
    const db = getSupabase();

    // Verify token
    const { data: { user }, error } = await db.auth.getUser(token);

    if (!error && user) {
      // Get user profile
      const { data: userProfile } = await db
        .from('users')
        .select('username, created_at')
        .eq('id', user.id)
        .single();

      if (userProfile) {
        req.user = {
          id: user.id,
          email: user.email!,
          username: userProfile.username,
          email_verified: user.email_confirmed_at !== null
        };
      }
    }

    next();

  } catch (error) {
    console.error('Optional authentication error:', error);
    // Continue without user even if error occurs
    next();
  }
}

/**
 * Admin authentication middleware
 *
 * Requires authentication AND checks if user has admin role.
 */
export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  // First, authenticate the user
  await authenticate(req, res, async () => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'NO_AUTH'
        });
      }

      const db = getSupabase();

      // Check if user is admin
      const { data: { user }, error } = await db.auth.admin.getUserById(req.user.id);

      if (error || !user) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied',
          code: 'NOT_ADMIN'
        });
      }

      // Check user metadata for admin role
      const isAdmin = user.user_metadata?.role === 'admin' ||
                      user.app_metadata?.role === 'admin';

      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Admin access required',
          code: 'NOT_ADMIN'
        });
      }

      next();

    } catch (error) {
      console.error('Admin authentication error:', error);
      res.status(500).json({
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'AUTH_ERROR'
      });
    }
  });
}
