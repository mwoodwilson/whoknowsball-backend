/**
 * GameCreationJob - Creates and maintains games table using API-Sports
 *
 * ARCHITECTURE:
 * - API-Sports is the PRIMARY source for all game data
 * - Creates games with API-Sports game IDs as primary keys
 * - Fetches games from 7 days ago to 14 days in future
 * - Never deletes games (ensures bet settlement works for old games)
 * - Runs daily at 2 AM + on app startup
 *
 * KEY BENEFITS:
 * - Single source of truth for game data
 * - Direct ID matching in ScoresJob (no team name issues)
 * - Historical game support for old bet settlement
 */

import { getSupabase } from '../../config/supabase';
import APISportsService from '../APISportsService';

const SUPPORTED_SPORTS = [
  'americanfootball_nfl',
  'basketball_nba',
  'icehockey_nhl',
];

export class GameCreationJob {
  private apiSportsService: typeof APISportsService;

  constructor() {
    this.apiSportsService = APISportsService;
  }

  async run() {
    console.log('[GameCreationJob] 🎮 Starting game creation/update cycle');
    const startTime = Date.now();

    for (const sportKey of SUPPORTED_SPORTS) {
      await this.syncSportGames(sportKey);

      // Rate limit between sports (API-Sports quota management)
      if (SUPPORTED_SPORTS.indexOf(sportKey) < SUPPORTED_SPORTS.length - 1) {
        await this.sleep(2000); // 2 second delay
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[GameCreationJob] ✅ Completed game creation/update cycle in ${duration}s`);
  }

  async syncSportGames(sportKey: string) {
    try {
      console.log(`[GameCreationJob] 📡 Syncing ${sportKey} games`);

      // Get season for API-Sports (NBA uses start year, others use current year)
      const season = this.apiSportsService.getCurrentSeason(sportKey);

      // QUOTA FIX: Reduce from 21 days to 4 days (saves 80% of quota)
      // STALE GAME FIX: Lookback=1 to catch games from yesterday that need status updates
      const lookbackDays = 1;  // Look back 1 day to update yesterday's completed games
      const forwardDays = 3;   // Was 14 (only need 3 days ahead for betting)
      const dates: string[] = [];

      for (let i = -lookbackDays; i <= forwardDays; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }

      let totalGamesProcessed = 0;
      let createdCount = 0;
      let updatedCount = 0;

      for (const date of dates) {
        try {
          // Fetch games from API-Sports with season parameter
          const games = await this.apiSportsService.fetchGames(sportKey, date, season);

          if (!games || games.length === 0) continue;

          for (const apiGame of games) {
            // Normalize API structure (NFL/NCAAF nested, NHL/NBA flat)
            const gameData = (apiGame as any).game || apiGame;

            // Use transformGame for normalization + pass raw game for additional data
            const normalizedGame = this.apiSportsService.transformGame(apiGame, sportKey);
            const result = await this.upsertGame(normalizedGame, gameData.id, apiGame);

            if (result === 'created') createdCount++;
            else if (result === 'updated') updatedCount++;

            totalGamesProcessed++;
          }

          // Small delay between date batches to respect API limits
          await this.sleep(500);
        } catch (error: any) {
          console.error(`[GameCreationJob] ❌ Error fetching games for ${sportKey} on ${date}:`, error.message);
          continue;
        }
      }

      console.log(`[GameCreationJob] ✅ ${sportKey}: ${totalGamesProcessed} total (${createdCount} created, ${updatedCount} updated)`);
    } catch (error: any) {
      console.error(`[GameCreationJob] ❌ Failed to sync ${sportKey}:`, error.message);
    }
  }

  async upsertGame(normalizedGame: any, apiSportsGameId: number, rawApiGame: any): Promise<'created' | 'updated' | 'error'> {
    try {
      // API-Sports game ID is the primary key
      const gameId = String(apiSportsGameId);

      // Check if game already exists
      const { data: existingGame } = await getSupabase()
        .from('games')
        .select('id')
        .eq('id', gameId)
        .single();

      const isUpdate = !!existingGame;

      // Normalize API structure (NFL/NCAAF nested, NHL/NBA flat)
      const gameData = (rawApiGame as any).game || rawApiGame;

      // Construct commence_time from API-Sports response
      let commenceTime: string;

      if (gameData.timestamp) {
        // Primary: Use Unix timestamp (seconds -> milliseconds)
        commenceTime = new Date(gameData.timestamp * 1000).toISOString();
      } else if (typeof gameData.date === 'object' && gameData.date.date && gameData.date.time) {
        // NFL nested structure: { date: { date: "2025-11-16", time: "14:30" } }
        commenceTime = new Date(gameData.date.date + 'T' + gameData.date.time + ':00Z').toISOString();
      } else if (gameData.date && gameData.time) {
        // NHL flat structure: { date: "2025-11-16", time: "14:30" }
        commenceTime = new Date(gameData.date + 'T' + gameData.time + ':00Z').toISOString();
      } else {
        console.error(`[GameCreationJob] ❌ Missing date/time for game ${gameId}:`, {
          gameId: gameData.id,
          date: gameData.date,
          time: gameData.time,
          timestamp: gameData.timestamp,
          homeTeam: normalizedGame.homeTeam,
          awayTeam: normalizedGame.awayTeam
        });
        return 'error';
      }

      // Build game record for database from normalized game + raw API data
      const dbGameRecord = {
        id: gameId,
        sport_key: normalizedGame.sport,
        home_team: normalizedGame.homeTeam,
        away_team: normalizedGame.awayTeam,
        commence_time: commenceTime,
        completed: normalizedGame.completed,
        status: normalizedGame.completed ? 'completed' : (normalizedGame.status === 'live' ? 'live' : 'upcoming'),
        home_score: normalizedGame.homeScore,
        away_score: normalizedGame.awayScore,
      };

      // Upsert game (insert or update if exists)
      const { error } = await getSupabase()
        .from('games')
        .upsert(dbGameRecord, {
          onConflict: 'id',
          ignoreDuplicates: false // Always update existing games
        });

      if (error) {
        console.error(`[GameCreationJob] ❌ Failed to upsert game ${gameId}:`, error);
        return 'error';
      }

      return isUpdate ? 'updated' : 'created';
    } catch (error: any) {
      console.error('[GameCreationJob] ❌ Error in upsertGame:', {
        message: error.message,
        gameId: String(apiSportsGameId),
        homeTeam: normalizedGame?.homeTeam,
        awayTeam: normalizedGame?.awayTeam,
        timestamp: rawApiGame?.timestamp,
        stack: error.stack?.split('\n')[0]
      });
      return 'error';
    }
  }

  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default GameCreationJob;
