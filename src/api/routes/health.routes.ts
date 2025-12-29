/**
 * Health Monitoring Routes for API-Sports Integration
 *
 * Endpoints:
 * - GET /api/v1/health/api-sports-quota - Per-API quota usage tracking
 * - GET /api/v1/health/aggregation - Overall system health
 *
 * Uses Redis data populated by ScoresJob tracking functions
 */

import express from 'express';
import { getCache } from '../../config/redis';
import moment from 'moment-timezone';
import { quotaCircuitBreaker } from '../../utils/quotaCircuitBreaker';

const router = express.Router();

/**
 * GET /api/v1/health/api-sports-quota
 * Track API-Sports quota usage across all 4 sport endpoints
 *
 * Response:
 * {
 *   "timestamp": "2024-11-09T12:00:00Z",
 *   "quotas": {
 *     "americanfootball_nfl": { "used": 120, "limit": 7500, "percentage": 1.6 },
 *     "americanfootball_ncaaf": { "used": 80, "limit": 7500, "percentage": 1.07 },
 *     ...
 *   },
 *   "fallbacks": {
 *     "count": 2,
 *     "sports": ["basketball_nba", "icehockey_nhl"]
 *   },
 *   "lastSync": "2024-11-09T11:58:32Z"
 * }
 */
router.get('/api-sports-quota', async (req, res) => {
  try {
    const sports = [
      'americanfootball_nfl',
      'americanfootball_ncaaf',
      'basketball_nba',
      'icehockey_nhl',
      'baseball_mlb'
    ];

    const quotas: Record<string, { used: number; limit: number; percentage: number }> = {};
    const dailyLimit = 7500; // Tier 1 limit per API endpoint

    // Calculate usage for each sport (last 24 hours)
    for (const sport of sports) {
      const dates: string[] = [];
      for (let i = 0; i < 1; i++) { // Last 24 hours (current day)
        const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
        dates.push(date);
      }

      let totalRequests = 0;
      for (const date of dates) {
        const key = `scoresjob:api_sports:${sport}:${date}`;
        const count = await getCache(key);
        if (count) {
          totalRequests += parseInt(count, 10);
        }
      }

      quotas[sport] = {
        used: totalRequests,
        limit: dailyLimit,
        percentage: parseFloat(((totalRequests / dailyLimit) * 100).toFixed(2))
      };
    }

    // Get fallback count
    const fallbackCountStr = await getCache('scoresjob:fallback:count:today');
    const fallbackCount = fallbackCountStr ? parseInt(fallbackCountStr, 10) : 0;

    // Identify which sports had fallbacks
    const fallbackSports: string[] = [];
    for (const sport of sports) {
      const today = moment().format('YYYY-MM-DD');
      const fallbackKey = `scoresjob:fallback:api_sports:${sport}:${today}`;
      const hasFallback = await getCache(fallbackKey);
      if (hasFallback) {
        fallbackSports.push(sport);
      }
    }

    // Get last sync time
    const lastSync = await getCache('scoresjob:last:sync');

    res.json({
      timestamp: new Date().toISOString(),
      quotas,
      fallbacks: {
        count: fallbackCount,
        sports: fallbackSports
      },
      lastSync: lastSync || null
    });

  } catch (error: any) {
    console.error('[Health] Error fetching API-Sports quota:', error);
    res.status(500).json({
      error: 'Failed to fetch API-Sports quota data',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/health/aggregation
 * Overall system health dashboard
 *
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-11-09T12:00:00Z",
 *   "apiSports": {
 *     "enabled": true,
 *     "totalUsage": 450,
 *     "dailyLimit": 37500,
 *     "usagePercentage": 1.2,
 *     "fallbackCount": 2
 *   },
 *   "database": {
 *     "status": "connected"
 *   },
 *   "redis": {
 *     "status": "connected"
 *   },
 *   "lastSync": "2024-11-09T11:58:32Z"
 * }
 */
router.get('/aggregation', async (req, res) => {
  try {
    const sports = [
      'americanfootball_nfl',
      'americanfootball_ncaaf',
      'basketball_nba',
      'icehockey_nhl',
      'baseball_mlb'
    ];

    // Calculate total API-Sports usage
    let totalUsage = 0;
    const dailyLimitPerAPI = 7500;
    const totalDailyLimit = dailyLimitPerAPI * 5; // 5 sports, but note: NFL+NCAAF share same API

    for (const sport of sports) {
      const today = moment().format('YYYY-MM-DD');
      const key = `scoresjob:api_sports:${sport}:${today}`;
      const count = await getCache(key);
      if (count) {
        totalUsage += parseInt(count, 10);
      }
    }

    // Get fallback count
    const fallbackCountStr = await getCache('scoresjob:fallback:count:today');
    const fallbackCount = fallbackCountStr ? parseInt(fallbackCountStr, 10) : 0;

    // Get last sync time
    const lastSync = await getCache('scoresjob:last:sync');

    // Check Redis status
    let redisStatus = 'connected';
    try {
      await getCache('health:check');
    } catch {
      redisStatus = 'disconnected';
    }

    // Determine overall health status
    const usagePercentage = (totalUsage / totalDailyLimit) * 100;
    const isHealthy = usagePercentage < 90 && fallbackCount < 20 && redisStatus === 'connected';

    res.json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      apiSports: {
        enabled: process.env.USE_API_SPORTS_SCORES !== 'false',
        totalUsage,
        dailyLimit: totalDailyLimit,
        usagePercentage: parseFloat(usagePercentage.toFixed(2)),
        fallbackCount
      },
      database: {
        status: 'connected' // Assumes Supabase is connected if server is running
      },
      redis: {
        status: redisStatus
      },
      lastSync: lastSync || null
    });

  } catch (error: any) {
    console.error('[Health] Error fetching aggregation data:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch health aggregation data',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/health/circuit-breaker
 * Real-time circuit breaker quota tracking
 *
 * Shows actual API requests being made (not Redis cached data)
 * Tracks ALL API-Sports requests across backend jobs
 *
 * Response:
 * {
 *   "timestamp": "2024-11-15T20:00:00Z",
 *   "quota": {
 *     "used": 3450,
 *     "limit": 25000,
 *     "remaining": 21550,
 *     "percentUsed": "13.8",
 *     "resetTime": "2024-11-16T00:00:00Z"
 *   },
 *   "status": "healthy",
 *   "recentRequests": [
 *     { "timestamp": "2024-11-15T19:59:45Z", "sport": "basketball_nba", "endpoint": "/games?date=2024-11-15" }
 *   ],
 *   "requestsBySport": {
 *     "americanfootball_nfl": 650,
 *     "basketball_nba": 1200,
 *     ...
 *   }
 * }
 */
router.get('/circuit-breaker', async (req, res) => {
  try {
    const usage = quotaCircuitBreaker.getUsage();
    const recentRequests = quotaCircuitBreaker.getRecentRequests(50);
    const requestsBySport = quotaCircuitBreaker.getRequestsBySport();

    // Determine status based on quota usage
    let status = 'healthy';
    const percentUsed = parseFloat(usage.percentUsed);
    if (percentUsed >= 95) {
      status = 'critical';
    } else if (percentUsed >= 80) {
      status = 'warning';
    } else if (percentUsed >= 50) {
      status = 'caution';
    }

    res.json({
      timestamp: new Date().toISOString(),
      quota: usage,
      status,
      recentRequests,
      requestsBySport
    });

  } catch (error: any) {
    console.error('[Health] Error fetching circuit breaker data:', error);
    res.status(500).json({
      error: 'Failed to fetch circuit breaker data',
      message: error.message
    });
  }
});

export default router;
