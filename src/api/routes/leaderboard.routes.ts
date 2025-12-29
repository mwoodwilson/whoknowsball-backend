import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { createClient } from '@supabase/supabase-js';
import { getCache, setWithExpiry } from '../../config/redis';
import { dailyBKSService } from '../../services/DailyBKSService';

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
 * GET /api/v1/leaderboard/global
 *
 * Returns global BKS rankings for all users sorted by overall_bks descending.
 * Uses Redis caching with 5-minute TTL for performance.
 *
 * Query Parameters:
 * - limit: Number of entries to return (default: 100, max: 500)
 * - offset: Number of entries to skip for pagination (default: 0)
 *
 * Response:
 * {
 *   leaderboard: [
 *     { rank: 1, username: "TopBettor", overall_bks: 87.5, total_bets: 245 }
 *   ],
 *   total: 150,
 *   limit: 100,
 *   offset: 0,
 *   updated_at: "2025-12-29T12:00:00.000Z"
 * }
 */
router.get('/global', async (req: Request, res: Response) => {
  try {
    // Parse pagination parameters
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    // Cache key includes pagination for proper caching
    const cacheKey = `leaderboard:global:${limit}:${offset}`;

    // Check Redis cache first (5-minute TTL)
    try {
      const cachedData = await getCache<any>(cacheKey);
      if (cachedData) {
        console.log(`[Leaderboard] Cache hit for global leaderboard (limit=${limit}, offset=${offset})`);
        return res.json({
          ...cachedData,
          cache_hit: true
        });
      }
    } catch (cacheError) {
      console.error('[Leaderboard] Redis cache error:', cacheError);
      // Continue to database query on cache failure
    }

    const db = getSupabase();

    // Get total count of eligible users (for pagination metadata)
    const { count: totalCount, error: countError } = await db
      .from('users')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('total_bets', 1);

    if (countError) {
      console.error('[Leaderboard] Error counting users:', countError);
      throw countError;
    }

    // Query users sorted by overall_bks descending
    const { data: users, error: usersError } = await db
      .from('users')
      .select('username, overall_bks, total_bets')
      .is('deleted_at', null)
      .gte('total_bets', 1)
      .order('overall_bks', { ascending: false })
      .range(offset, offset + limit - 1);

    if (usersError) {
      console.error('[Leaderboard] Error fetching users:', usersError);
      throw usersError;
    }

    // Map to leaderboard entries with rank
    const leaderboard = (users || []).map((user, index) => ({
      rank: offset + index + 1,
      username: user.username,
      overall_bks: parseFloat((user.overall_bks || 0).toFixed(1)),
      total_bets: user.total_bets || 0
    }));

    const response = {
      leaderboard,
      total: totalCount || 0,
      limit,
      offset,
      updated_at: new Date().toISOString(),
      cache_hit: false
    };

    // Cache for 5 minutes (300 seconds)
    try {
      await setWithExpiry(cacheKey, response, 300);
      console.log(`[Leaderboard] Cached global leaderboard (${leaderboard.length} entries)`);
    } catch (cacheError) {
      console.error('[Leaderboard] Failed to cache response:', cacheError);
    }

    console.log(`[Leaderboard] Returning ${leaderboard.length} entries (offset=${offset}, total=${totalCount})`);
    res.json(response);

  } catch (error) {
    console.error('[Leaderboard] Global endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch global leaderboard',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/leaderboard/sport/:sportKey
 *
 * Returns sport-specific BKS rankings.
 * Currently returns placeholder message.
 *
 * Response:
 * {
 *   sport: "basketball_nba",
 *   sport_title: "NBA",
 *   leaderboard: [],
 *   message: "Sport-specific leaderboards coming soon",
 *   is_placeholder: true
 * }
 */
router.get('/sport/:sportKey', async (req: Request, res: Response) => {
  try {
    const { sportKey } = req.params;

    const sportTitles: Record<string, string> = {
      'americanfootball_nfl': 'NFL',
      'basketball_nba': 'NBA',
      'baseball_mlb': 'MLB',
      'icehockey_nhl': 'NHL',
      'soccer_epl': 'Premier League',
      'soccer_uefa_champs_league': 'Champions League'
    };

    res.json({
      sport: sportKey,
      sport_title: sportTitles[sportKey] || sportKey,
      leaderboard: [],
      message: 'Sport-specific leaderboards coming soon',
      is_placeholder: true
    });
  } catch (error) {
    console.error('[Leaderboard] Sport endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch sport leaderboard',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/leaderboard/friends
 *
 * Returns friends leaderboard.
 * Currently returns placeholder message.
 * Will require authentication in the future.
 *
 * Response:
 * {
 *   leaderboard: [],
 *   message: "Connect with friends to see their rankings",
 *   is_placeholder: true
 * }
 */
router.get('/friends', async (req: Request, res: Response) => {
  try {
    res.json({
      leaderboard: [],
      message: 'Connect with friends to see their rankings',
      is_placeholder: true
    });
  } catch (error) {
    console.error('[Leaderboard] Friends endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch friends leaderboard',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/stats/user/:username
 *
 * Returns user statistics and profile.
 * Currently returns placeholder data.
 *
 * Response:
 * {
 *   username: "testuser",
 *   overall_bks: 65.4,
 *   total_bets: 42,
 *   won: 24,
 *   lost: 15,
 *   pending: 3,
 *   win_rate: 0.615,
 *   best_sport: "basketball_nba",
 *   best_sport_bks: 72.3,
 *   streak: 3,
 *   rank: 127,
 *   percentile: 85,
 *   is_placeholder: true
 * }
 */
router.get('/stats/user/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Validate username
    if (!username || username.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid username',
        message: 'Username cannot be empty'
      });
    }

    // Return mock stats for now
    res.json({
      username,
      overall_bks: 65.4,
      total_bets: 42,
      won: 24,
      lost: 15,
      pending: 3,
      win_rate: 0.615,
      best_sport: 'basketball_nba',
      best_sport_bks: 72.3,
      streak: 3,
      rank: 127,
      percentile: 85,
      is_placeholder: true
    });
  } catch (error) {
    console.error('[Leaderboard] User stats endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch user stats',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/users/stats
 *
 * Returns authenticated user's statistics (requires authentication).
 * Calculates real-time stats from database with 30-second caching.
 *
 * Response:
 * {
 *   overall_bks: 67.5,
 *   total_bets: 48,
 *   total_won: 29,
 *   total_lost: 16,
 *   total_push: 3,
 *   win_rate: 60.4,
 *   avg_stake: 10.25,
 *   avg_bks_per_bet: 65.2,
 *   total_winnings: 145.50,
 *   by_sport: [{sport_key, sport_title, total_bets, won, lost, push, win_rate, avg_bks}]
 * }
 */
router.get('/users/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = getSupabase();

    // Check Redis cache (30 second TTL)
    const cacheKey = `user:stats:${userId}`;
    try {
      const cachedData = await getCache<any>(cacheKey);
      if (cachedData) {
        console.log(`[Stats] Cache hit for user ${userId}`);
        return res.json({
          ...cachedData,
          cache_hit: true
        });
      }
    } catch (cacheError) {
      console.error('[Stats] Redis cache error:', cacheError);
    }

    // Get user profile data (overall_bks, total_bets from users table)
    const { data: userProfile, error: profileError } = await db
      .from('users')
      .select('overall_bks, total_bets, total_won, total_lost')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Unable to retrieve user profile'
      });
    }

    // Get all settled bets for this user (including parlay legs for multi-sport detection)
    const { data: bets, error: betsError } = await db
      .from('bets')
      .select('sport_key, stake, bks_final, bks_provisional, outcome, odds, status, bet_type, parlay_legs(sport_key)')
      .eq('user_id', userId)
      .in('status', ['SETTLED']);

    if (betsError) {
      console.error('[Stats] Error fetching bets:', betsError);
      return res.status(500).json({
        error: 'Failed to fetch bet statistics',
        message: betsError.message
      });
    }

    const settledBets = bets || [];
    const totalPush = settledBets.filter(b => b.outcome === 'PUSH').length;

    // Calculate aggregates
    const avgStake = settledBets.length > 0
      ? parseFloat((settledBets.reduce((sum, b) => sum + (b.stake || 0), 0) / settledBets.length).toFixed(2))
      : 0;

    const avgBksPerBet = settledBets.length > 0
      ? parseFloat((settledBets.reduce((sum, b) => sum + (b.bks_final ?? b.bks_provisional ?? 0), 0) / settledBets.length).toFixed(1))
      : 0;

    // Calculate total winnings (stake * decimal_odds for wins)
    const totalWinnings = settledBets
      .filter(b => b.outcome === 'WIN')
      .reduce((sum, b) => {
        const stake = b.stake || 0;
        const odds = b.odds || 0;
        // Convert American odds to decimal, then calculate payout
        const decimal = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
        return sum + (stake * decimal);
      }, 0);

    // Group by sport
    const bySportMap = new Map<string, {
      sport_key: string;
      total_bets: number;
      won: number;
      lost: number;
      push: number;
      bks_scores: number[];
    }>();

    // Sport title mapping
    const sportTitles: Record<string, string> = {
      'americanfootball_nfl': 'NFL',
      'americanfootball_ncaaf': 'NCAAF',
      'basketball_nba': 'NBA',
      'baseball_mlb': 'MLB',
      'icehockey_nhl': 'NHL',
      'multiple': 'Multiple'
    };

    for (const bet of settledBets) {
      // Determine the category for this bet
      let category = bet.sport_key;

      // Check if this is a multi-sport parlay
      if (bet.bet_type === 'parlay' && bet.parlay_legs && bet.parlay_legs.length > 0) {
        const uniqueSports = [...new Set(bet.parlay_legs.map((leg: { sport_key: string }) => leg.sport_key))];
        if (uniqueSports.length > 1) {
          category = 'multiple';
        }
      }

      if (!bySportMap.has(category)) {
        bySportMap.set(category, {
          sport_key: category,
          total_bets: 0,
          won: 0,
          lost: 0,
          push: 0,
          bks_scores: []
        });
      }

      const sportStats = bySportMap.get(category)!;
      sportStats.total_bets++;

      if (bet.outcome === 'WIN') sportStats.won++;
      else if (bet.outcome === 'LOSS') sportStats.lost++;
      else if (bet.outcome === 'PUSH') sportStats.push++;

      const bksScore = bet.bks_final ?? bet.bks_provisional;
      if (bksScore != null) {
        sportStats.bks_scores.push(bksScore);
      }
    }

    // Convert to array with calculated win rates and avg BKS
    const bySport = Array.from(bySportMap.values())
      .map(sport => ({
        sport_key: sport.sport_key,
        sport_title: sportTitles[sport.sport_key] || sport.sport_key,
        total_bets: sport.total_bets,
        won: sport.won,
        lost: sport.lost,
        push: sport.push,
        win_rate: sport.total_bets > 0
          ? parseFloat(((sport.won / sport.total_bets) * 100).toFixed(1))
          : 0,
        avg_bks: sport.bks_scores.length > 0
          ? parseFloat((sport.bks_scores.reduce((sum, s) => sum + s, 0) / sport.bks_scores.length).toFixed(1))
          : 0
      }))
      .sort((a, b) => {
        // Always put "Multiple" at the end
        if (a.sport_key === 'multiple') return 1;
        if (b.sport_key === 'multiple') return -1;
        // Sort remaining by most bets
        return b.total_bets - a.total_bets;
      });

    const response = {
      overall_bks: userProfile.overall_bks || 0,
      total_bets: userProfile.total_bets || 0,
      total_won: userProfile.total_won || 0,
      total_lost: userProfile.total_lost || 0,
      total_push: totalPush,
      win_rate: userProfile.total_bets > 0
        ? parseFloat(((userProfile.total_won / userProfile.total_bets) * 100).toFixed(1))
        : 0,
      avg_stake: avgStake,
      avg_bks_per_bet: avgBksPerBet,
      total_winnings: parseFloat(totalWinnings.toFixed(2)),
      by_sport: bySport,
      cache_hit: false
    };

    // Cache for 30 seconds
    try {
      await setWithExpiry(cacheKey, response, 30);
    } catch (cacheError) {
      console.error('[Stats] Failed to cache response:', cacheError);
    }

    console.log(`[Stats] Calculated stats for user ${userId}: ${response.total_bets} bets, ${response.overall_bks} BKS`);
    res.json(response);

  } catch (error) {
    console.error('[Stats] User stats endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch user statistics',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/users/bks-history?days=30
 *
 * Returns authenticated user's daily BKS snapshots for charting.
 * Defaults to last 30 days. Use days=0 for "all time" (no date limit).
 *
 * Response:
 * {
 *   history: [
 *     { date: "2024-11-01", bks: 72.5 },
 *     { date: "2024-11-02", bks: 74.2 },
 *     ...
 *   ]
 * }
 */
router.get('/users/bks-history', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    // Parse days parameter - 0 means "all time" (no limit)
    const daysParam = req.query.days as string;
    const days = daysParam === '0' ? 0 : (parseInt(daysParam) || 30);

    // Validate: must be 0 (all time) or between 1-365
    if (days !== 0 && (days < 1 || days > 365)) {
      return res.status(400).json({
        error: 'Invalid days parameter',
        message: 'days must be 0 (all time) or between 1 and 365'
      });
    }

    const history = await dailyBKSService.getRecentSnapshots(userId, days);

    res.json({
      history,
      days_requested: days === 0 ? 'all' : days,
      days_returned: history.length
    });

  } catch (error) {
    console.error('[BKS History] Endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch BKS history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
