import { createClient } from '@supabase/supabase-js';
import { isLegacyHashId } from '../../utils/gameIdValidation';

/**
 * StaleGameDetectionJob
 *
 * PURPOSE: Detect games that should have been settled but haven't, preventing stale bets.
 *
 * This job runs every 2 hours to:
 * 1. Find games past their expected end time but not marked completed
 * 2. Identify games with pending bets that are stuck
 * 3. Alert about legacy hash ID games that cannot be updated by ScoresJob
 * 4. Log issues for manual review
 *
 * CONTEXT:
 * - ScoresJob can only update games with API-Sports integer IDs
 * - Legacy hash ID games (32 hex chars) from Odds API cannot be settled automatically
 * - This job catches any games that slip through the cracks
 *
 * Usage:
 *   const job = new StaleGameDetectionJob();
 *   job.start();
 *   // Later...
 *   job.stop();
 */

interface StaleGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  status: string;
  completed: boolean;
  home_score: number | null;
  away_score: number | null;
  sport_key: string;
  pending_bet_count: number;
  is_legacy_hash_id: boolean;
  hours_since_start: number;
}

export class StaleGameDetectionJob {
  private supabase: ReturnType<typeof createClient> | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private readonly INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

  // Expected game durations by sport (in hours)
  private readonly GAME_DURATIONS: Record<string, number> = {
    'americanfootball_nfl': 4,
    'americanfootball_ncaaf': 4,
    'basketball_nba': 3,
    'basketball_ncaab': 3,
    'icehockey_nhl': 3,
    'baseball_mlb': 4,
    'soccer_epl': 2.5,
    'soccer_usa_mls': 2.5,
  };

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('[StaleGameDetectionJob] Already running');
      return;
    }

    console.log('[StaleGameDetectionJob] Starting job (runs every 2 hours)');

    // Run immediately on start
    this.runCheck();

    // Then run every 2 hours
    this.intervalId = setInterval(() => {
      this.runCheck();
    }, this.INTERVAL_MS);

    this.isRunning = true;
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[StaleGameDetectionJob] Stopped');
  }

  /**
   * Run the stale game detection check
   */
  async runCheck(): Promise<void> {
    console.log('[StaleGameDetectionJob] Running stale game detection...');

    try {
      const staleGames = await this.findStaleGames();

      if (staleGames.length === 0) {
        console.log('[StaleGameDetectionJob] No stale games found');
        return;
      }

      console.log(`[StaleGameDetectionJob] Found ${staleGames.length} potentially stale games:`);

      // Categorize by issue type
      const legacyHashGames = staleGames.filter(g => g.is_legacy_hash_id);
      const noScoresGames = staleGames.filter(g => !g.is_legacy_hash_id && g.home_score === null);
      const notCompletedGames = staleGames.filter(g => !g.is_legacy_hash_id && !g.completed && g.home_score !== null);
      const gamesWithPendingBets = staleGames.filter(g => g.pending_bet_count > 0);

      // Log legacy hash ID games (critical - cannot be auto-settled)
      if (legacyHashGames.length > 0) {
        console.error('[StaleGameDetectionJob] CRITICAL: Legacy hash ID games detected (cannot be auto-settled):');
        for (const game of legacyHashGames) {
          console.error(`  - ${game.away_team} @ ${game.home_team} (${game.id})`);
          console.error(`    Sport: ${game.sport_key}, Started: ${game.hours_since_start.toFixed(1)}h ago`);
          if (game.pending_bet_count > 0) {
            console.error(`    WARNING: ${game.pending_bet_count} pending bets will be stuck!`);
          }
        }
      }

      // Log games missing scores
      if (noScoresGames.length > 0) {
        console.warn('[StaleGameDetectionJob] Games missing scores:');
        for (const game of noScoresGames) {
          console.warn(`  - ${game.away_team} @ ${game.home_team} (${game.id})`);
          console.warn(`    Sport: ${game.sport_key}, Status: ${game.status}, Started: ${game.hours_since_start.toFixed(1)}h ago`);
          if (game.pending_bet_count > 0) {
            console.warn(`    Pending bets: ${game.pending_bet_count}`);
          }
        }
      }

      // Log games with scores but not marked completed
      if (notCompletedGames.length > 0) {
        console.warn('[StaleGameDetectionJob] Games with scores but not marked completed:');
        for (const game of notCompletedGames) {
          console.warn(`  - ${game.away_team} @ ${game.home_team} (${game.id})`);
          console.warn(`    Score: ${game.away_score}-${game.home_score}, Status: ${game.status}`);
          console.warn(`    completed flag is FALSE - SettlementJob will skip this!`);
        }
      }

      // Summary for games affecting bets
      if (gamesWithPendingBets.length > 0) {
        const totalPendingBets = gamesWithPendingBets.reduce((sum, g) => sum + g.pending_bet_count, 0);
        console.error(`[StaleGameDetectionJob] ALERT: ${totalPendingBets} bets are stuck across ${gamesWithPendingBets.length} games!`);
      }

    } catch (error) {
      console.error('[StaleGameDetectionJob] Error during check:', error);
    }
  }

  /**
   * Find games that should have ended but appear stuck
   */
  private async findStaleGames(): Promise<StaleGame[]> {
    if (!this.supabase) {
      throw new Error('Supabase not initialized');
    }

    // Calculate cutoff times for each sport
    // A game is "stale" if it started more than (game_duration + 2 buffer hours) ago and isn't completed
    const now = new Date();

    // Get games that started more than 6 hours ago (conservative baseline) and are not completed
    const cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

    const { data: games, error } = await this.supabase
      .from('games')
      .select('id, home_team, away_team, commence_time, status, completed, home_score, away_score, sport_key')
      .eq('completed', false)
      .lt('commence_time', cutoffTime)
      .order('commence_time', { ascending: true });

    if (error) {
      console.error('[StaleGameDetectionJob] Error fetching games:', error);
      return [];
    }

    if (!games || games.length === 0) {
      return [];
    }

    // For each game, check if it has pending bets
    const staleGames: StaleGame[] = [];

    for (const game of games) {
      const hoursSinceStart = (now.getTime() - new Date(game.commence_time).getTime()) / (1000 * 60 * 60);
      const expectedDuration = this.GAME_DURATIONS[game.sport_key] || 4; // Default 4 hours

      // Only flag as stale if past expected duration + 2 hour buffer
      if (hoursSinceStart < expectedDuration + 2) {
        continue;
      }

      // Count pending bets for this game
      const { count: betCount } = await this.supabase
        .from('bets')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', game.id)
        .eq('status', 'PENDING');

      // Also check parlay legs
      const { count: parlayLegCount } = await this.supabase
        .from('parlay_legs')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', game.id)
        .eq('status', 'PENDING');

      const totalPendingBets = (betCount || 0) + (parlayLegCount || 0);

      staleGames.push({
        id: game.id,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: game.commence_time,
        status: game.status,
        completed: game.completed,
        home_score: game.home_score,
        away_score: game.away_score,
        sport_key: game.sport_key,
        pending_bet_count: totalPendingBets,
        is_legacy_hash_id: isLegacyHashId(game.id),
        hours_since_start: hoursSinceStart
      });
    }

    return staleGames;
  }

  /**
   * Run once (for manual/script use)
   */
  async run(): Promise<void> {
    await this.runCheck();
  }

  /**
   * Get job status
   */
  getStatus(): { isRunning: boolean; intervalMs: number } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.INTERVAL_MS
    };
  }
}

// Singleton instance for use across the application
let staleGameJobInstance: StaleGameDetectionJob | null = null;

export function getStaleGameDetectionJob(): StaleGameDetectionJob {
  if (!staleGameJobInstance) {
    staleGameJobInstance = new StaleGameDetectionJob();
  }
  return staleGameJobInstance;
}

// Convenience export for backward compatibility
export const staleGameDetectionJob = {
  start: () => getStaleGameDetectionJob().start(),
  stop: () => getStaleGameDetectionJob().stop(),
  run: () => getStaleGameDetectionJob().run(),
  getStatus: () => getStaleGameDetectionJob().getStatus()
};
