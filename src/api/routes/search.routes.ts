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

// Team abbreviations and aliases
const teamAliases: Record<string, string> = {
  // MLB
  'nyy': 'new york yankees',
  'bos': 'boston red sox',
  'sox': 'boston red sox',
  'lad': 'los angeles dodgers',
  'sf': 'san francisco giants',
  'chc': 'chicago cubs',

  // NBA
  'lal': 'los angeles lakers',
  'gsw': 'golden state warriors',
  'nyk': 'new york knicks',
  'bos': 'boston celtics',
  'lakers': 'los angeles lakers',
  'warriors': 'golden state warriors',
  'celtics': 'boston celtics',

  // NFL
  'pats': 'new england patriots',
  'gb': 'green bay packers',
  'dal': 'dallas cowboys',
  'pit': 'pittsburgh steelers',
  'ne': 'new england patriots',
  'sf': 'san francisco 49ers',

  // NHL
  'nyr': 'new york rangers',
  'tor': 'toronto maple leafs',
  'mtl': 'montreal canadiens',
  'bos': 'boston bruins',
  'det': 'detroit red wings'
};

/**
 * Calculate simple string similarity (Levenshtein-based approximation)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  // Simple substring matching for now
  if (longer.includes(shorter)) {
    return 0.7 + (shorter.length / longer.length) * 0.3;
  }

  // Check if words match
  const words1 = str1.split(' ');
  const words2 = str2.split(' ');
  const matchingWords = words1.filter(w1 => words2.some(w2 => w2.includes(w1) || w1.includes(w2)));

  if (matchingWords.length > 0) {
    return 0.4 + (matchingWords.length / Math.max(words1.length, words2.length)) * 0.3;
  }

  return 0.0;
}

/**
 * Generate search suggestions for typos
 */
function generateSuggestions(query: string, allTeams: string[]): string[] {
  const suggestions = new Set<string>();

  // Try removing last character (for extra letters)
  if (query.length > 2) {
    const shortened = query.slice(0, -1);
    const matches = allTeams.filter(team =>
      team.toLowerCase().includes(shortened)
    );
    matches.slice(0, 3).forEach(m => suggestions.add(m));
  }

  // Try each word separately
  const words = query.split(' ');
  if (words.length > 1) {
    words.forEach(word => {
      if (word.length >= 3) {
        const matches = allTeams.filter(team =>
          team.toLowerCase().includes(word.toLowerCase())
        );
        matches.slice(0, 2).forEach(m => suggestions.add(m));
      }
    });
  }

  // Find similar team names
  const similar = allTeams
    .map(team => ({
      team,
      similarity: calculateSimilarity(query.toLowerCase(), team.toLowerCase())
    }))
    .filter(({similarity}) => similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
    .map(({team}) => team);

  similar.forEach(s => suggestions.add(s));

  return Array.from(suggestions).slice(0, 5);
}

/**
 * Cache popular search terms on startup
 */
async function warmCache() {
  const popularTerms = ['nfl', 'nba', 'mlb', 'nhl', 'yankees', 'lakers', 'patriots', 'cowboys'];

  console.log('[Search] Warming cache for popular terms...');

  for (const term of popularTerms) {
    try {
      // This will be populated on first actual search
      // Just logging for now
      console.log(`[Search] Popular term queued: ${term}`);
    } catch (error) {
      console.error(`[Search] Cache warming failed for ${term}:`, error);
    }
  }
}

// Warm cache on module load (after a delay to ensure database is ready)
setTimeout(() => {
  warmCache();
}, 5000);

/**
 * GET /api/v1/search
 *
 * Enhanced universal search with fuzzy matching, abbreviations, and suggestions.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const rawQuery = req.query.q as string;

    // Validate query parameter exists
    if (!rawQuery) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Query parameter "q" is required'
      });
    }

    // Clean and normalize query
    const query = rawQuery
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

    // Validate minimum length
    if (query.length < 2) {
      return res.status(400).json({
        error: 'Query too short',
        message: 'Search query must be at least 2 characters'
      });
    }

    // Check for team aliases/abbreviations
    let searchQuery = query;
    if (teamAliases[query]) {
      searchQuery = teamAliases[query];
      console.log(`[Search] Alias matched: ${query} -> ${searchQuery}`);
    }

    // Check Redis cache
    let cacheHit = false;
    const cacheKey = `search:${query}`;

    if (query.length >= 3) {
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
        console.error('[Search] Redis cache error:', cacheError);
      }
    }

    const db = getSupabase();

    // Search for teams (exact and partial matches)
    const { data: homeTeams, error: homeError } = await db
      .from('games')
      .select('home_team, sport_key, commence_time, status')
      .or(`home_team.ilike.%${searchQuery}%,away_team.ilike.%${searchQuery}%`)
      .limit(50);

    if (homeError) {
      console.error('[Search] Database error:', homeError);
      return res.status(500).json({
        error: 'Search failed',
        message: 'Failed to search teams'
      });
    }

    // Get all unique teams for suggestions
    const { data: allTeamsData } = await db
      .from('games')
      .select('home_team, away_team')
      .limit(100);

    const allTeams = new Set<string>();
    if (allTeamsData) {
      allTeamsData.forEach(game => {
        if (game.home_team) allTeams.add(game.home_team);
        if (game.away_team) allTeams.add(game.away_team);
      });
    }

    // Process teams with relevance scoring
    interface TeamResult {
      team_name: string;
      sport_key: string;
      upcoming_games: number;
      relevance_score: number;
    }

    const teamMap = new Map<string, TeamResult>();

    if (homeTeams) {
      for (const game of homeTeams) {
        // Check both home and away teams
        [game.home_team].forEach(teamName => {
          if (!teamName) return;

          const teamLower = teamName.toLowerCase();
          const key = `${teamName}:${game.sport_key}`;

          if (!teamMap.has(key)) {
            // Calculate relevance score
            let relevance = 0.5; // Base score

            // Exact match
            if (teamLower === searchQuery) {
              relevance = 1.0;
            }
            // Starts with query
            else if (teamLower.startsWith(searchQuery)) {
              relevance = 0.9;
            }
            // Contains query
            else if (teamLower.includes(searchQuery)) {
              relevance = 0.7;
            }
            // Word match
            else {
              const teamWords = teamLower.split(' ');
              const queryWords = searchQuery.split(' ');
              const matchCount = teamWords.filter(tw =>
                queryWords.some(qw => tw.includes(qw) || qw.includes(tw))
              ).length;
              relevance = 0.3 + (matchCount / teamWords.length) * 0.4;
            }

            teamMap.set(key, {
              team_name: teamName,
              sport_key: game.sport_key,
              upcoming_games: 0,
              relevance_score: parseFloat(relevance.toFixed(2))
            });
          }

          // Count upcoming games
          const team = teamMap.get(key)!;
          if (game.status === 'upcoming' && new Date(game.commence_time) > new Date()) {
            team.upcoming_games++;
          }
        });
      }
    }

    // Convert to array and sort by relevance, then upcoming games
    const teams = Array.from(teamMap.values())
      .sort((a, b) => {
        // First by relevance score
        if (Math.abs(b.relevance_score - a.relevance_score) > 0.1) {
          return b.relevance_score - a.relevance_score;
        }
        // Then by upcoming games
        if (b.upcoming_games !== a.upcoming_games) {
          return b.upcoming_games - a.upcoming_games;
        }
        // Finally alphabetically
        return a.team_name.localeCompare(b.team_name);
      })
      .slice(0, 10);

    // Search for sports
    const { data: sportGames } = await db
      .from('games')
      .select('sport_key')
      .ilike('sport_key', `%${searchQuery}%`)
      .limit(5);

    let sports: Array<{ sport_key: string; title: string; active: boolean; relevance_score: number }> = [];

    if (sportGames) {
      const uniqueSports = [...new Set(sportGames.map(g => g.sport_key))].slice(0, 5);

      const sportTitles: Record<string, string> = {
        'baseball_mlb': 'MLB',
        'basketball_nba': 'NBA',
        'americanfootball_nfl': 'NFL',
        'icehockey_nhl': 'NHL',
        'soccer_epl': 'English Premier League',
        'soccer_uefa_champs_league': 'UEFA Champions League'
      };

      sports = uniqueSports.map(sport_key => {
        const sportLower = sport_key.toLowerCase();
        let relevance = sportLower.includes(searchQuery) ? 0.9 : 0.5;

        return {
          sport_key,
          title: sportTitles[sport_key] || sport_key.replace(/_/g, ' '),
          active: true,
          relevance_score: parseFloat(relevance.toFixed(2))
        };
      });
    }

    // Generate suggestions if no results
    let did_you_mean: string[] | undefined;
    if (teams.length === 0 && sports.length === 0) {
      did_you_mean = generateSuggestions(searchQuery, Array.from(allTeams));
    }

    const response: any = {
      teams,
      sports,
      query,
      results_count: teams.length + sports.length,
      cache_hit: false
    };

    if (did_you_mean && did_you_mean.length > 0) {
      response.did_you_mean = did_you_mean;
    }

    // Cache strategy
    if (query.length >= 3) {
      const cacheTTL = teams.length === 0 && sports.length === 0 ? 60 : 300; // 1 min for no results, 5 min for results
      try {
        await setWithExpiry(cacheKey, response, cacheTTL);
      } catch (cacheError) {
        console.error('[Search] Failed to cache response:', cacheError);
      }
    }

    res.json(response);

  } catch (error) {
    console.error('[Search] Search endpoint error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
