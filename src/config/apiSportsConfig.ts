/**
 * API-Sports Configuration
 *
 * Configuration for all 4 API-Sports sport-level APIs:
 * - American Football API (NFL, NCAAF)
 * - Basketball API (NBA)
 * - Hockey API (NHL)
 * - Baseball API (MLB)
 *
 * Single API key shared across all endpoints: [REDACTED_API_SPORTS_KEY]
 * Each API has 7,500 requests/day limit (Tier 1)
 */

export const API_SPORTS_CONFIG = {
  americanFootball: {
    baseURL: 'https://v1.american-football.api-sports.io',
    apiKey: process.env.API_SPORTS_KEY || '',
    sport: 'american-football',
    leagues: {
      nfl: {
        id: 1,
        sportKey: 'americanfootball_nfl',
        name: 'NFL',
        pollIntervalMs: 30000 // 30 seconds - matches API-Sports update frequency
      },
      ncaaf: {
        id: 2,
        sportKey: 'americanfootball_ncaaf',
        name: 'NCAAF',
        pollIntervalMs: 30000 // 30 seconds - matches API-Sports update frequency
      }
    }
  },
  basketball: {
    baseURL: 'https://v1.basketball.api-sports.io',
    apiKey: process.env.API_SPORTS_KEY || '',
    sport: 'basketball',
    leagues: {
      nba: {
        id: 12,
        sportKey: 'basketball_nba',
        name: 'NBA',
        pollIntervalMs: 15000 // 15 seconds - matches API-Sports update frequency
      }
    }
  },
  hockey: {
    baseURL: 'https://v1.hockey.api-sports.io',
    apiKey: process.env.API_SPORTS_KEY || '',
    sport: 'hockey',
    leagues: {
      nhl: {
        id: 57,
        sportKey: 'icehockey_nhl',
        name: 'NHL',
        pollIntervalMs: 15000 // 15 seconds - matches API-Sports update frequency
      }
    }
  },
  baseball: {
    baseURL: 'https://v1.baseball.api-sports.io',
    apiKey: process.env.API_SPORTS_KEY || '',
    sport: 'baseball',
    leagues: {
      mlb: {
        id: 1,
        sportKey: 'baseball_mlb',
        name: 'MLB',
        pollIntervalMs: 15000 // 15 seconds - matches API-Sports update frequency
      }
    }
  }
};

/**
 * Map sport_key to API configuration
 * Enables lookup of API endpoint and league ID from internal sport_key
 */
export const SPORT_KEY_TO_API_CONFIG: Record<string, { api: keyof typeof API_SPORTS_CONFIG, leagueKey: string }> = {
  'americanfootball_nfl': { api: 'americanFootball', leagueKey: 'nfl' },
  'americanfootball_ncaaf': { api: 'americanFootball', leagueKey: 'ncaaf' },
  'basketball_nba': { api: 'basketball', leagueKey: 'nba' },
  'icehockey_nhl': { api: 'hockey', leagueKey: 'nhl' },
  'baseball_mlb': { api: 'baseball', leagueKey: 'mlb' }
};

/**
 * Get league configuration for a sport_key
 *
 * @param sportKey - Internal sport key (e.g., 'americanfootball_nfl')
 * @returns Complete API configuration with league details, or null if not found
 */
export function getLeagueConfig(sportKey: string) {
  const mapping = SPORT_KEY_TO_API_CONFIG[sportKey];
  if (!mapping) {
    console.warn(`[apiSportsConfig] Unknown sport_key: ${sportKey}`);
    return null;
  }

  const apiConfig = API_SPORTS_CONFIG[mapping.api];
  const leagueConfig = (apiConfig.leagues as any)[mapping.leagueKey];

  return {
    baseURL: apiConfig.baseURL,
    apiKey: apiConfig.apiKey,
    sport: apiConfig.sport,
    league: leagueConfig
  };
}
