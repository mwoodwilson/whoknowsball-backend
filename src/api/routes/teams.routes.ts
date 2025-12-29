import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getCache, setWithExpiry } from '../../config/redis';

const router = Router();

// TypeScript interface for logo response
interface TeamLogoResponse {
  team_name: string;
  logo_url: string | null;
  fallback_url: string;
  source: 'sportsdb' | 'placeholder';
  cached_until: string;
  cache_hit: boolean;
}

// In-memory rate limiter for SportsDB API
const requestCounts = new Map<number, number>();
const WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS = 25; // Stay under 30 limit

function checkRateLimit(): boolean {
  const now = Date.now();
  const minute = Math.floor(now / WINDOW_MS);

  const count = requestCounts.get(minute) || 0;
  if (count >= MAX_REQUESTS) {
    console.log('[Teams] Rate limit reached, skipping SportsDB API call');
    return false;
  }

  requestCounts.set(minute, count + 1);

  // Clean old entries
  for (const [key] of requestCounts) {
    if (key < minute - 1) requestCounts.delete(key);
  }

  return true;
}

// Team name mappings for edge cases (Odds API → SportsDB format)
const teamMappings: Record<string, string> = {
  'LA Lakers': 'Los Angeles Lakers',
  'LA Clippers': 'Los Angeles Clippers',
  'NY Rangers': 'New York Rangers',
  'NY Knicks': 'New York Knicks',
  'NY Yankees': 'New York Yankees',
  'NY Mets': 'New York Mets',
  'NY Jets': 'New York Jets',
  'NY Giants': 'New York Giants',
  'SF Giants': 'San Francisco Giants',
  'SF 49ers': 'San Francisco 49ers'
};

/**
 * GET /api/v1/teams/:teamName/logo
 *
 * Fetches team logo from SportsDB API with Redis caching.
 *
 * Response format:
 * {
 *   team_name: "Arsenal",
 *   logo_url: "https://www.thesportsdb.com/images/media/team/badge/abc123.png/small",
 *   fallback_url: "https://via.placeholder.com/250/1e40af/ffffff?text=AR",
 *   source: "sportsdb",
 *   cached_until: "2025-10-13T12:00:00.000Z",
 *   cache_hit: false
 * }
 *
 * Caching strategy:
 * - Logo found: 24 hours cache
 * - Logo not found: 1 hour cache
 *
 * Rate limiting:
 * - Max 25 requests/minute to SportsDB API
 * - Returns placeholder if rate limited
 */
router.get('/:teamName/logo', async (req: Request, res: Response) => {
  try {
    // Decode and normalize team name from URL parameter
    const teamName = decodeURIComponent(req.params.teamName);

    // Validate team name
    if (!teamName || teamName.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid team name',
        message: 'Team name cannot be empty'
      });
    }

    // Check Redis cache first
    const cacheKey = `team:logo:${teamName.toLowerCase()}`;

    try {
      const cached = await getCache<TeamLogoResponse>(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cache_hit: true
        });
      }
    } catch (cacheError) {
      console.error('[Teams] Redis cache error:', cacheError);
      // Continue without cache on error
    }

    // Apply team name mappings for edge cases
    const searchName = teamMappings[teamName] || teamName;

    // Check rate limit before calling external API
    if (!checkRateLimit()) {
      // Return placeholder if rate limited
      const placeholder: TeamLogoResponse = {
        team_name: teamName,
        logo_url: null,
        fallback_url: `https://via.placeholder.com/250/1e40af/ffffff?text=${encodeURIComponent(teamName.slice(0, 2).toUpperCase())}`,
        source: 'placeholder',
        cached_until: new Date(Date.now() + 3600000).toISOString(),
        cache_hit: false
      };

      return res.json(placeholder);
    }

    // Call SportsDB API (free key is "3")
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(searchName)}`;

    try {
      console.log(`[Teams] Fetching logo for: ${teamName} (searching: ${searchName})`);
      const response = await axios.get(searchUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'BKS-Backend/1.0'
        }
      });

      if (response.data?.teams?.[0]) {
        const team = response.data.teams[0];
        const logoUrl = team.strBadge ? `${team.strBadge}/small` : null;

        const result: TeamLogoResponse = {
          team_name: teamName,
          logo_url: logoUrl,
          fallback_url: `https://via.placeholder.com/250/1e40af/ffffff?text=${encodeURIComponent(teamName.slice(0, 2).toUpperCase())}`,
          source: 'sportsdb',
          cached_until: new Date(Date.now() + 86400000).toISOString(), // 24 hours
          cache_hit: false
        };

        // Cache for 24 hours (86400 seconds)
        try {
          await setWithExpiry(cacheKey, result, 86400);
        } catch (cacheError) {
          console.error('[Teams] Failed to cache logo:', cacheError);
        }

        return res.json(result);
      }
    } catch (error) {
      console.error('[Teams] SportsDB API error:', error);
      // Continue to placeholder response
    }

    // If no logo found, return placeholder and cache for 1 hour
    const placeholder: TeamLogoResponse = {
      team_name: teamName,
      logo_url: null,
      fallback_url: `https://via.placeholder.com/250/1e40af/ffffff?text=${encodeURIComponent(teamName.slice(0, 2).toUpperCase())}`,
      source: 'placeholder',
      cached_until: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      cache_hit: false
    };

    // Cache for 1 hour (3600 seconds)
    try {
      await setWithExpiry(cacheKey, placeholder, 3600);
    } catch (cacheError) {
      console.error('[Teams] Failed to cache placeholder:', cacheError);
    }

    return res.json(placeholder);

  } catch (error) {
    console.error('[Teams] Logo endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch team logo',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
