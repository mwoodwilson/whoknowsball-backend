/**
 * GameSyncJob - 3-Tier Smart Polling System (Matches Odds API Exactly)
 *
 * WHY: Bet placement validation requires games to exist in Supabase games table.
 * Games are fetched from Odds API and cached in Redis, but not persisted to database.
 * This job ensures games table stays current for proper bet validation.
 *
 * 3-TIER POLLING STRATEGY (matches Odds API refresh rates):
 * - Tier 1 - Live games: Poll every 30 seconds (matches ScoresJob/OddsMatchingJob)
 * - Tier 2 - Upcoming games (<6 hours): Poll every 60 seconds (matches Odds API pre-match rate)
 * - Tier 3 - Distant games (6+ hours): Poll every 15 minutes (quota-efficient)
 *
 * QUOTA IMPACT: ~17,800 requests/month (stays within 20k limit)
 * Peak Sunday: ~1,329 requests (3 sports live × 3.5 hrs)
 * Normal day: ~480 requests
 */

import { getSupabase } from '../../config/supabase';
import { OddsAPIService } from '../odds/OddsAPIService';

interface OddsAPIGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface GameClassification {
  liveSports: Set<string>;      // Sports with games that commenced && !completed
  upcomingSports: Set<string>;  // Sports with games starting <6 hours
  distantSports: Set<string>;   // Sports with games starting >6 hours
}

class GameSyncJob {
  private oddsService: OddsAPIService | null = null;
  private sports = [
    'americanfootball_nfl',
    'basketball_nba',
    'baseball_mlb',
    'icehockey_nhl',
    'americanfootball_ncaaf'
  ];

  // Track last poll time per tier for conditional polling
  private lastLivePoll: number = 0;
  private lastUpcomingPoll: number = 0;
  private lastDistantPoll: number = 0;

  // Polling intervals (milliseconds) matching Odds API rates
  private readonly LIVE_INTERVAL = 30 * 1000;     // 30 seconds (matches ScoresJob/OddsMatchingJob)
  private readonly UPCOMING_INTERVAL = 60 * 1000;  // 60 seconds (Odds API pre-match rate)
  private readonly DISTANT_INTERVAL = 15 * 60 * 1000; // 15 minutes (quota-efficient)

  constructor() {
    // Defer initialization until job runs
  }

  private getOddsService() {
    if (!this.oddsService) {
      this.oddsService = new OddsAPIService();
    }
    return this.oddsService;
  }

  private getSupabaseClient() {
    return getSupabase();
  }

  /**
   * Determine game status based on commence_time and sport-specific duration
   * - upcoming: game hasn't started yet
   * - live: game started within sport-specific threshold
   * - completed: game started beyond sport-specific threshold
   *
   * Sport-specific thresholds (hours):
   * - NFL: 3.5 hours (most games ~3-3.5 hrs)
   * - NBA: 2.5 hours (most games ~2-2.5 hrs)
   * - NHL: 2.5 hours (most games ~2-2.5 hrs)
   * - MLB: 3 hours (most games ~3 hrs)
   * - NCAAF: 3.5 hours (similar to NFL)
   * - Default: 4 hours (fallback for other sports)
   */
  private getGameStatus(commenceTime: string, sportKey: string): 'upcoming' | 'live' | 'completed' {
    const now = new Date();
    const commence = new Date(commenceTime);

    // Sport-specific game duration thresholds (in hours)
    const durationHours: Record<string, number> = {
      'americanfootball_nfl': 3.5,
      'basketball_nba': 2.5,
      'icehockey_nhl': 2.5,
      'baseball_mlb': 3,
      'americanfootball_ncaaf': 3.5
    };

    const threshold = durationHours[sportKey] || 4; // Default: 4 hours
    const thresholdTime = new Date(now.getTime() - threshold * 60 * 60 * 1000);

    if (commence > now) {
      return 'upcoming';
    } else if (commence > thresholdTime) {
      return 'live';
    } else {
      return 'completed';
    }
  }

  /**
   * Sync games for a single sport
   */
  async syncGamesForSport(sportKey: string): Promise<number> {
    try {
      console.log(`[GameSync] Fetching games for ${sportKey}...`);

      // Fetch games from Odds API
      const gamesFromAPI: OddsAPIGame[] = await this.getOddsService().fetchOdds(sportKey);

      if (!gamesFromAPI || gamesFromAPI.length === 0) {
        console.log(`[GameSync] No games found for ${sportKey}`);
        return 0;
      }

      // Transform API response to database format
      const gamesToUpsert = gamesFromAPI.map(game => ({
        id: game.id,
        sport_key: game.sport_key,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: game.commence_time,
        status: this.getGameStatus(game.commence_time, game.sport_key),
        completed: this.getGameStatus(game.commence_time, game.sport_key) === 'completed'
      }));

      console.log(`[GameSync] Sample game IDs for ${sportKey}:`, gamesToUpsert.slice(0, 3).map(g => g.id));

      // Upsert to Supabase (insert new or update existing)
      const { error } = await this.getSupabaseClient()
        .from('games')
        .upsert(gamesToUpsert, {
          onConflict: 'id',
          ignoreDuplicates: false // Always update existing games
        });

      if (error) {
        console.error(`[GameSync] Error upserting games for ${sportKey}:`, error);
        throw error;
      }

      console.log(`[GameSync] Successfully synced ${gamesToUpsert.length} games for ${sportKey}`);
      return gamesToUpsert.length;

    } catch (error: any) {
      console.error(`[GameSync] Failed to sync ${sportKey}:`, error.message);
      // Don't throw - continue with other sports
      return 0;
    }
  }

  /**
   * Classify all sports into tiers based on game timing
   * - Live: Games that commenced && !completed
   * - Upcoming: Games starting within 6 hours
   * - Distant: Games starting 6+ hours from now
   */
  private async classifyGames(): Promise<GameClassification> {
    const now = new Date();
    const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const liveSports = new Set<string>();
    const upcomingSports = new Set<string>();
    const distantSports = new Set<string>();

    // Query all games from database
    const { data: games } = await this.getSupabaseClient()
      .from('games')
      .select('sport_key, commence_time, completed');

    // Classify each sport based on its games
    for (const sport of this.sports) {
      const sportGames = games?.filter(g => g.sport_key === sport) || [];

      const hasLiveGames = sportGames.some(g =>
        new Date(g.commence_time) < now && !g.completed
      );
      const hasUpcomingGames = sportGames.some(g => {
        const commence = new Date(g.commence_time);
        return commence >= now && commence <= sixHoursFromNow;
      });
      const hasDistantGames = sportGames.some(g =>
        new Date(g.commence_time) > sixHoursFromNow
      );

      if (hasLiveGames) liveSports.add(sport);
      else if (hasUpcomingGames) upcomingSports.add(sport);
      else if (hasDistantGames) distantSports.add(sport);
    }

    console.log(`[GameSync] 🎯 Classification: ${liveSports.size} live, ${upcomingSports.size} upcoming, ${distantSports.size} distant`);
    if (liveSports.size > 0) console.log(`[GameSync] 🔴 Live sports: ${Array.from(liveSports).join(', ')}`);
    if (upcomingSports.size > 0) console.log(`[GameSync] 🟡 Upcoming sports: ${Array.from(upcomingSports).join(', ')}`);
    if (distantSports.size > 0) console.log(`[GameSync] 🟢 Distant sports: ${Array.from(distantSports).join(', ')}`);

    return { liveSports, upcomingSports, distantSports };
  }

  /**
   * Sync sports based on their tier (no delays needed - tier-based polling handles rate limiting)
   */
  private async syncSportsByTier(sports: Set<string>, tierName: string): Promise<number> {
    if (sports.size === 0) return 0;

    console.log(`[GameSync] Syncing ${tierName} sports: ${Array.from(sports).join(', ')}`);
    let totalGames = 0;

    for (const sport of sports) {
      const gamesCount = await this.syncGamesForSport(sport);
      totalGames += gamesCount;
    }

    return totalGames;
  }

  /**
   * Run the sync job with 3-tier conditional polling
   */
  async run(): Promise<void> {
    try {
      const startTime = new Date();
      const now = startTime.getTime();
      console.log(`\n🔄 [GameSync] Starting 3-tier sync check at ${startTime.toISOString()}`);

      // Classify all sports into tiers
      const { liveSports, upcomingSports, distantSports } = await this.classifyGames();

      let totalGames = 0;
      const tiersPolled: string[] = [];

      // Tier 1: Live games - poll every 30 seconds (matches Odds API in-play rate)
      if (liveSports.size > 0 && (now - this.lastLivePoll) >= this.LIVE_INTERVAL) {
        console.log(`[GameSync] ⏱️  Live tier ready (${(now - this.lastLivePoll) / 1000}s elapsed, threshold: 30s)`);
        const gamesCount = await this.syncSportsByTier(liveSports, 'LIVE');
        totalGames += gamesCount;
        this.lastLivePoll = now;
        tiersPolled.push('Live (30s)');
      } else if (liveSports.size > 0) {
        console.log(`[GameSync] ⏸️  Live tier skipped (${(now - this.lastLivePoll) / 1000}s elapsed, need 30s)`);
      }

      // Tier 2: Upcoming games (<6 hours) - poll every 60 seconds (matches Odds API pre-match rate)
      if (upcomingSports.size > 0 && (now - this.lastUpcomingPoll) >= this.UPCOMING_INTERVAL) {
        console.log(`[GameSync] ⏱️  Upcoming tier ready (${(now - this.lastUpcomingPoll) / 1000}s elapsed, threshold: 60s)`);
        const gamesCount = await this.syncSportsByTier(upcomingSports, 'UPCOMING');
        totalGames += gamesCount;
        this.lastUpcomingPoll = now;
        tiersPolled.push('Upcoming (60s)');
      } else if (upcomingSports.size > 0) {
        console.log(`[GameSync] ⏸️  Upcoming tier skipped (${(now - this.lastUpcomingPoll) / 1000}s elapsed, need 60s)`);
      }

      // Tier 3: Distant games (6+ hours) - poll every 15 minutes (quota-efficient)
      if (distantSports.size > 0 && (now - this.lastDistantPoll) >= this.DISTANT_INTERVAL) {
        console.log(`[GameSync] ⏱️  Distant tier ready (${(now - this.lastDistantPoll) / 1000}s elapsed, threshold: 15min)`);
        const gamesCount = await this.syncSportsByTier(distantSports, 'DISTANT');
        totalGames += gamesCount;
        this.lastDistantPoll = now;
        tiersPolled.push('Distant (15min)');
      } else if (distantSports.size > 0) {
        console.log(`[GameSync] ⏸️  Distant tier skipped (${(now - this.lastDistantPoll) / 1000}s elapsed, need 15min)`);
      }

      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;

      if (tiersPolled.length > 0) {
        console.log(`✅ [GameSync] Completed sync of ${totalGames} games in ${duration}s (Tiers: ${tiersPolled.join(', ')})\n`);
      } else {
        console.log(`⏭️  [GameSync] No tiers ready for polling (${duration}s)\n`);
      }

    } catch (error: any) {
      console.error('[GameSync] Job failed:', error.message);
    }
  }
}

// Export class for async initialization in index.ts
export default GameSyncJob;
