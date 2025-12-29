import { createClient } from '@supabase/supabase-js';
import { OddsAPIService } from './OddsAPIService';

/**
 * ClosingOddsCapture Service
 *
 * Captures closing odds at T-30 seconds before game start for accurate CLV calculation.
 * Stores complete odds snapshot including all bookmakers and markets.
 */

interface ClosingOddsSnapshot {
  captured_at: string;
  capture_window_seconds: number;
  bookmakers: any[];
  primary_odds: {
    home_american?: number;
    away_american?: number;
    draw_american?: number;
  };
}

interface Game {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  closing_odds_captured: boolean;
}

export class ClosingOddsCapture {
  private supabase: ReturnType<typeof createClient>;
  private oddsService: OddsAPIService;
  private readonly CAPTURE_WINDOW_START = 40; // seconds before game
  private readonly CAPTURE_WINDOW_END = 30; // seconds before game
  private readonly LOOKAHEAD_MINUTES = 5; // Look for games starting in next 5 minutes
  private capturedGames: Set<string> = new Set(); // In-memory tracking to prevent duplicates

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.oddsService = new OddsAPIService();
  }

  /**
   * Main entry point - polls for games needing closing odds capture
   */
  async scheduleCaptures(): Promise<void> {
    try {
      // Get games starting soon that need closing odds
      const games = await this.getUpcomingGames();

      if (games.length === 0) {
        // No games to capture (this is normal most of the time)
        return;
      }

      console.log(`[ClosingOdds] Found ${games.length} games to check for capture window`);

      // Check each game and capture if in window
      for (const game of games) {
        try {
          await this.processGame(game);
        } catch (error) {
          console.error(`[ClosingOdds] Error processing game ${game.id}:`, error);
          // Continue with other games even if one fails
        }
      }
    } catch (error) {
      console.error('[ClosingOdds] Error in scheduleCaptures:', error);
    }
  }

  /**
   * Get games starting in the next LOOKAHEAD_MINUTES that don't have closing odds yet
   */
  private async getUpcomingGames(): Promise<Game[]> {
    const now = new Date();
    const lookAhead = new Date(now.getTime() + this.LOOKAHEAD_MINUTES * 60 * 1000);

    const { data, error } = await this.supabase
      .from('games')
      .select('id, sport_key, commence_time, home_team, away_team')
      .gte('commence_time', now.toISOString())
      .lte('commence_time', lookAhead.toISOString())
      .eq('status', 'upcoming');

    if (error) {
      console.error('[ClosingOdds] Error fetching upcoming games:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Process a single game - check if in capture window and capture if needed
   */
  private async processGame(game: Game): Promise<void> {
    const commenceTime = new Date(game.commence_time);
    const now = new Date();

    // Check if we're in the capture window
    if (!this.isWithinCaptureWindow(commenceTime, now)) {
      return; // Not time yet
    }

    // Skip if already captured (in-memory check for performance)
    if (this.capturedGames.has(game.id)) {
      return;
    }

    // Check database to see if already captured
    const { data: existingGame } = await this.supabase
      .from('games')
      .select('id')
      .eq('id', game.id)
      .not('closing_odds_data', 'is', null)
      .single();

    if (existingGame) {
      console.log(`[ClosingOdds] Game ${game.id} already has closing odds, skipping`);
      this.capturedGames.add(game.id);
      return;
    }

    // We're in the window and haven't captured yet - do it now!
    console.log(`[ClosingOdds] Capturing closing odds for ${game.home_team} vs ${game.away_team} (${game.sport_key})`);

    try {
      await this.captureClosingOdds(game.id, game.sport_key);
      this.capturedGames.add(game.id);
    } catch (error) {
      console.error(`[ClosingOdds] Failed to capture for game ${game.id}:`, error);

      // Retry once
      console.log(`[ClosingOdds] Retrying capture for game ${game.id}...`);
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        await this.captureClosingOdds(game.id, game.sport_key);
        this.capturedGames.add(game.id);
      } catch (retryError) {
        console.error(`[ClosingOdds] Retry failed for game ${game.id}:`, retryError);
      }
    }
  }

  /**
   * Check if current time is within the capture window (30-40 seconds before commence)
   */
  isWithinCaptureWindow(commenceTime: Date, now: Date = new Date()): boolean {
    const secondsUntilCommence = (commenceTime.getTime() - now.getTime()) / 1000;

    return secondsUntilCommence >= this.CAPTURE_WINDOW_END &&
           secondsUntilCommence <= this.CAPTURE_WINDOW_START;
  }

  /**
   * Capture closing odds for a specific game
   */
  async captureClosingOdds(gameId: string, sportKey: string): Promise<void> {
    // Check quota before making API call
    const hasQuota = await this.oddsService.checkQuota();
    if (!hasQuota) {
      console.warn('[ClosingOdds] Daily quota exceeded, skipping capture');
      throw new Error('Daily quota exceeded');
    }

    // Fetch current odds from API
    const oddsData = await this.oddsService.fetchOdds(sportKey);

    // Find the specific game in the response
    const gameOdds = oddsData.find((game: any) => game.id === gameId);

    if (!gameOdds) {
      console.warn(`[ClosingOdds] Game ${gameId} not found in odds response`);
      throw new Error(`Game ${gameId} not found in odds API response`);
    }

    // Extract primary odds (best available from first bookmaker with h2h market)
    const primaryOdds = this.extractPrimaryOdds(gameOdds);

    // Create snapshot
    const snapshot: ClosingOddsSnapshot = {
      captured_at: new Date().toISOString(),
      capture_window_seconds: this.CAPTURE_WINDOW_END,
      bookmakers: gameOdds.bookmakers,
      primary_odds: primaryOdds
    };

    // Store in database
    await this.storeSnapshot(gameId, snapshot);

    console.log(`[ClosingOdds] ✅ Captured closing odds for game ${gameId}`);
  }

  /**
   * Extract primary odds from game odds data
   * Uses the first bookmaker's h2h market as primary
   */
  private extractPrimaryOdds(gameOdds: any): ClosingOddsSnapshot['primary_odds'] {
    const primaryOdds: ClosingOddsSnapshot['primary_odds'] = {};

    // Try to get h2h market from first bookmaker
    if (gameOdds.bookmakers && gameOdds.bookmakers.length > 0) {
      const bookmaker = gameOdds.bookmakers[0];
      const h2hMarket = bookmaker.markets?.find((m: any) => m.key === 'h2h');

      if (h2hMarket && h2hMarket.outcomes) {
        for (const outcome of h2hMarket.outcomes) {
          if (outcome.name === gameOdds.home_team) {
            primaryOdds.home_american = outcome.price;
          } else if (outcome.name === gameOdds.away_team) {
            primaryOdds.away_american = outcome.price;
          } else {
            // Might be draw for 3-way markets
            primaryOdds.draw_american = outcome.price;
          }
        }
      }
    }

    return primaryOdds;
  }

  /**
   * Store closing odds snapshot in database
   */
  async storeSnapshot(gameId: string, snapshot: ClosingOddsSnapshot): Promise<void> {
    const { error } = await this.supabase
      .from('games')
      .update({
        closing_odds_data: snapshot,
        last_odds_update: new Date().toISOString()
      })
      .eq('id', gameId);

    if (error) {
      console.error(`[ClosingOdds] Error storing snapshot for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Clear in-memory cache of captured games (useful for testing or long-running processes)
   */
  clearCache(): void {
    this.capturedGames.clear();
    console.log('[ClosingOdds] Cache cleared');
  }

  /**
   * Get statistics about captured games
   */
  async getStats(): Promise<{
    total_games: number;
    with_closing_odds: number;
    capture_rate: number;
  }> {
    const { data: allGames, count: totalCount } = await this.supabase
      .from('games')
      .select('id', { count: 'exact' })
      .eq('status', 'upcoming');

    const { data: capturedGames, count: capturedCount } = await this.supabase
      .from('games')
      .select('id', { count: 'exact' })
      .eq('status', 'upcoming')
      .not('closing_odds_data', 'is', null);

    const total = totalCount || 0;
    const captured = capturedCount || 0;
    const rate = total > 0 ? (captured / total) * 100 : 0;

    return {
      total_games: total,
      with_closing_odds: captured,
      capture_rate: Math.round(rate * 10) / 10
    };
  }
}
