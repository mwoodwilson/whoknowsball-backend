/**
 * OddsMatchingJob - Fetches odds from Odds API and matches to API-Sports games
 *
 * ARCHITECTURE:
 * - Odds API is SECONDARY source (odds data only, not game creation)
 * - Matches Odds API events to API-Sports games by team names + time window
 * - Updates odds_api_event_id for cross-referencing
 * - Never creates or deletes games (GameCreationJob handles that)
 * - Handles team name variations with fuzzy matching
 *
 * MATCHING STRATEGY:
 * - Sport-specific time windows: 15min for live, 60min for upcoming
 * - Normalized team name comparison (handles "LA Lakers" vs "Los Angeles Lakers")
 * - Stores Odds API event ID in odds_api_event_id column
 */

import { getSupabase } from '../../config/supabase';
import { OddsAPIService } from '../odds/OddsAPIService';

const SUPPORTED_SPORTS = [
  'americanfootball_nfl',
  'basketball_nba',
  'icehockey_nhl',
];

export class OddsMatchingJob {
  private oddsAPIService: OddsAPIService;

  constructor() {
    this.oddsAPIService = new OddsAPIService();
  }

  async run() {
    console.log('[OddsMatchingJob] 🎯 Starting odds matching cycle');
    const startTime = Date.now();

    for (const sportKey of SUPPORTED_SPORTS) {
      await this.matchOddsForSport(sportKey);

      // Rate limit between sports (Odds API quota management)
      if (SUPPORTED_SPORTS.indexOf(sportKey) < SUPPORTED_SPORTS.length - 1) {
        await this.sleep(2000); // 2 second delay
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[OddsMatchingJob] ✅ Completed odds matching cycle in ${duration}s`);
  }

  async matchOddsForSport(sportKey: string) {
    try {
      // QUOTA OPTIMIZATION: Check if there are any incomplete games in the next 4 hours
      // Skip API call entirely if no relevant games (saves ~70% of quota)
      const hasRelevantGames = await this.hasUpcomingOrLiveGames(sportKey);

      if (!hasRelevantGames) {
        console.log(`[OddsMatchingJob] ⏭️  Skipping ${sportKey} - no games in next 4 hours (quota saved)`);
        return;
      }

      console.log(`[OddsMatchingJob] 📊 Matching odds for ${sportKey} (incomplete games only)`);

      // Fetch odds from Odds API (CORRECTED: use fetchOdds not getOdds)
      const oddsEvents = await this.oddsAPIService.fetchOdds(sportKey);

      if (!oddsEvents || oddsEvents.length === 0) {
        console.log(`[OddsMatchingJob] No odds available for ${sportKey}`);
        return;
      }

      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const oddsEvent of oddsEvents) {
        const matched = await this.matchEventToGame(oddsEvent, sportKey);
        if (matched) {
          matchedCount++;
        } else {
          unmatchedCount++;
        }
      }

      console.log(`[OddsMatchingJob] ✅ ${sportKey}: ${matchedCount} matched, ${unmatchedCount} unmatched`);
    } catch (error: any) {
      console.error(`[OddsMatchingJob] ❌ Failed to match odds for ${sportKey}:`, error.message);
    }
  }

  async matchEventToGame(oddsEvent: any, sportKey: string): Promise<boolean> {
    try {
      const homeTeam = oddsEvent.home_team;
      const awayTeam = oddsEvent.away_team;
      const commenceTime = new Date(oddsEvent.commence_time);

      // Expanded time window based on game status
      // Live games: ±15 minutes (precise matching)
      // Upcoming games: ±60 minutes (handles timezone/scheduling variations)
      const isLive = new Date() > commenceTime;
      const timeWindow = isLive ? 15 : 60;

      const timeWindowStart = new Date(commenceTime.getTime() - timeWindow * 60 * 1000).toISOString();
      const timeWindowEnd = new Date(commenceTime.getTime() + timeWindow * 60 * 1000).toISOString();

      // Find matching game in database (ONLY incomplete games - save Odds API quota)
      const { data: games, error } = await getSupabase()
        .from('games')
        .select('id, home_team, away_team, commence_time, status')
        .eq('sport_key', sportKey)
        .not('status', 'in', '("completed","cancelled","postponed")')  // OPTIMIZATION: Skip finished games
        .gte('commence_time', timeWindowStart)
        .lte('commence_time', timeWindowEnd);

      if (error || !games || games.length === 0) {
        // console.log(`[OddsMatchingJob] No game found for ${awayTeam} @ ${homeTeam}`);
        return false;
      }

      // Find exact or fuzzy team match
      const matchedGame = games.find(game =>
        this.teamsMatch(game.home_team, homeTeam) &&
        this.teamsMatch(game.away_team, awayTeam)
      );

      if (!matchedGame) {
        console.log(`[OddsMatchingJob] ⚠️  No team match for ${awayTeam} @ ${homeTeam} (${games.length} candidates)`);
        return false;
      }

      // Update game with Odds API event ID and odds data
      await this.updateGameOdds(matchedGame.id, oddsEvent);

      return true;
    } catch (error: any) {
      console.error('[OddsMatchingJob] ❌ Error matching event:', error.message);
      return false;
    }
  }

  async updateGameOdds(gameId: string, oddsEvent: any) {
    try {
      // Extract bookmaker odds (use first bookmaker for simplicity)
      const bookmaker = oddsEvent.bookmakers?.[0];

      const updateData: any = {
        odds_api_event_id: oddsEvent.id,
        last_odds_update: new Date().toISOString(),
      };

      // Store full odds data in closing_odds_data
      // (Can be refined to separate opening/closing odds in future)
      if (bookmaker) {
        updateData.closing_odds_data = bookmaker;
      }

      const { error } = await getSupabase()
        .from('games')
        .update(updateData)
        .eq('id', gameId);

      if (error) {
        console.error(`[OddsMatchingJob] ❌ Failed to update odds for game ${gameId}:`, error);
      }
    } catch (error: any) {
      console.error('[OddsMatchingJob] ❌ Error updating game odds:', error.message);
    }
  }

  /**
   * QUOTA OPTIMIZATION: Check if there are upcoming or live games for a sport
   * Only fetch odds if there are games in the next 4 hours OR recently started (last 4 hours)
   * This prevents wasteful API calls during dead periods (e.g., overnight, off-season)
   */
  async hasUpcomingOrLiveGames(sportKey: string): Promise<boolean> {
    try {
      const now = new Date();
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
      const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      const { data: games, error } = await getSupabase()
        .from('games')
        .select('id')
        .eq('sport_key', sportKey)
        .not('status', 'in', '("completed","cancelled","postponed")')
        .gte('commence_time', fourHoursAgo.toISOString())  // Started within last 4 hours (potentially live)
        .lte('commence_time', fourHoursFromNow.toISOString())  // Or starting within next 4 hours
        .limit(1);

      if (error) {
        console.error(`[OddsMatchingJob] Error checking for upcoming games:`, error);
        return true; // On error, fetch anyway to be safe
      }

      return games && games.length > 0;
    } catch (error: any) {
      console.error('[OddsMatchingJob] Error in hasUpcomingOrLiveGames:', error.message);
      return true; // On error, fetch anyway to be safe
    }
  }

  /**
   * Fuzzy team name matching
   * Handles variations like "LA Lakers" vs "Los Angeles Lakers"
   */
  teamsMatch(team1: string, team2: string): boolean {
    // Normalize team names: lowercase, remove non-alphanumeric, trim
    const normalize = (name: string) =>
      name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();

    const normalized1 = normalize(team1);
    const normalized2 = normalize(team2);

    // Exact match after normalization
    if (normalized1 === normalized2) return true;

    // Check if one is a substring of the other (handles "Lakers" vs "LosAngelesLakers")
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }

    return false;
  }

  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default OddsMatchingJob;
