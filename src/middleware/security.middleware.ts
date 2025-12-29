import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * API Key authentication middleware
 * Protects the backend when exposed via ngrok or other public tunnels
 *
 * Configure via environment variables:
 * - API_KEY: The secret API key (required if API_KEY_ENABLED=true)
 * - API_KEY_ENABLED: Set to 'true' to enable API key authentication
 *
 * Usage: Include X-API-Key header with all requests
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check if API key auth is enabled
  const isEnabled = process.env.API_KEY_ENABLED === 'true';

  if (!isEnabled) {
    return next();
  }

  // Get API key from environment
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    console.error('API_KEY_ENABLED is true but API_KEY is not set in environment variables');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'API key authentication is enabled but not configured'
    });
  }

  // Get API key from request headers
  const providedApiKey = req.headers['x-api-key'] as string;

  // Check if API key was provided
  if (!providedApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Include X-API-Key header in your request.',
      code: 'NO_API_KEY'
    });
  }

  // Validate API key
  if (providedApiKey !== validApiKey) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key',
      code: 'INVALID_API_KEY'
    });
  }

  // API key is valid, continue
  next();
};

/**
 * Global rate limiter for all API endpoints
 * Configurable via environment variables
 * Skips rate limiting for test endpoints
 */
export const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60'),
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for test endpoints
    return req.path.includes('/test');
  },
  // Disable validation warnings when behind ngrok/reverse proxy
  validate: { trustProxy: false, xForwardedForHeader: false }
});

/**
 * Stricter rate limiter for BKS calculation endpoints
 * Limits to 10 requests per minute by default
 */
export const bksRateLimiter = rateLimit({
  windowMs: 60000,
  max: parseInt(process.env.BKS_RATE_LIMIT_MAX || '10'),
  message: 'Too many BKS calculation requests',
  standardHeaders: true,
  legacyHeaders: false,
  // Disable validation warnings when behind ngrok/reverse proxy
  validate: { trustProxy: false, xForwardedForHeader: false }
});

/**
 * Sanitizes BKS calculation responses to hide internal scoring details
 * Only affects /bets/calculate endpoints
 * Removes: components, multiplier, base_score, signature
 * Allows error messages through for debugging
 */
export const sanitizeBKSResponse = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.includes('/bets/calculate') || req.path.includes('/calculate-bks')) {
    const originalJson = res.json;
    res.json = function(data: any) {
      // Allow error fields through for debugging
      if (data.error || data.message) {
        return originalJson.call(this, {
          error: data.error,
          message: data.message
        });
      }

      // Only return safe fields for successful responses
      const safe = {
        bks: data.bks || data.bks_provisional || data.bks_score,
        status: data.status,
        bet_id: data.bet_id,
        success: data.success
        // Removed: components, multiplier, base_score, signature
      };
      return originalJson.call(this, safe);
    };
  }
  next();
};
