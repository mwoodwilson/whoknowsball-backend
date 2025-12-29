/**
 * API-Sports Service - HTTP client for all 4 sport-level APIs
 *
 * Provides unified interface for fetching game data from API-Sports:
 * - American Football API (NFL, NCAAF)
 * - Basketball API (NBA)
 * - Hockey API (NHL)
 * - Baseball API (MLB)
 *
 * Rate Limits: 10 requests/minute per API endpoint
 * Daily Quota: 7,500 requests/day per API (Tier 1)
 */

import axios, { AxiosInstance } from 'axios';
import { API_SPORTS_CONFIG, SPORT_KEY_TO_API_CONFIG } from '../config/apiSportsConfig';
import { quotaCircuitBreaker } from '../utils/quotaCircuitBreaker';

/**
 * API-Sports Game Response Structure
 * Structure varies slightly per sport but follows consistent pattern
 */
interface APISportsGame {
  id: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timestamp: number;
  timezone: string;
  week: string | null;
  status: {
    short: string; // FT, AOT, AP, NS, LIVE, Q1, Q2, etc.
    long: string; // Finished, After Overtime, etc.
    timer: string | null;
  };
  league: {
    id: number;
    name: string;
    type: string;
    season: string;
    logo: string;
  };
  country: {
    id: number;
    name: string;
    code: string;
    flag: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
    };
    away: {
      id: number;
      name: string;
      logo: string;
    };
  };
  scores: {
    home: {
      quarter_1?: number | null;
      quarter_2?: number | null;
      quarter_3?: number | null;
      quarter_4?: number | null;
      overtime?: number | null;
      total: number | null;
    };
    away: {
      quarter_1?: number | null;
      quarter_2?: number | null;
      quarter_3?: number | null;
      quarter_4?: number | null;
      overtime?: number | null;
      total: number | null;
    };
  };
}

/**
 * Normalized game format for internal use
 */
export interface NormalizedGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string; // API-Sports status code (FT, AOT, etc.)
  completed: boolean;
  date: string; // YYYY-MM-DD
  sport: string; // Internal sport_key
}

class APISportsService {
  private clients: Record<string, AxiosInstance> = {};

  constructor() {
    // Initialize axios clients for each sport API
    Object.entries(API_SPORTS_CONFIG).forEach(([sport, config]) => {
      const host = config.baseURL.replace('https://', '');

      this.clients[sport] = axios.create({
        baseURL: config.baseURL,
        timeout: 15000, // 15 second timeout
        headers: {
          'x-rapidapi-key': config.apiKey,
          'x-rapidapi-host': host
        }
      });
    });
  }

  /**
   * Fetch a single game by ID from API-Sports
   *
   * @param gameId - API-Sports game ID
   * @param sportKey - Internal sport key (e.g., 'americanfootball_nfl')
   * @returns API-Sports game or null if not found
   */
  async fetchGameById(gameId: string, sportKey: string): Promise<APISportsGame | null> {
    const config = this.getConfigForSportKey(sportKey);
    if (!config) {
      throw new Error(`No API-Sports config found for sport_key: ${sportKey}`);
    }

    // CIRCUIT BREAKER: Check quota before making request
    if (!quotaCircuitBreaker.canMakeRequest()) {
      throw new Error('Circuit breaker: Daily quota limit reached. Request blocked.');
    }

    try {
      const response = await this.clients[config.api].get('/games', {
        params: {
          id: gameId
        }
      });

      // Record successful request for quota tracking
      quotaCircuitBreaker.recordRequest(sportKey, `/games?id=${gameId}`);

      // API-Sports returns errors in response.data.errors array
      if (response.data.errors && Object.keys(response.data.errors).length > 0) {
        console.error(`[APISports] Error fetching game ${gameId}:`, response.data.errors);
        return null;
      }

      const games = response.data.response || [];
      return games.length > 0 ? games[0] : null;
    } catch (error: any) {
      console.error(`[APISports] ❌ Failed to fetch game ${gameId}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch games for a specific league and date
   *
   * @param sportKey - Internal sport key (e.g., 'americanfootball_nfl')
   * @param date - Date in YYYY-MM-DD format
   * @param season - Season identifier (e.g., '2024' or '2024-2025')
   * @returns Array of API-Sports games
   */
  async fetchGames(sportKey: string, date: string, season: string): Promise<APISportsGame[]> {
    const config = this.getConfigForSportKey(sportKey);
    if (!config) {
      throw new Error(`No API-Sports config found for sport_key: ${sportKey}`);
    }

    // CIRCUIT BREAKER: Check quota before making request
    if (!quotaCircuitBreaker.canMakeRequest()) {
      throw new Error('Circuit breaker: Daily quota limit reached. Request blocked.');
    }

    try {
      console.log(`[APISports] Fetching ${sportKey} games for ${date} (league: ${config.league.id}, season: ${season})`);

      const response = await this.clients[config.api].get('/games', {
        params: {
          league: config.league.id,
          season: season,
          date: date
        }
      });

      // Record successful request for quota tracking
      quotaCircuitBreaker.recordRequest(sportKey, `/games?date=${date}`);

      // API-Sports returns errors in response.data.errors array
      if (response.data.errors && Object.keys(response.data.errors).length > 0) {
        throw new Error(`API-Sports error: ${JSON.stringify(response.data.errors)}`);
      }

      const games = response.data.response || [];
      console.log(`[APISports] ✅ Retrieved ${games.length} games for ${sportKey}`);

      // Debug: Log first game structure to see available fields
      if (games.length > 0) {
        console.log(`[APISports] 📋 Sample game structure:`, JSON.stringify(games[0], null, 2).substring(0, 800));
      }

      return games;
    } catch (error: any) {
      if (error.response) {
        console.error(`[APISports] ❌ HTTP ${error.response.status} for ${sportKey}:`, error.response.data);
      } else if (error.request) {
        console.error(`[APISports] ❌ No response for ${sportKey}:`, error.message);
      } else {
        console.error(`[APISports] ❌ Request setup failed for ${sportKey}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Transform API-Sports game to normalized internal format
   *
   * @param apiSportsGame - Raw game data from API-Sports
   * @param sportKey - Internal sport key
   * @returns Normalized game data
   */
  transformGame(apiSportsGame: APISportsGame, sportKey: string): NormalizedGame {
    // Handle different API response structures:
    // - NFL/NCAAF: Nested structure with data inside `game` object
    // - NHL/NBA/MLB: Flat structure with data at root level
    const gameData = (apiSportsGame as any).game || apiSportsGame;

    // Safely get status code with fallback
    const statusCode = gameData.status?.short || 'NS';

    // Debug logging for NFL to see ALL game statuses (find live games)
    if (sportKey === 'americanfootball_nfl') {
      const hasScores = apiSportsGame.scores?.home?.total !== null && apiSportsGame.scores?.away?.total !== null;
      console.log(`[APISports] 🔍 ${sportKey} ${apiSportsGame.teams.away.name} @ ${apiSportsGame.teams.home.name}: status="${statusCode}", completed=${this.isGameCompleted(statusCode, sportKey)}, hasScores=${hasScores}, scores=${apiSportsGame.scores?.away?.total}-${apiSportsGame.scores?.home?.total}`);
    }

    // Debug logging for NBA/NCAAF status codes
    if (sportKey === 'basketball_nba' || sportKey === 'americanfootball_ncaaf') {
      console.log(`[APISports] 🔍 ${sportKey} ${apiSportsGame.teams.away.name} @ ${apiSportsGame.teams.home.name}: status="${statusCode}", completed=${this.isGameCompleted(statusCode, sportKey)}`);
    }

    // NHL-specific score handling (uses periods instead of quarters)
    let homeScore: number | null = null;
    let awayScore: number | null = null;

    if (sportKey === 'icehockey_nhl') {
      // Comprehensive debug logging for ALL NHL games (live + completed)
      console.log(`[APISports] 🔍 NHL ${apiSportsGame.teams.away.name} @ ${apiSportsGame.teams.home.name}:`, {
        status: statusCode,
        completed: this.isGameCompleted(statusCode, sportKey),
        'scores.home.total': apiSportsGame.scores?.home?.total,
        'scores.away.total': apiSportsGame.scores?.away?.total,
        fullScoreStructure: JSON.stringify(apiSportsGame.scores)
      });

      // Extract NHL scores - API-Sports returns different structures:
      // Format 1: {"home": 3, "away": 4} (completed games, direct numbers)
      // Format 2: {"home": {"total": 3, ...}, "away": {...}} (detailed breakdown)
      // Format 3: {"home": null, "away": null} (not started)
      const homeScores = apiSportsGame.scores?.home as any;
      const awayScores = apiSportsGame.scores?.away as any;

      // Format 1: Direct number (e.g., scores.home = 3)
      if (typeof homeScores === 'number' && typeof awayScores === 'number') {
        homeScore = homeScores;
        awayScore = awayScores;
        console.log(`[APISports] ✅ NHL scores from direct values: ${awayScore}-${homeScore}`);
      }
      // Format 2: Object with total field
      else if (homeScores?.total !== null && homeScores?.total !== undefined) {
        homeScore = homeScores.total;
        awayScore = awayScores.total;
        console.log(`[APISports] ✅ NHL scores from total field: ${awayScore}-${homeScore}`);
      }
      // Format 2b: Object with periods but no total
      else if (typeof homeScores === 'object' && homeScores !== null &&
               (homeScores.period_1 !== null || homeScores.period_2 !== null || homeScores.period_3 !== null)) {
        homeScore = (homeScores.period_1 || 0) + (homeScores.period_2 || 0) + (homeScores.period_3 || 0) + (homeScores.overtime || 0);
        awayScore = (awayScores.period_1 || 0) + (awayScores.period_2 || 0) + (awayScores.period_3 || 0) + (awayScores.overtime || 0);
        console.log(`[APISports] ✅ NHL scores calculated from periods: ${awayScore}-${homeScore}`);
      }
      // Format 3: null or undefined (game not started)
      else {
        homeScore = null;
        awayScore = null;
      }
    } else {
      // Non-NHL sports use standard total field
      homeScore = apiSportsGame.scores?.home?.total ?? null;
      awayScore = apiSportsGame.scores?.away?.total ?? null;
    }

    // Determine if game is completed
    // Primary: Check status codes (FT, AOT, AP)
    // Fallback: If game has scores AND is >4 hours past start time, mark as completed
    // (Handles API-Sports bug where old games show status="NS" with scores)
    let isCompleted = this.isGameCompleted(statusCode, sportKey);

    if (!isCompleted && homeScore !== null && awayScore !== null) {
      // Game has scores but status says not completed - check if it's old enough
      // Handle both date formats:
      // NFL/NCAAF: gameData.date.date + gameData.date.time
      // NHL/NBA: gameData.date + gameData.time OR use timestamp
      let gameTime: Date;
      if (gameData.timestamp) {
        gameTime = new Date(gameData.timestamp * 1000); // Convert Unix timestamp to milliseconds
      } else if (typeof gameData.date === 'object' && gameData.date.date) {
        // NFL nested structure
        gameTime = new Date(gameData.date.date + 'T' + gameData.date.time + 'Z');
      } else {
        // NHL flat structure
        gameTime = new Date(gameData.date + ' ' + gameData.time);
      }

      const hoursSinceStart = (Date.now() - gameTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceStart > 4) {
        console.log(`[APISports] ⚠️ Marking old game as completed despite status="${statusCode}": ${apiSportsGame.teams.away.name} @ ${apiSportsGame.teams.home.name} (${hoursSinceStart.toFixed(1)}h old, has scores)`);
        isCompleted = true;
      }
    }

    return {
      homeTeam: apiSportsGame.teams.home.name,
      awayTeam: apiSportsGame.teams.away.name,
      homeScore,
      awayScore,
      status: statusCode,
      completed: isCompleted,
      date: typeof gameData.date === 'object' ? gameData.date.date : gameData.date.split('T')[0],
      sport: sportKey
    };
  }

  /**
   * Determine if game is completed based on status code and sport
   *
   * Status codes vary by sport:
   * - FT: Finished/Final
   * - AOT: After Overtime
   * - AP: After Penalties (Hockey)
   * - LIVE: In Progress
   * - NS: Not Started
   *
   * @param statusCode - API-Sports status code
   * @param sportKey - Internal sport key
   * @returns True if game is completed
   */
  isGameCompleted(statusCode: string, sportKey: string): boolean {
    // Completed status codes per sport
    const completedStatuses: Record<string, string[]> = {
      'americanfootball_nfl': ['FT', 'AOT'], // Finished, After Overtime
      'americanfootball_ncaaf': ['FT', 'AOT'], // Finished, After Overtime
      'basketball_nba': ['FT', 'AOT'], // Finished, After Overtime
      'icehockey_nhl': ['FT', 'AOT', 'AP'], // Finished, After Overtime, After Penalties
      'baseball_mlb': ['FT'] // Finished
    };

    const completedCodes = completedStatuses[sportKey] || ['FT'];
    return completedCodes.includes(statusCode);
  }

  /**
   * Get current season for a sport
   *
   * Season formats:
   * - Single year: 2025 (NFL, NCAAF, MLB, NHL)
   * - Multi-year: 2024 (NBA - uses start year of multi-year season)
   *
   * Note: NHL API expects single year (2024 or 2025), not "2024-2025"
   *
   * @param sportKey - Internal sport key
   * @returns Season string
   */
  getCurrentSeason(sportKey: string): string {
    const now = new Date();
    const year = now.getFullYear();

    // NBA uses the start year of the season (e.g., "2024" for 2024-25 season)
    // Season starts in October, so if we're before July, use previous year
    if (sportKey === 'basketball_nba') {
      const startYear = now.getMonth() < 6 ? year - 1 : year;
      return startYear.toString();
    }

    // All other sports (NFL, NCAAF, MLB, NHL) use current year
    return year.toString();
  }

  /**
   * Get API configuration for a sport_key
   *
   * @param sportKey - Internal sport key
   * @returns API configuration with league details, or null if not found
   */
  private getConfigForSportKey(sportKey: string) {
    const mapping = SPORT_KEY_TO_API_CONFIG[sportKey];
    if (!mapping) {
      console.warn(`[APISports] Unknown sport_key: ${sportKey}`);
      return null;
    }

    const apiConfig = API_SPORTS_CONFIG[mapping.api];
    const leagueConfig = (apiConfig.leagues as any)[mapping.leagueKey];

    return {
      api: mapping.api,
      baseURL: apiConfig.baseURL,
      apiKey: apiConfig.apiKey,
      sport: apiConfig.sport,
      league: leagueConfig
    };
  }
}

// Export singleton instance
export default new APISportsService();
