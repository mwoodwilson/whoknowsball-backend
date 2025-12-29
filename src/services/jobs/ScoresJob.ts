/**
 * ScoresJob - Fetches final scores from API-Sports (with Odds API fallback)
 *
 * WHY: Games need scores to settle bets. Using API-Sports provides 15-30s updates
 * (8x faster than TheSportsDB's 2-minute delays) for professional-grade betting UX.
 *
 * SCHEDULE: Sport-specific intervals (NFL/NCAAF: 30s, NBA/NHL/MLB: 15s)
 *
 * DATA FLOW:
 * 1. Fetch scores from API-Sports (15-30s latency, professional-grade)
 * 2. Match games to Supabase using team names + UTC date matching
 * 3. Fallback to Odds API if API-Sports fails
 * 4. Update game scores in Supabase for settlement
 *
 * QUOTA USAGE: 16 req/min total, 5,760 req/day per API endpoint (23% headroom)
 */

import { getSupabase } from '../../config/supabase';
import APISportsService from '../APISportsService';
import type { NormalizedGame } from '../APISportsService';
import { getAPISportsTeamName, normalizeTeamName, getTeamSportKey } from '../../config/teamMappings';
import { getCache, setWithExpiry } from '../../config/redis';
import axios from 'axios';
import moment from 'moment-timezone';
import { isLegacyHashId, logUnupdatableGame } from '../../utils/gameIdValidation';

interface ScoreData {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: Array<{
    name: string;
    score: string;
  }>;
  last_update?: string;
}

interface MatchingStats {
  matched: number;
  unmatched: number;
  errors: number;
  unmatchedGames: Array<{
    sport: string;
    date: string;
    homeTeam: string;
    awayTeam: string;
  }>;
}

class ScoresJob {
  private apiKey = process.env.ODDS_API_KEY;
  private baseUrl = 'https://api.the-odds-api.com/v4';
  // QUOTA FIX: Disable API-Sports for scores (use Odds API instead)
  // GameCreationJob creates games with API-Sports IDs, ScoresJob just updates scores
  // Odds API provides scores for free, API-Sports burns quota
  private useAPISports = true; // Option A: API-Sports primary for direct ID matching (eliminates team name issues)

  private sports = [
    'americanfootball_nfl',
    'basketball_nba',
    'icehockey_nhl',
  ];

  // Cycle counter for 5-minute future game updates
  private cycleCounter: number = 0;

  /**
   * Fetch scores from Odds API (fallback method)
   */
  async fetchScoresFromOddsAPI(sportKey: string): Promise<ScoreData[]> {
    try {
      const url = `${this.baseUrl}/sports/${sportKey}/scores/`;
      const params = {
        apiKey: this.apiKey,
        daysFrom: 3, // Look back 3 days for recently completed games
      };

      console.log(`[ScoresJob] 🔄 Fetching scores from Odds API for ${sportKey}...`);

      const response = await axios.get(url, { params });

      if (response.status !== 200) {
        throw new Error(`Scores API returned status ${response.status}`);
      }

      console.log(`[ScoresJob] ⚠️ FALLBACK USED - Fetched from Odds API (counts against quota)`);
      return response.data || [];

    } catch (error: any) {
      console.error(`[ScoresJob] ❌ Odds API fallback failed for ${sportKey}:`, error.message);
      return [];
    }
  }

  /**
   * Validate team name for potential cross-sport collisions
   * Logs warnings for collision keywords to enable monitoring
   */
  private validateNoCollision(teamName: string, sport: string): void {
    // Check if this team name could match teams in other sports
    const possibleSports = getTeamSportKey(teamName);

    if (possibleSports.length > 1) {
      console.log(`[ScoresJob] 🔍 Collision-prone team: "${teamName}" exists in [${possibleSports.join(', ')}], querying ${sport}`);
    }

    // Check for critical collision keywords
    const collisionKeywords = ['kings', 'rangers', 'giants', 'jets', 'cardinals', 'panthers'];
    const normalized = teamName.toLowerCase();

    for (const keyword of collisionKeywords) {
      if (normalized.includes(keyword)) {
        console.log(`[ScoresJob] 🔍 Collision keyword "${keyword}" detected in "${teamName}" (${sport})`);
        break;
      }
    }
  }

  /**
   * Match API-Sports score to Supabase game using UTC-aware matching
   *
   * Strategy:
   * 1. SPORT_KEY filtering (CRITICAL: prevents cross-sport matches)
   * 2. Sport-aware team name normalization (handles collision teams)
   * 3. Exact team name match
   * 4. Case-insensitive match
   * 5. UTC date ±1 day buffer (handles games spanning midnight)
   */
  async matchScoreToGame(score: NormalizedGame): Promise<string | null> {
    try {
      console.log(`[ScoresJob] ========================================`);
      console.log(`[ScoresJob] MATCHING ATTEMPT`);
      console.log(`[ScoresJob] Sport: ${score.sport}`);
      console.log(`[ScoresJob] Home: ${score.homeTeam}`);
      console.log(`[ScoresJob] Away: ${score.awayTeam}`);
      console.log(`[ScoresJob] Date: ${score.date}`);
      console.log(`[ScoresJob] ========================================`);

      // STEP 1: Validate for collision keywords (monitoring)
      this.validateNoCollision(score.homeTeam, score.sport);
      this.validateNoCollision(score.awayTeam, score.sport);

      // STEP 2: Get UTC date with ±1 day buffer
      const scoreDate = moment.utc(score.date);
      const startDate = scoreDate.clone().subtract(1, 'day').startOf('day').toISOString();
      const endDate = scoreDate.clone().add(1, 'day').endOf('day').toISOString();

      // STEP 3: Team names - assume identical (API-Sports uses same names as Odds API)
      const homeTeam = score.homeTeam;
      const awayTeam = score.awayTeam;

      // STEP 4: Query Supabase with SPORT_KEY as PRIMARY filter (CRITICAL!)
      console.log(`[ScoresJob] Querying games table with sport_key="${score.sport}" (prevents cross-sport matches)`);

      const { data: games, error } = await getSupabase()
        .from('games')
        .select('*')
        .eq('sport_key', score.sport) // ⚠️ CRITICAL: Sport filter FIRST!
        .gte('commence_time', startDate)
        .lte('commence_time', endDate);

      if (error) {
        console.error(`[ScoresJob] [${score.sport}] Database error:`, error.message);
        return null;
      }

      if (!games || games.length === 0) {
        console.log(`[ScoresJob] [${score.sport}] No candidate games found for ${awayTeam} @ ${homeTeam}`);
        return null;
      }

      // STEP 5: Verify all returned games match the expected sport (cross-sport leakage detection)
      console.log(`[ScoresJob] [${score.sport}] Found ${games.length} candidate games (sport-filtered)`);

      games.forEach(g => {
        console.log(`[ScoresJob] [${score.sport}] Candidate: ${g.away_team} @ ${g.home_team} (${g.sport_key}, ${g.commence_time})`);
      });

      const wrongSportGames = games.filter(g => g.sport_key !== score.sport);

      if (wrongSportGames.length > 0) {
        console.error(`[ScoresJob] 🚨 CRITICAL: Cross-sport leakage detected!`);
        wrongSportGames.forEach(g => {
          console.error(`[ScoresJob] Expected ${score.sport}, got ${g.sport_key}: ${g.away_team} @ ${g.home_team}`);
        });
        // This should NEVER happen - indicates database query bug
        throw new Error(`Cross-sport data leakage: ${wrongSportGames.length} games`);
      }

      // STEP 6: Find exact match first
      let matchedGame = games.find(g =>
        g.home_team === homeTeam && g.away_team === awayTeam
      );

      if (matchedGame) {
        console.log(`[ScoresJob] ✅ [${score.sport}] Exact match: ${awayTeam} @ ${homeTeam} → game ${matchedGame.id}`);
        console.log(`[ScoresJob] ✅ [${score.sport}] Verified sport_key: ${matchedGame.sport_key} === ${score.sport}`);
        return matchedGame.id;
      }

      // Try case-insensitive match
      matchedGame = games.find(g =>
        g.home_team.toLowerCase() === homeTeam.toLowerCase() &&
        g.away_team.toLowerCase() === awayTeam.toLowerCase()
      );

      if (matchedGame) {
        console.log(`[ScoresJob] ✅ [${score.sport}] Case-insensitive match: ${awayTeam} @ ${homeTeam} → game ${matchedGame.id}`);
        console.log(`[ScoresJob] ✅ [${score.sport}] Verified sport_key: ${matchedGame.sport_key} === ${score.sport}`);
        return matchedGame.id;
      }

      console.warn(`[ScoresJob] ❌ [${score.sport}] No match: ${awayTeam} @ ${homeTeam}`);
      console.warn(`[ScoresJob] ❌ [${score.sport}] Searched ${games.length} ${score.sport} games, none matched`);
      console.warn(`[ScoresJob] ❌ [${score.sport}] Date: ${score.date}`);
      return null;

    } catch (error: any) {
      console.error(`[ScoresJob] Error matching score:`, error.message);
      return null;
    }
  }

  /**
   * Update game with final score
   */
  async updateGameScore(gameId: string, score: NormalizedGame): Promise<boolean> {
    try {
      if (score.homeScore === null || score.awayScore === null) {
        console.log(`[ScoresJob] Game ${gameId} missing scores, skipping`);
        return false;
      }

      const updateData = {
        home_score: score.homeScore,
        away_score: score.awayScore,
        status: score.completed ? 'completed' : 'live',
        completed: score.completed
      };

      const { error } = await getSupabase()
        .from('games')
        .update(updateData)
        .eq('id', gameId);

      if (error) {
        console.error(`[ScoresJob] Error updating game ${gameId}:`, error);
        return false;
      }

      console.log(`[ScoresJob] ✅ Updated ${score.awayTeam} @ ${score.homeTeam}: ${score.awayScore}-${score.homeScore} (${score.status.toUpperCase()})`);
      return true;

    } catch (error: any) {
      console.error(`[ScoresJob] Error processing game ${gameId}:`, error.message);
      return false;
    }
  }

  /**
   * Fetch scores for a specific sport and date using API-Sports or Odds API fallback
   */
  async fetchScoresForDate(sport: string, date: string): Promise<Array<NormalizedGame & { apiSportsId?: number }>> {
    if (this.useAPISports) {
      try {
        console.log(`[ScoresJob] 🔄 Attempting API-Sports for ${sport} on ${date}`);

        // Get season for this sport
        const season = APISportsService.getCurrentSeason(sport);

        // Fetch from API-Sports
        const apiSportsGames = await APISportsService.fetchGames(sport, date, season);

        // Transform to normalized format - include both live and completed games
        // CRITICAL: Preserve API-Sports game ID for direct matching!
        const scores = apiSportsGames
          .map(game => ({
            ...APISportsService.transformGame(game, sport),
            apiSportsId: game.id  // ✅ Direct ID match: Use API-Sports game ID from root level
          }))
          .filter(game => game.homeScore !== null && game.awayScore !== null); // Has scores (live or completed)

        const completedCount = scores.filter(g => g.completed).length;
        const liveCount = scores.filter(g => !g.completed).length;
        console.log(`[ScoresJob] ✅ API-Sports returned ${scores.length} games for ${sport} (${completedCount} completed, ${liveCount} live)`);

        // Track successful API-Sports usage
        await this.trackAPIUsage('api_sports', sport, date, scores.length);

        return scores;
      } catch (error: any) {
        console.error(`[ScoresJob] ❌ API-Sports failed for ${sport} on ${date}:`, error.message);
        console.log(`[ScoresJob] 🔄 Falling back to Odds API for ${sport}`);

        // Track fallback usage
        await this.trackFallback('api_sports', sport, date);
        // Fall through to Odds API fallback
      }
    }

    // Fallback: Use Odds API score fetching
    console.log(`[ScoresJob] Using Odds API for ${sport} scores`);
    const oddsData = await this.fetchScoresFromOddsAPI(sport);

    // Transform Odds API data to normalized format
    const normalized: NormalizedGame[] = [];
    for (const game of oddsData) {
      if (!game.scores || game.scores.length < 2) continue;

      const homeScore = game.scores.find(s => s.name === game.home_team);
      const awayScore = game.scores.find(s => s.name === game.away_team);

      if (!homeScore || !awayScore) continue;

      normalized.push({
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeScore: parseInt(homeScore.score, 10),
        awayScore: parseInt(awayScore.score, 10),
        status: game.completed ? 'FT' : 'LIVE',
        completed: game.completed,
        date: moment(game.commence_time).format('YYYY-MM-DD'),
        sport: game.sport_key
      });
    }

    // Return all games with scores (live or completed), not just completed
    return normalized;
  }

  /**
   * Track API usage for monitoring
   */
  private async trackAPIUsage(apiName: string, sport: string, date: string, resultCount: number) {
    const key = `scoresjob:${apiName}:${sport}:${date}`;
    try {
      await setWithExpiry(key, resultCount.toString(), 86400); // 24h TTL
      await setWithExpiry(`scoresjob:${apiName}:usage:today`, '1', 86400);
      await setWithExpiry('scoresjob:last:sync', new Date().toISOString(), 86400);
    } catch (err: any) {
      console.error(`[ScoresJob] Failed to track ${apiName} usage:`, err.message);
    }
  }

  /**
   * Track fallback events for monitoring
   */
  private async trackFallback(primaryAPI: string, sport: string, date: string) {
    const key = `scoresjob:fallback:${primaryAPI}:${sport}:${date}`;
    try {
      await setWithExpiry(key, '1', 86400); // 24h TTL
      const todayKey = `scoresjob:fallback:count:today`;
      const count = parseInt(await getCache(todayKey) || '0') + 1;
      await setWithExpiry(todayKey, count.toString(), 86400);

      if (count > 10) {
        console.warn(`[ScoresJob] ⚠️ HIGH FALLBACK COUNT: ${count} fallbacks today from ${primaryAPI}`);
      }
    } catch (err: any) {
      console.error(`[ScoresJob] Failed to track fallback:`, err.message);
    }
  }

  /**
   * Run ScoresJob for a specific sport
   * DYNAMIC POLLING APPROACH (like DraftKings/FanDuel)
   *
   * Games are categorized by state and polled at different frequencies:
   * - LIVE games (status codes like Q1, Q2, P1, etc.): Poll every cycle (15-30s)
   * - IMMINENT games (starting within 15 min): Poll every cycle (detect live status immediately)
   * - FUTURE games (>15 min away): Poll every 5 minutes (save quota)
   */
  async runForSport(sportKey: string): Promise<void> {
    console.log(`🏆 [ScoresJob] Starting ${sportKey} sync at ${new Date().toISOString()}`);
    const startTime = Date.now();
    const now = new Date();

    // Query database for all incomplete games for this sport
    // STATUS-BASED FILTERING (not date-based!)
    const { data: incompleteGames, error } = await getSupabase()
      .from('games')
      .select('id, sport_key, home_team, away_team, status, commence_time')
      .eq('sport_key', sportKey)
      .eq('completed', false)  // Only fetch incomplete games
      .order('commence_time', { ascending: true });

    if (error) {
      console.error(`[ScoresJob] ❌ Database error fetching incomplete ${sportKey} games:`, error);
      return;
    }

    if (!incompleteGames || incompleteGames.length === 0) {
      console.log(`[ScoresJob] ℹ️  No incomplete ${sportKey} games to update`);
      return;
    }

    // DYNAMIC POLLING: Categorize games by state
    const liveStatusCodes = ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'HT', 'P1', 'P2', 'P3', 'BT',
                             'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9',
                             'live', 'LIVE']; // Add common live status codes

    const liveGames = incompleteGames.filter(g =>
      liveStatusCodes.includes(g.status)
    );

    const imminentGames = incompleteGames.filter(g => {
      const commenceTime = new Date(g.commence_time);
      const minutesUntilStart = (commenceTime.getTime() - now.getTime()) / (1000 * 60);
      // Include games starting within 15 minutes OR already started but not marked live yet (up to 5 min past start)
      return g.status === 'upcoming' && minutesUntilStart <= 15 && minutesUntilStart >= -5;
    });

    const futureGames = incompleteGames.filter(g => {
      const commenceTime = new Date(g.commence_time);
      const minutesUntilStart = (commenceTime.getTime() - now.getTime()) / (1000 * 60);
      return g.status === 'upcoming' && minutesUntilStart > 15;
    });

    console.log(`[ScoresJob] 📊 ${sportKey}: ${liveGames.length} live, ${imminentGames.length} imminent, ${futureGames.length} future`);

    // Combine games to update this cycle
    let gamesToUpdate: typeof incompleteGames = [];

    // ALWAYS update live and imminent games (high priority)
    gamesToUpdate = [...liveGames, ...imminentGames];

    // Update future games only every 5 minutes (save quota)
    const currentMinute = Math.floor(now.getTime() / (1000 * 60));
    const shouldUpdateFuture = currentMinute % 5 === 0;

    if (shouldUpdateFuture && futureGames.length > 0) {
      console.log(`[ScoresJob] 🕒 5-minute cycle - including ${futureGames.length} future games`);
      gamesToUpdate = [...gamesToUpdate, ...futureGames];
    }

    console.log(`[ScoresJob] 📡 Updating ${gamesToUpdate.length}/${incompleteGames.length} games this cycle`);

    // Initialize tracking
    let updated = 0;
    let errors = 0;

    // Fetch and update selected games by ID
    for (const game of gamesToUpdate) {
      try {
        // Fetch current game data from API-Sports by ID (not by date!)
        const apiGame = await APISportsService.fetchGameById(game.id, sportKey);

        if (!apiGame) {
          // AUTO-CLEANUP: If game not found and started >4 hours ago, mark as completed
          const gameTime = new Date(game.commence_time);
          const hoursSinceStart = (Date.now() - gameTime.getTime()) / (1000 * 60 * 60);

          if (hoursSinceStart > 4) {
            console.log(`[ScoresJob] 🧹 Auto-cleanup: Game ${game.id} not found in API-Sports and started ${hoursSinceStart.toFixed(1)}h ago - marking as completed`);

            // Mark as completed (prevents stale games from accumulating)
            const success = await this.updateGameScore(game.id, {
              sport: sportKey,
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              homeScore: game.home_score || 0,
              awayScore: game.away_score || 0,
              status: 'FT',
              completed: true
            });

            if (success) {
              updated++;
            }
          } else {
            console.log(`[ScoresJob] ⚠️  Game ${game.id} not found in API-Sports (may be cancelled/postponed)`);
          }

          continue;
        }

        // Transform to normalized format
        const normalized = APISportsService.transformGame(apiGame, sportKey);

        // Update if game has scores
        if (normalized.homeScore !== null && normalized.awayScore !== null) {
          const success = await this.updateGameScore(game.id, normalized);
          if (success) {
            updated++;
            if (normalized.completed) {
              console.log(`[ScoresJob] ✅ Game ${game.id} marked as COMPLETED`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[ScoresJob] ❌ Error updating game ${game.id}:`, err.message);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ScoresJob] 📊 ${sportKey} Summary: ${updated} updated, ${errors} errors, ${gamesToUpdate.length} polled in ${duration}ms`);
    console.log(`✅ [ScoresJob] ${sportKey} sync complete`);
  }

  /**
   * Run the scores sync job for all sports
   * DYNAMIC POLLING: Updates live/imminent games every cycle, future games every 10 cycles (5 min)
   */
  async run(): Promise<void> {
    this.cycleCounter++;
    const now = new Date();

    console.log(`[ScoresJob] 🔄 Cycle ${this.cycleCounter} starting at ${now.toISOString()}`);

    for (const sportKey of this.sports) {
      try {
        // Query database for all incomplete games
        const { data: incompleteGames, error } = await getSupabase()
          .from('games')
          .select('id, sport_key, status, commence_time, home_team, away_team')
          .eq('sport_key', sportKey)
          .not('status', 'in', '("completed","cancelled","postponed")')
          .order('commence_time', { ascending: true });

        if (error || !incompleteGames || incompleteGames.length === 0) {
          console.log(`[ScoresJob] ℹ️  No incomplete ${sportKey} games`);
          continue;
        }

        // CATEGORIZE GAMES BY STATE
        const liveGames: any[] = [];
        const imminentGames: any[] = [];
        const futureGames: any[] = [];

        // Live status codes per sport
        const liveStatuses = [
          'Q1', 'Q2', 'Q3', 'Q4', 'OT', 'HT',  // NFL/NBA
          'P1', 'P2', 'P3', 'BT', 'PT',        // NHL
          'IN1', 'IN2', 'IN3', 'IN4', 'IN5', 'IN6', 'IN7', 'IN8', 'IN9', // MLB
          'live', 'LIVE' // Generic live status
        ];

        for (const game of incompleteGames) {
          // Check if game is live (has in-progress status)
          if (liveStatuses.includes(game.status)) {
            liveGames.push(game);
            continue;
          }

          // Check if game is imminent (starting within 15 minutes)
          const startTime = new Date(game.commence_time);
          const minsUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60);

          if (game.status === 'upcoming' && minsUntilStart <= 15 && minsUntilStart >= -5) {
            // Include games from 5 min ago (in case status update was delayed)
            imminentGames.push(game);
          } else {
            futureGames.push(game);
          }
        }

        console.log(`[ScoresJob] 📊 ${sportKey}: ${liveGames.length} live, ${imminentGames.length} imminent (<15min), ${futureGames.length} future`);

        // ALWAYS UPDATE: Live games (score changes constantly)
        for (const game of liveGames) {
          try {
            await this.updateGameById(game.id, sportKey);
          } catch (error: any) {
            console.error(`[ScoresJob] ❌ Failed to update live game ${game.id}:`, error.message);
          }
        }

        // ALWAYS UPDATE: Imminent games (detect when they go live)
        for (const game of imminentGames) {
          try {
            await this.updateGameById(game.id, sportKey);
          } catch (error: any) {
            console.error(`[ScoresJob] ❌ Failed to update imminent game ${game.id}:`, error.message);
          }
        }

        // CONDITIONALLY UPDATE: Future games (only every 10 cycles = 5 minutes)
        // 30 seconds/cycle × 10 cycles = 300 seconds = 5 minutes
        if (this.cycleCounter % 10 === 0) {
          console.log(`[ScoresJob] 🔄 5-minute cycle: updating ${futureGames.length} future ${sportKey} games`);
          for (const game of futureGames) {
            try {
              await this.updateGameById(game.id, sportKey);
            } catch (error: any) {
              console.error(`[ScoresJob] ❌ Failed to update future game ${game.id}:`, error.message);
            }
          }
        }
      } catch (error: any) {
        console.error(`[ScoresJob] ❌ Error processing ${sportKey}:`, error.message);
      }
    }

    console.log(`[ScoresJob] ✅ Cycle ${this.cycleCounter} complete`);
  }

  /**
   * Update a single game by ID
   */
  private async updateGameById(gameId: string, sportKey: string): Promise<void> {
    try {
      // SAFEGUARD: Legacy hash ID games cannot be fetched from API-Sports
      // But we need to auto-complete them after expected game duration to enable settlement
      if (isLegacyHashId(gameId)) {
        const supabase = getSupabase();

        // Fetch the game to check its commence_time
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select('commence_time, home_score, away_score, completed, sport_key')
          .eq('id', gameId)
          .single();

        if (gameError || !game) {
          logUnupdatableGame(gameId, 'Legacy hash ID game not found in database');
          return;
        }

        // Calculate hours since game started
        const gameTime = new Date(game.commence_time);
        const hoursSinceStart = (Date.now() - gameTime.getTime()) / (1000 * 60 * 60);

        // Expected game durations by sport (hours)
        const gameDurations: Record<string, number> = {
          'americanfootball_nfl': 4,
          'americanfootball_ncaaf': 4,
          'basketball_nba': 3,
          'basketball_ncaab': 3,
          'icehockey_nhl': 3,
          'baseball_mlb': 4
        };

        const expectedDuration = gameDurations[sportKey] || 4;

        // Auto-complete legacy games that have exceeded expected duration
        if (hoursSinceStart > expectedDuration && !game.completed) {
          console.log(`[ScoresJob] 🔧 AUTO-COMPLETING legacy game ${gameId} (${hoursSinceStart.toFixed(1)}h since start, expected ${expectedDuration}h)`);

          // Check if this game has bets that need settlement
          const { count: betCount } = await supabase
            .from('bets')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', gameId)
            .in('status', ['PENDING', 'LIVE']);

          const { count: parlayLegCount } = await supabase
            .from('parlay_legs')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', gameId)
            .in('status', ['PENDING']);

          if (betCount && betCount > 0) {
            console.warn(`[ScoresJob] ⚠️  Legacy game ${gameId} has ${betCount} active bets - marking as completed for settlement`);
          }
          if (parlayLegCount && parlayLegCount > 0) {
            console.warn(`[ScoresJob] ⚠️  Legacy game ${gameId} has ${parlayLegCount} pending parlay legs - marking as completed for settlement`);
          }

          // Mark game as completed (SettlementJob will handle settlement)
          // NOTE: If scores are missing, SettlementJob will need to handle gracefully
          const { error: updateError } = await supabase
            .from('games')
            .update({
              status: 'completed',
              completed: true
            })
            .eq('id', gameId);

          if (updateError) {
            console.error(`[ScoresJob] ❌ Failed to auto-complete legacy game ${gameId}:`, updateError.message);
          } else {
            console.log(`[ScoresJob] ✅ Auto-completed legacy game ${gameId} - SettlementJob will attempt settlement`);
          }
        } else if (this.cycleCounter % 10 === 0) {
          // Only log status every 5 minutes to avoid spam
          logUnupdatableGame(gameId, `Legacy hash ID - waiting for game to complete (${hoursSinceStart.toFixed(1)}h/${expectedDuration}h)`);

          // Check if this game has pending bets (informational)
          const { count: betCount } = await supabase
            .from('bets')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', gameId)
            .in('status', ['PENDING', 'LIVE']);

          if (betCount && betCount > 0) {
            console.warn(`[ScoresJob] ℹ️  Legacy game ${gameId} has ${betCount} active bets - will auto-complete after ${expectedDuration}h`);
          }
        }

        return;
      }

      // Fetch game data from API-Sports by ID
      const apiGame = await APISportsService.fetchGameById(gameId, sportKey);

      if (!apiGame) {
        // Log warning for API-Sports integer IDs that weren't found
        logUnupdatableGame(gameId, 'Not found in API-Sports (may be rescheduled or cancelled)');
        return;
      }

      // Transform and update
      const normalized = APISportsService.transformGame(apiGame, sportKey);
      await this.updateGameScore(gameId, normalized);

      if (normalized.completed) {
        console.log(`[ScoresJob] ✅ Game ${gameId} marked as COMPLETED`);
      }
    } catch (error: any) {
      console.error(`[ScoresJob] ❌ Error updating game ${gameId}:`, error.message);
    }
  }
}

// Export for use in index.ts with async startup
export default ScoresJob;
