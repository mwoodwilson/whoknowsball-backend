import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getCache, setWithExpiry } from '../../config/redis';

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
 * GET /api/v1/metrics/activity
 *
 * Returns betting activity metrics for sports over the last 24 hours.
 * Uses exponential time decay weighting to emphasize recent bets.
 *
 * Query params:
 * - sports: "today" (default) - only sports with activity today
 *          "all" - all sports including those with no activity
 *
 * Response:
 * {
 *   sports: [
 *     {sport_key: "americanfootball_nfl", activity_score_today: 123.4},
 *     {sport_key: "basketball_nba", activity_score_today: 89.2}
 *   ],
 *   as_of: "2025-10-12T15:30:00Z",
 *   cache_hit: false
 * }
 *
 * Activity score calculation:
 * - Each bet contributes a weighted score based on recency
 * - Weight formula: Math.exp(-hoursAgo / 6)
 * - More recent bets have higher weight (exponential decay with 6-hour half-life)
 * - Scores are summed per sport
 *
 * Caching:
 * - Results cached in Redis for 60 seconds
 * - Cache key: "metrics:activity" or "metrics:activity:all"
 */
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const sportsFilter = (req.query.sports as string) || 'today';

    // Validate query param
    if (!['today', 'all'].includes(sportsFilter)) {
      return res.status(400).json({
        error: 'Invalid query parameter',
        message: 'sports param must be "today" or "all"'
      });
    }

    // Check Redis cache
    const cacheKey = sportsFilter === 'all'
      ? 'metrics:activity:all'
      : 'metrics:activity';

    let cacheHit = false;

    try {
      const cachedData = await getCache<any>(cacheKey);
      if (cachedData) {
        cacheHit = true;
        return res.json({
          ...cachedData,
          cache_hit: true
        });
      }
    } catch (cacheError) {
      console.error('[Metrics] Redis cache error:', cacheError);
      // Continue without cache on error
    }

    const db = getSupabase();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Query all bets from last 24 hours (all statuses)
    const { data: bets, error } = await db
      .from('bets')
      .select('sport_key, placed_at')
      .gte('placed_at', twentyFourHoursAgo.toISOString())
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('[Metrics] Database error:', error);
      return res.status(500).json({
        error: 'Failed to fetch activity metrics',
        message: error.message
      });
    }

    // Calculate weighted activity scores per sport
    const sportScores = new Map<string, number>();

    if (bets && bets.length > 0) {
      for (const bet of bets) {
        const betTimestamp = new Date(bet.placed_at).getTime();
        const hoursAgo = (now.getTime() - betTimestamp) / (1000 * 60 * 60);

        // Exponential decay weight with 6-hour characteristic time
        // At 0 hours: weight = 1.0
        // At 6 hours: weight ≈ 0.37
        // At 12 hours: weight ≈ 0.14
        // At 24 hours: weight ≈ 0.02
        const weight = Math.exp(-hoursAgo / 6);

        const currentScore = sportScores.get(bet.sport_key) || 0;
        sportScores.set(bet.sport_key, currentScore + weight);
      }
    }

    // Convert to array and sort by activity score (descending)
    const sports = Array.from(sportScores.entries())
      .map(([sport_key, activity_score_today]) => ({
        sport_key,
        activity_score_today: parseFloat(activity_score_today.toFixed(2))
      }))
      .sort((a, b) => b.activity_score_today - a.activity_score_today);

    // For "all" filter, we would need to query available sports
    // For now, "all" returns the same as "today" since we only have activity data
    // In future, could join with games table to show sports with 0 activity

    const response = {
      sports,
      as_of: now.toISOString(),
      cache_hit: false,
      total_bets_24h: bets?.length || 0
    };

    // Cache the response for 60 seconds
    try {
      await setWithExpiry(cacheKey, response, 60);
    } catch (cacheError) {
      console.error('[Metrics] Failed to cache response:', cacheError);
      // Continue without caching
    }

    res.json(response);

  } catch (error) {
    console.error('[Metrics] Activity endpoint error:', error);
    res.status(500).json({
      error: 'Failed to calculate activity metrics',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/metrics/leaderboard
 *
 * Returns top users by BKS score.
 * Cached for 5 minutes.
 *
 * Query params:
 * - limit: number of users to return (default 10, max 100)
 *
 * Response:
 * {
 *   users: [
 *     {username: "player1", overall_bks: 12345.6, rank: 1},
 *     {username: "player2", overall_bks: 11234.5, rank: 2}
 *   ],
 *   as_of: "2025-10-12T15:30:00Z",
 *   cache_hit: false
 * }
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const cacheKey = `metrics:leaderboard:${limit}`;

    // Check Redis cache
    let cacheHit = false;

    try {
      const cachedData = await getCache<any>(cacheKey);
      if (cachedData) {
        cacheHit = true;
        return res.json({
          ...cachedData,
          cache_hit: true
        });
      }
    } catch (cacheError) {
      console.error('[Metrics] Redis cache error:', cacheError);
      // Continue without cache on error
    }

    const db = getSupabase();

    // Query top users by overall_bks
    const { data: users, error } = await db
      .from('users')
      .select('username, overall_bks, total_bets, total_won, total_lost')
      .order('overall_bks', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Metrics] Database error:', error);
      return res.status(500).json({
        error: 'Failed to fetch leaderboard',
        message: error.message
      });
    }

    // Add rank to each user
    const rankedUsers = (users || []).map((user, index) => ({
      rank: index + 1,
      username: user.username,
      overall_bks: user.overall_bks,
      total_bets: user.total_bets,
      win_rate: user.total_bets > 0
        ? parseFloat(((user.total_won / user.total_bets) * 100).toFixed(1))
        : 0
    }));

    const response = {
      users: rankedUsers,
      as_of: new Date().toISOString(),
      cache_hit: false
    };

    // Cache for 5 minutes
    try {
      await setWithExpiry(cacheKey, response, 300);
    } catch (cacheError) {
      console.error('[Metrics] Failed to cache response:', cacheError);
    }

    res.json(response);

  } catch (error) {
    console.error('[Metrics] Leaderboard endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch leaderboard',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
