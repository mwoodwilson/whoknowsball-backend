import { Router, Request, Response } from 'express';
import { createTransport } from 'nodemailer';
import { authenticate } from '../../middleware/auth.middleware';
import { redisClient } from '../../config/redis';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * Email Transporter Configuration
 *
 * Uses nodemailer with Gmail SMTP or SendGrid depending on environment variables.
 * Priority:
 * 1. SendGrid (if SENDGRID_API_KEY is set)
 * 2. Gmail SMTP (if GMAIL_USER and GMAIL_APP_PASSWORD are set)
 */
function getEmailTransporter() {
  // Option 1: SendGrid
  if (process.env.SENDGRID_API_KEY) {
    return createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }

  // Option 2: Gmail SMTP
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }

  throw new Error('Email service not configured. Please set SENDGRID_API_KEY or GMAIL_USER/GMAIL_APP_PASSWORD in .env');
}

/**
 * Rate Limiting with Redis
 *
 * Limits users to 5 support requests per hour
 *
 * @param userId - User ID to check rate limit for
 * @returns Object with allowed (boolean) and remaining count
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const key = `support:ratelimit:${userId}`;
  const maxRequests = 5;
  const windowSeconds = 3600; // 1 hour

  try {
    // Get current count
    const current = await redisClient.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= maxRequests) {
      // Get TTL to know when it resets
      const ttl = await redisClient.ttl(key);
      const resetAt = new Date(Date.now() + ttl * 1000);

      return {
        allowed: false,
        remaining: 0,
        resetAt
      };
    }

    // Increment counter
    if (count === 0) {
      // First request in window, set with expiry
      await redisClient.setEx(key, windowSeconds, '1');
    } else {
      // Increment existing counter
      await redisClient.incr(key);
    }

    const ttl = await redisClient.ttl(key);
    const resetAt = new Date(Date.now() + ttl * 1000);

    return {
      allowed: true,
      remaining: maxRequests - (count + 1),
      resetAt
    };
  } catch (error) {
    console.error('[Support] Rate limit check failed:', error);
    // On Redis error, allow the request (fail open)
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: new Date(Date.now() + windowSeconds * 1000)
    };
  }
}

/**
 * Validate subject
 */
const VALID_SUBJECTS = [
  'Bug Report',
  'Feature Request',
  'Account Issue',
  'General Question',
  'Other'
] as const;

type SupportSubject = typeof VALID_SUBJECTS[number];

function isValidSubject(subject: string): subject is SupportSubject {
  return VALID_SUBJECTS.includes(subject as SupportSubject);
}

/**
 * POST /api/v1/support/contact
 *
 * Submit a support request
 *
 * Auth: Required
 * Rate Limit: 5 requests per hour per user
 *
 * Body:
 * - subject: "Bug Report" | "Feature Request" | "Account Issue" | "General Question" | "Other"
 * - message: string (10-2000 characters)
 *
 * Response:
 * - success: boolean
 * - ticket_id: string (UUID)
 * - message: string
 */
router.post('/contact', authenticate, async (req: Request, res: Response) => {
  try {
    const { subject, message } = req.body;
    const user = req.user!; // Guaranteed by authenticate middleware

    // Validation: Required fields
    if (!subject || !message) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Both subject and message are required',
        required_fields: ['subject', 'message']
      });
    }

    // Validation: Subject
    if (!isValidSubject(subject)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid subject',
        valid_subjects: VALID_SUBJECTS
      });
    }

    // Validation: Message length
    if (typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Message must be at least 10 characters long'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Message must not exceed 2000 characters',
        current_length: message.length,
        max_length: 2000
      });
    }

    // Rate Limiting
    const rateLimit = await checkRateLimit(user.id);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', '5');
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toISOString());

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'You have exceeded the maximum number of support requests (5 per hour)',
        retry_after: rateLimit.resetAt.toISOString(),
        limit: 5,
        window: '1 hour'
      });
    }

    // Generate ticket ID
    const ticket_id = uuidv4();
    const timestamp = new Date().toISOString();
    const readableDate = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // Prepare email
    const emailSubject = `[WhoKnowsBall Support] ${subject}`;
    const emailBody = `From: ${user.email} (${user.username})
User ID: ${user.id}
Date: ${readableDate}
Subject: ${subject}
Ticket ID: ${ticket_id}

Message:
${message.trim()}

---
Reply directly to this email to respond to the user.`;

    // Send email
    try {
      const transporter = getEmailTransporter();

      await transporter.sendMail({
        from: process.env.GMAIL_USER || process.env.SENDGRID_FROM_EMAIL || 'noreply@whoknowsball.com',
        to: 'bkshelpteam@gmail.com',
        replyTo: user.email,
        subject: emailSubject,
        text: emailBody
      });

      console.log(`[Support] Ticket ${ticket_id} sent successfully for user ${user.username} (${user.id})`);

      res.json({
        success: true,
        ticket_id,
        message: 'Your support request has been submitted. We\'ll get back to you as soon as possible.',
        submitted_at: timestamp
      });

    } catch (emailError) {
      console.error('[Support] Failed to send email:', emailError);

      // Even if email fails, we should log it and inform the user
      return res.status(500).json({
        error: 'Email delivery failed',
        message: 'We were unable to send your support request. Please try again later or contact us directly at bkshelpteam@gmail.com',
        ticket_id, // Still provide ticket ID for logging
        details: process.env.NODE_ENV === 'development'
          ? (emailError instanceof Error ? emailError.message : 'Unknown error')
          : undefined
      });
    }

  } catch (error) {
    console.error('[Support] Contact endpoint error:', error);

    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your support request',
      details: process.env.NODE_ENV === 'development'
        ? (error instanceof Error ? error.message : 'Unknown error')
        : undefined
    });
  }
});

/**
 * GET /api/v1/support/status
 *
 * Check support system status and user's rate limit
 *
 * Auth: Required
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    // Check email service configuration
    let emailConfigured = false;
    let emailProvider = 'none';

    try {
      const transporter = getEmailTransporter();
      emailConfigured = true;
      emailProvider = process.env.SENDGRID_API_KEY ? 'sendgrid' : 'gmail';
    } catch (error) {
      // Email not configured
    }

    // Get rate limit status
    const key = `support:ratelimit:${user.id}`;
    const current = await redisClient.get(key);
    const count = current ? parseInt(current, 10) : 0;
    const ttl = current ? await redisClient.ttl(key) : 3600;
    const resetAt = new Date(Date.now() + ttl * 1000);

    res.json({
      success: true,
      email_configured: emailConfigured,
      email_provider: emailProvider,
      rate_limit: {
        max_requests: 5,
        window: '1 hour',
        used: count,
        remaining: Math.max(0, 5 - count),
        reset_at: resetAt.toISOString()
      }
    });

  } catch (error) {
    console.error('[Support] Status check error:', error);
    res.status(500).json({
      error: 'Failed to check support status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
