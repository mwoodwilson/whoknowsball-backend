import { Router, Request, Response } from 'express';
import { OddsAPIService } from '../../services/odds/OddsAPIService';
import { OddsEnhancementService } from '../../services/odds/OddsEnhancementService';
import { getCache, setWithExpiry, deleteCache } from '../../config/redis';
import { getSupabase } from '../../config/supabase';
import rateLimit from 'express-rate-limit';

const router = Router();

// Lazy initialize services
let oddsService: OddsAPIService | null = null;
function getOddsService(): OddsAPIService {
  if (!oddsService) {
    oddsService = new OddsAPIService();
  }
  return oddsService;
}

const oddsEnhancer = OddsEnhancementService.getInstance();

// Supported sports mapping
const SUPPORTED_SPORTS = {
  'americanfootball_nfl': 'NFL',
  'americanfootball_ncaaf': 'NCAA Football',
  'basketball_nba': 'NBA',
  'baseball_mlb': 'MLB',
  'icehockey_nhl': 'NHL'
} as const;

type SupportedSportKey = keyof typeof SUPPORTED_SPORTS;
type SupportedSportValue = typeof SUPPORTED_SPORTS[SupportedSportKey];

// Rate limiting middleware (60 requests per minute per IP)
const oddsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Maximum 60 requests per minute.',
    retryAfter: '60 seconds'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Disable validation warnings when behind ngrok/reverse proxy
  validate: { trustProxy: false, xForwardedForHeader: false }
});

/**
 * Fuzzy team name matching (same logic as OddsMatchingJob)
 * Handles variations like "LA Lakers" vs "Los Angeles Lakers"
 */
function teamsMatch(team1: string, team2: string): boolean {
  const normalize = (name: string) =>
    name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();

  const normalized1 = normalize(team1);
  const normalized2 = normalize(team2);

  // Exact match after normalization
  if (normalized1 === normalized2) return true;

  // Check if one is a substring of the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }

  return false;
}

/**
 * Find matching database game for an Odds API event
 * Returns the API-Sports integer ID if found, null otherwise
 */
async function findDatabaseGameId(
  oddsEvent: any,
  dbGames: any[]
): Promise<string | null> {
  const commenceTime = new Date(oddsEvent.commence_time);
  const timeWindow = 60; // 60 minutes tolerance
  const timeWindowStart = new Date(commenceTime.getTime() - timeWindow * 60 * 1000);
  const timeWindowEnd = new Date(commenceTime.getTime() + timeWindow * 60 * 1000);

  // Find matching game by team names + time window
  const matchedGame = dbGames.find(dbGame => {
    const dbCommenceTime = new Date(dbGame.commence_time);

    // Check time window
    if (dbCommenceTime < timeWindowStart || dbCommenceTime > timeWindowEnd) {
      return false;
    }

    // Check team names match
    return teamsMatch(dbGame.home_team, oddsEvent.home_team) &&
           teamsMatch(dbGame.away_team, oddsEvent.away_team);
  });

  return matchedGame?.id || null;
}

/**
 * Fetch all database games for supported sports
 * Returns games indexed by sport_key for efficient lookup
 */
async function fetchDatabaseGames(): Promise<Map<string, any[]>> {
  const sportKeys = Object.keys(SUPPORTED_SPORTS);
  const gamesMap = new Map<string, any[]>();

  try {
    const { data: games, error } = await getSupabase()
      .from('games')
      .select('id, home_team, away_team, commence_time, sport_key, status, completed')
      .in('sport_key', sportKeys)
      .eq('completed', false);

    if (error) {
      console.error('[Odds Routes] Error fetching database games:', error);
      return gamesMap;
    }

    // Group games by sport_key
    for (const game of games || []) {
      if (!gamesMap.has(game.sport_key)) {
        gamesMap.set(game.sport_key, []);
      }
      gamesMap.get(game.sport_key)!.push(game);
    }

    return gamesMap;
  } catch (error) {
    console.error('[Odds Routes] Error in fetchDatabaseGames:', error);
    return gamesMap;
  }
}

/**
 * Helper function to estimate BKS range for a bet option
 * Returns [min, max] estimated BKS score based on odds
 */
function estimateBKSRange(odds_american: number): [number, number] {
  // Heavy favorites: lower BKS potential (easier bet)
  if (odds_american <= -300) return [15, 35];
  if (odds_american <= -200) return [20, 40];
  if (odds_american <= -150) return [25, 45];

  // Slight favorites/underdogs: medium BKS potential
  if (odds_american <= -110) return [30, 50];
  if (odds_american <= 110) return [30, 50];
  if (odds_american <= 150) return [35, 55];

  // Moderate underdogs: higher BKS potential
  if (odds_american <= 200) return [40, 60];
  if (odds_american <= 300) return [45, 65];

  // Heavy underdogs: highest BKS potential
  return [50, 75];
}

/**
 * Capture opening odds for a game
 */
async function captureOpeningOdds(game: any): Promise<void> {
  try {
    // For each bookmaker, capture opening odds
    for (const bookmaker of game.bookmakers) {
      // Prepare odds data in the format needed for BKS CLV calculation
      const oddsData: any = {};

      for (const market of bookmaker.markets) {
        oddsData[market.key] = market.outcomes.map((outcome: any) => ({
          name: outcome.name,
          price: outcome.price,
          point: outcome.point
        }));
      }

      // Capture opening odds (will skip if already exists)
      await oddsEnhancer.captureOpeningOdds(
        game.id,
        game.sport_key,
        bookmaker.key,
        oddsData
      );

      // Schedule closing odds capture (T-2 minutes before game start)
      await oddsEnhancer.scheduleClosingOddsCapture(game.id, game.commence_time);
    }
  } catch (error) {
    console.error(`Error capturing opening odds for game ${game.id}:`, error);
    // Don't throw - we don't want to fail the entire request
  }
}

/**
 * Select the preferred bookmaker from available options
 * Priority: FanDuel > DraftKings > BetMGM > first available
 * Returns a single bookmaker to ensure all markets come from same source
 */
function selectPreferredBookmaker(bookmakers: any[]): any | null {
  if (!bookmakers || bookmakers.length === 0) return null;

  const priority = ['fanduel', 'draftkings', 'betmgm'];

  for (const key of priority) {
    const bm = bookmakers.find((b: any) => b.key === key);
    if (bm) return bm;
  }

  // Fallback to first available
  return bookmakers[0];
}

/**
 * Transform OddsAPI response to include BKS estimates
 * IMPORTANT: Uses SINGLE bookmaker source for all markets to ensure consistency
 * (spread home + away are inverses, over/under use same total)
 * @param game - Odds API game response
 * @param dbGameId - Optional API-Sports integer ID from database (preferred)
 */
function transformGameWithBKS(game: any, dbGameId?: string | null) {
  // Select ONE preferred bookmaker for ALL markets on this game
  const preferredBookmaker = selectPreferredBookmaker(game.bookmakers);

  // Build bookmakers array with only the preferred one (if available)
  const bookmakers = preferredBookmaker ? [{
    name: preferredBookmaker.title,
    key: preferredBookmaker.key,
    last_update: preferredBookmaker.last_update,
    markets: preferredBookmaker.markets.map((market: any) => {
      // Add BKS estimates to each outcome
      const outcomesWithBKS = market.outcomes.map((outcome: any) => ({
        name: outcome.name,
        price: outcome.price,
        point: outcome.point,
        potential_bks: estimateBKSRange(outcome.price)
      }));

      return {
        key: market.key,
        last_update: market.last_update,
        outcomes: outcomesWithBKS
      };
    })
  }] : [];

  return {
    // CRITICAL: Use database game ID (API-Sports integer) if available
    // Fall back to Odds API hash ID only if no database match found
    game_id: dbGameId || game.id,
    sport_key: game.sport_key,
    sport_title: game.sport_title,
    home_team: game.home_team,
    away_team: game.away_team,
    commence_time: game.commence_time,
    odds_source: preferredBookmaker?.key || null,
    odds_source_title: preferredBookmaker?.title || null,
    bookmakers
  };
}

/**
 * GET /api/v1/odds/games
 * Get all games with merged odds and scores data
 * Returns games separated into "live" and "upcoming" categories
 *
 * @returns { live: Game[], upcoming: Game[] }
 */
router.get('/games', oddsRateLimiter, async (req: Request, res: Response) => {
  try {
    const service = getOddsService();
    const now = new Date();

    // Check for force refresh parameter
    const forceRefresh = req.query.forceRefresh === 'true';

    // Redis cache with 60-second TTL and timestamp bucketing
    // Timestamp bucketing: Round to nearest minute to maximize cache hits
    const bucketedTimestamp = Math.floor(Date.now() / 60000) * 60000; // Round to minute
    const cacheKey = `merged_games_all:${bucketedTimestamp}`;
    const cacheExpiry = 60; // 60 seconds TTL

    // Try Redis cache first (skip if forceRefresh requested)
    if (!forceRefresh) {
      try {
        const cached = await getCache(cacheKey);
        if (cached) {
          console.log('[Merged Games] ✅ Serving from Redis cache');
          return res.json({
            success: true,
            ...cached,
            cached: true,
            cache_hit: true
          });
        }
      } catch (error: any) {
        // Redis error - log but continue without cache (graceful degradation)
        console.warn('[Merged Games] ⚠️ Redis cache read failed, continuing without cache:', error.message);
      }
    } else {
      console.log('[Merged Games] Force refresh requested - bypassing cache');
    }

    const allLiveGames: any[] = [];
    const allUpcomingGames: any[] = [];
    let quotaUsed = false;

    // CRITICAL FIX: Fetch database games first to get API-Sports integer IDs
    // This ensures we return proper game IDs that can be used for betting
    console.log('[Merged Games] Fetching database games for ID matching...');
    const dbGamesMap = await fetchDatabaseGames();
    console.log(`[Merged Games] Loaded ${Array.from(dbGamesMap.values()).flat().length} database games`);

    // Step 1: Check which sports have live or starting-soon games (using cached data)
    const sportsWithLiveGames = new Set<string>();

    if (forceRefresh) {
      // First, get cached data to check which sports have live or starting-soon games
      for (const [sportKey, sportValue] of Object.entries(SUPPORTED_SPORTS)) {
        try {
          // Use cached data only to check for live games
          const cachedOdds = await service.fetchOdds(sportKey, 'h2h,spreads,totals', false);

          // Check if any games are live OR starting within next 60 seconds
          const hasLiveOrStartingSoonGames = cachedOdds.some((game: any) => {
            const gameCommenceTime = new Date(game.commence_time);
            const timeUntilStart = gameCommenceTime.getTime() - now.getTime();

            // Game is live if commence_time is in the past
            const isLive = gameCommenceTime <= now;

            // Game is starting soon if within next 60 seconds
            const isStartingSoon = timeUntilStart > 0 && timeUntilStart <= 60000; // 60 seconds

            return isLive || isStartingSoon;
          });

          if (hasLiveOrStartingSoonGames) {
            sportsWithLiveGames.add(sportKey);
          }
        } catch (err) {
          // If no cached data, assume we should check (first time load)
          sportsWithLiveGames.add(sportKey);
        }
      }

      // If no live or starting-soon games at all, skip force refresh
      if (sportsWithLiveGames.size === 0) {
        console.log('[Merged Games] No live or starting-soon games detected - skipping force refresh to save quota');
        // Fall through to use cached data for all sports
      } else {
        console.log(`[Merged Games] Found live/starting-soon games in ${sportsWithLiveGames.size} sports - force refreshing only those`);
      }
    }

    // Step 2: Fetch data - PARALLEL fetch all sports simultaneously for 5x speed improvement
    const sportFetchResults = await Promise.all(
      Object.entries(SUPPORTED_SPORTS).map(async ([sportKey, sportValue]) => {
        try {
          // Only force refresh if this sport has live or starting-soon games, otherwise use cache
          const shouldForceRefresh = forceRefresh && sportsWithLiveGames.has(sportKey);

          if (shouldForceRefresh) {
            console.log(`[Merged Games] Force refreshing ${sportKey} (has live/starting-soon games)`);
          }

          // Fetch odds and scores in parallel
          const [oddsData, scoresData] = await Promise.all([
            service.fetchOdds(sportKey, 'h2h,spreads,totals', shouldForceRefresh),
            service.getScores(sportKey, shouldForceRefresh).catch(err => {
              console.warn(`No scores available for ${sportKey}:`, err.message);
              return [];
            })
          ]);

          return {
            sportKey,
            sportValue,
            oddsData,
            scoresData,
            shouldForceRefresh,
            error: null
          };

        } catch (error: any) {
          console.error(`Error fetching data for ${sportValue}:`, error);
          return {
            sportKey,
            sportValue,
            oddsData: [],
            scoresData: [],
            shouldForceRefresh: false,
            error
          };
        }
      })
    );

    // Process results from all sports
    for (const result of sportFetchResults) {
      if (result.error?.message === 'Daily quota exceeded') {
        break; // Stop processing if quota exceeded
      }

      if (result.error) {
        continue; // Skip this sport if there was an error
      }

      // Create a map of scores by game ID for quick lookup
      const scoresMap = new Map(result.scoresData.map(s => [s.id, s]));

      // Get database games for this sport
      const sportDbGames = dbGamesMap.get(result.sportKey) || [];

      // Process each game
      for (const game of result.oddsData) {
        const gameCommenceTime = new Date(game.commence_time);
        const scoreData = scoresMap.get(game.id);

        // Skip completed games entirely - they should not appear in the feed
        if (scoreData?.completed) {
          console.log(`[Merged Games] Skipping completed game: ${game.away_team} @ ${game.home_team}`);
          continue;
        }

        // CRITICAL: Look up the API-Sports integer ID from database
        const dbGameId = await findDatabaseGameId(game, sportDbGames);

        // Skip games that don't exist in our database
        // These can't be bet on anyway since we have no API-Sports ID for them
        if (!dbGameId) {
          console.log(`[Merged Games] Skipping game without database match: ${game.away_team} @ ${game.home_team}`);
          continue;
        }

        // Game is live if it started AND not completed
        const isLive = gameCommenceTime <= now && !scoreData?.completed;

        // Transform game with BKS estimates - use database game ID!
        const transformedGame = {
          ...transformGameWithBKS(game, dbGameId),
          sport_display: result.sportValue,
          isLive,
          scores: scoreData?.scores || null,
          completed: false, // We already filtered out completed games above
          last_score_update: scoreData?.last_update || null
        };

        // Categorize game
        if (isLive && scoreData) {
          allLiveGames.push(transformedGame);
        } else {
          allUpcomingGames.push(transformedGame);
        }
      }

      if (result.shouldForceRefresh) {
        quotaUsed = true;
      }
    }

    // Sort games by commence_time
    allLiveGames.sort((a, b) =>
      new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );
    allUpcomingGames.sort((a, b) =>
      new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );

    const quotaInfo = await getQuotaInfo();

    const responseData = {
      success: true,
      live: allLiveGames,
      upcoming: allUpcomingGames,
      cached: false,
      cache_hit: false,
      quota_remaining: quotaInfo.remaining,
      total_live: allLiveGames.length,
      total_upcoming: allUpcomingGames.length,
      timestamp: now.toISOString(),
      quota_optimization: {
        sports_with_live_games: sportsWithLiveGames.size,
        total_sports: Object.keys(SUPPORTED_SPORTS).length,
        quota_saved: forceRefresh ? (Object.keys(SUPPORTED_SPORTS).length - sportsWithLiveGames.size) * 2 : 0 // 2 API calls per sport (odds + scores)
      }
    };

    // Cache the response in Redis (graceful degradation on failure)
    try {
      await setWithExpiry(cacheKey, responseData, cacheExpiry);
      console.log(`[Merged Games] ✅ Cached response in Redis (TTL: ${cacheExpiry}s, key: ${cacheKey})`);
    } catch (error: any) {
      console.warn('[Merged Games] ⚠️ Redis cache write failed, continuing without caching:', error.message);
    }

    res.json(responseData);

  } catch (error) {
    console.error('Merged games fetch error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch games',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/odds/:sport
 * Get odds for a specific sport with BKS estimates
 *
 * @param sport - Sport key (americanfootball_nfl, basketball_nba, baseball_mlb, icehockey_nhl, soccer_epl)
 * @returns Transformed odds data with BKS estimates
 */
router.get('/:sport', oddsRateLimiter, async (req: Request, res: Response) => {
  try {
    const sport = req.params.sport as string;

    // Validate sport parameter
    if (!Object.keys(SUPPORTED_SPORTS).includes(sport)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sport',
        message: `Sport must be one of: ${Object.keys(SUPPORTED_SPORTS).join(', ')}`,
        supported_sports: Object.keys(SUPPORTED_SPORTS)
      });
    }

    // Fetch odds from service (uses cache if available)
    const sportKey = sport as SupportedSportKey;
    const sportValue = SUPPORTED_SPORTS[sportKey] as SupportedSportValue;

    let oddsData;
    let cached = false;

    try {
      const service = getOddsService();
      oddsData = await service.fetchOdds(sportKey);

      // Check if data came from cache by attempting to get cached version
      const cachedCheck = await (service as any).getCachedOdds(`${sportKey}_h2h,spreads,totals`);
      cached = !!cachedCheck;
    } catch (error: any) {
      if (error.message === 'Daily quota exceeded') {
        return res.status(429).json({
          success: false,
          error: 'Quota exceeded',
          message: 'Daily API quota has been exceeded. Please try again tomorrow.',
          quota_remaining: 0
        });
      }
      throw error;
    }

    // Capture opening odds for new games (async, non-blocking)
    Promise.all(oddsData.map(game => captureOpeningOdds(game)))
      .catch(err => console.error('Error capturing opening odds:', err));

    // Transform games with BKS estimates
    const transformedGames = oddsData.map(transformGameWithBKS);

    // Sort by commence_time (earliest first)
    transformedGames.sort((a, b) =>
      new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );

    // Get quota info (this is a rough estimate from last API call)
    // In production, you'd query api_quota_tracking table
    const quotaInfo = await getQuotaInfo();

    res.json({
      success: true,
      data: transformedGames,
      cached,
      quota_remaining: quotaInfo.remaining,
      sport: sportValue,
      sport_key: sportKey,
      total_games: transformedGames.length
    });

  } catch (error) {
    console.error('Odds fetch error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch odds',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/odds/upcoming
 * Get next 8 upcoming games across ALL supported sports
 * Sorted by commence_time (earliest first)
 *
 * @returns Next 8 games with BKS estimates
 */
router.get('/upcoming/all', oddsRateLimiter, async (req: Request, res: Response) => {
  try {
    const allGames: any[] = [];
    let cached = true;
    const service = getOddsService();

    // Fetch from all sports
    for (const [sportKey, sportValue] of Object.entries(SUPPORTED_SPORTS)) {
      try {
        const oddsData = await service.fetchOdds(sportKey);

        // Capture opening odds for new games (async, non-blocking)
        Promise.all(oddsData.map(game => captureOpeningOdds(game)))
          .catch(err => console.error(`Error capturing opening odds for ${sportKey}:`, err));

        // Transform and add sport identifier
        const transformedGames = oddsData.map((game: any) => ({
          ...transformGameWithBKS(game),
          sport_display: sportValue
        }));

        allGames.push(...transformedGames);

        // Check if any data came from live API (not cache)
        const cachedCheck = await (service as any).getCachedOdds(`${sportKey}_h2h,spreads,totals`);
        if (!cachedCheck) cached = false;

      } catch (error: any) {
        console.error(`Error fetching ${sportValue}:`, error);
        // Continue with other sports even if one fails
        if (error.message !== 'Daily quota exceeded') {
          continue;
        }
      }
    }

    // Sort by commence_time
    allGames.sort((a, b) =>
      new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    );

    // Take next 8 games
    const upcomingGames = allGames.slice(0, 8);

    const quotaInfo = await getQuotaInfo();

    res.json({
      success: true,
      data: upcomingGames,
      cached,
      quota_remaining: quotaInfo.remaining,
      total_available: allGames.length,
      showing: upcomingGames.length
    });

  } catch (error) {
    console.error('Upcoming games fetch error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming games',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * Helper function to get quota information
 */
async function getQuotaInfo(): Promise<{ remaining: number; total: number }> {
  try {
    const service = getOddsService();
    const hasQuota = await service.checkQuota();
    // This is a simplified version - in production you'd query the DB
    // For now, return a placeholder
    return {
      remaining: hasQuota ? 500 : 0,
      total: 667
    };
  } catch (error) {
    return {
      remaining: 0,
      total: 667
    };
  }
}

export default router;
