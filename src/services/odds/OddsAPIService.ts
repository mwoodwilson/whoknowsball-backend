import { createClient } from '@supabase/supabase-js';

interface OddsAPIResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      last_update: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

interface ScoresAPIResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  scores: Array<{
    name: string;
    score: string;
  }> | null;
  last_update: string | null;
  completed: boolean;
}

export class OddsAPIService {
  private apiKey: string;
  private baseURL = 'https://api.the-odds-api.com/v4';
  private supabase;
  private readonly MONTHLY_QUOTA = 5000000; // 5M monthly quota
  private readonly DAILY_QUOTA = 166667; // 5M / 30 days = ~166,667 per day

  // Sport keys mapping
  private readonly SPORTS = {
    NFL: 'americanfootball_nfl',
    NCAAF: 'americanfootball_ncaaf',
    NBA: 'basketball_nba',
    MLB: 'baseball_mlb',
    NHL: 'icehockey_nhl'
  };

  constructor() {
    this.apiKey = process.env.ODDS_API_KEY!;
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // Check if within daily quota and track usage
  async checkQuota(): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Get or create daily quota record
    const { data, error } = await this.supabase
      .from('daily_quota_tracking')
      .select('*')
      .eq('date', todayKey)
      .eq('api_name', 'the-odds-api')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('[Quota] Error checking daily quota:', error);
      return true; // Allow request on error to avoid blocking
    }

    const usedToday = data?.requests_used || 0;
    const remaining = this.DAILY_QUOTA - usedToday;

    console.log(`Daily quota: ${usedToday}/${this.DAILY_QUOTA} used (${remaining} remaining)`);

    if (remaining <= 0) {
      console.error(`❌ Daily quota exceeded! ${usedToday}/${this.DAILY_QUOTA} used`);
      return false;
    }

    return true;
  }

  // Increment daily quota usage
  private async incrementDailyQuota() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().split('T')[0]; // YYYY-MM-DD format

    // First, ensure the record exists (initialize if needed)
    const { error: upsertError } = await this.supabase
      .from('daily_quota_tracking')
      .upsert({
        date: todayKey,
        api_name: 'the-odds-api',
        requests_used: 0, // Start at 0
        quota_limit: this.DAILY_QUOTA,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'date,api_name',
        ignoreDuplicates: true // Don't overwrite if exists
      });

    if (upsertError) {
      console.error('[Quota] Error upserting daily quota:', upsertError);
    }

    // Now increment the counter
    const { error: rpcError } = await this.supabase.rpc('increment_daily_quota', {
      p_date: todayKey,
      p_api_name: 'the-odds-api'
    });

    if (rpcError) {
      console.error('[Quota] Error incrementing daily quota:', rpcError);
    }
  }

  // Fetch odds for all supported sports
  async fetchAllSportsOdds() {
    const hasQuota = await this.checkQuota();
    if (!hasQuota) {
      throw new Error('Daily quota exceeded');
    }

    const results: any = {};

    for (const [sport, key] of Object.entries(this.SPORTS)) {
      try {
        results[sport] = await this.fetchOdds(key);
      } catch (error) {
        console.error(`Error fetching ${sport}:`, error);
        results[sport] = null;
      }
    }

    return results;
  }

  // Fetch odds for specific sport (NFL, NCAAF, NBA, MLB, NHL)
  async fetchSportOdds(sport: 'NFL' | 'NCAAF' | 'NBA' | 'MLB' | 'NHL') {
    const hasQuota = await this.checkQuota();
    if (!hasQuota) {
      throw new Error('Daily quota exceeded');
    }

    const sportKey = this.SPORTS[sport];
    return await this.fetchOdds(sportKey);
  }

  // Fetch live odds for a sport
  async fetchOdds(sportKey: string, markets = 'h2h,spreads,totals', forceRefresh = false) {
    if (forceRefresh) {
      console.log(`[OddsAPIService] Force refresh requested for odds ${sportKey}`);
    }

    // Fetch from API
    // Use specific bookmakers instead of regions to ensure consistent odds
    // FanDuel primary, DraftKings fallback, BetMGM secondary fallback
    const url = `${this.baseURL}/sports/${sportKey}/odds`;
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      bookmakers: 'fanduel,draftkings,betmgm',
      markets,
      oddsFormat: 'american',
      dateFormat: 'iso'
    });

    try {
      const response = await fetch(`${url}?${params}`);

      // Track quota usage from response headers
      await this.trackQuotaUsage(response.headers);

      if (!response.ok) {
        throw new Error(`Odds API error: ${response.status}`);
      }

      const data: OddsAPIResponse[] = await response.json();

      // Increment daily quota counter (successful API call)
      await this.incrementDailyQuota();

      // NOTE: Do NOT store games here - games should only be created by GameCreationJob
      // using API-Sports IDs. Odds API is for odds data only.
      // The OddsMatchingJob will match odds to existing games.

      return data;
    } catch (error) {
      console.error('Error fetching odds:', error);
      throw error;
    }
  }

  // Fetch live scores for a sport
  async getScores(sportKey: string, forceRefresh = false): Promise<ScoresAPIResponse[]> {
    if (forceRefresh) {
      console.log(`[OddsAPIService] Force refresh requested for scores ${sportKey}`);
    }

    // Fetch from API
    const url = `${this.baseURL}/sports/${sportKey}/scores`;
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      dateFormat: 'iso'
    });

    try {
      const response = await fetch(`${url}?${params}`);

      // Track quota usage from response headers
      await this.trackQuotaUsage(response.headers);

      if (!response.ok) {
        throw new Error(`Scores API error: ${response.status} ${response.statusText}`);
      }

      const data: ScoresAPIResponse[] = await response.json();

      // Increment daily quota counter (successful API call)
      await this.incrementDailyQuota();

      console.log(`Fetched ${data.length} scores for ${sportKey}`);

      return data;
    } catch (error) {
      console.error('Error fetching scores:', error);
      throw error;
    }
  }

  // Capture closing odds at T-2 minutes before game starts
  async captureClosingOdds(gameId: string, commenceTime: Date) {
    const now = new Date();
    const twoMinutesBefore = new Date(commenceTime.getTime() - 2 * 60 * 1000);

    if (now >= twoMinutesBefore) {
      console.log(`Capturing closing odds for game ${gameId}`);

      // Fetch the latest odds
      const { data: game } = await this.supabase
        .from('games')
        .select('sport_key')
        .eq('id', gameId)
        .single();

      if (game) {
        const odds = await this.fetchOdds(game.sport_key);
        const gameOdds = odds.find((o: OddsAPIResponse) => o.id === gameId);

        if (gameOdds) {
          // Store closing odds in cached_odds with special flag
          await this.supabase
            .from('cached_odds')
            .upsert({
              cache_key: `closing_${gameId}`,
              sport_key: game.sport_key,
              event_id: gameId,
              odds_data: gameOdds,
              cached_at: new Date().toISOString(),
              expires_at: new Date(commenceTime.getTime() + 24 * 60 * 60 * 1000).toISOString() // Keep for 24 hours
            });

          console.log(`Closing odds captured for ${gameId}`);
        }
      }
    }
  }

  // Get cached odds
  private async getCachedOdds(cacheKey: string) {
    const { data } = await this.supabase
      .from('cached_odds')
      .select('*')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (data) {
      // Update hit count
      await this.supabase
        .from('cached_odds')
        .update({ hit_count: data.hit_count + 1 })
        .eq('cache_key', cacheKey);

      return data.odds_data;
    }

    return null;
  }

  // Cache odds data
  private async cacheOdds(cacheKey: string, data: any, sportKey: string) {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.supabase
      .from('cached_odds')
      .upsert({
        cache_key: cacheKey,
        sport_key: sportKey,
        odds_data: data,
        cached_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        hit_count: 0
      });
  }

  // Track API quota usage
  private async trackQuotaUsage(headers: Headers) {
    const remaining = headers.get('x-requests-remaining');
    const used = headers.get('x-requests-used');

    if (remaining && used) {
      const now = new Date();
      const resetAt = new Date(now);
      resetAt.setMonth(resetAt.getMonth() + 1); // Monthly quota

      await this.supabase
        .from('api_quota_tracking')
        .upsert({
          api_name: 'the-odds-api',
          endpoint: 'odds',
          request_count: parseInt(used),
          quota_limit: parseInt(remaining) + parseInt(used),
          reset_at: resetAt.toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'api_name,endpoint'
        });

      console.log(`Quota: ${used}/${parseInt(remaining) + parseInt(used)} used`);
    }
  }

  // Store games in database
  private async storeGames(odds: OddsAPIResponse[]) {
    for (const game of odds) {
      await this.supabase
        .from('games')
        .upsert({
          id: game.id,
          sport_key: game.sport_key,
          commence_time: game.commence_time,
          home_team: game.home_team,
          away_team: game.away_team,
          status: 'upcoming',
          last_odds_update: new Date().toISOString()
        }, {
          onConflict: 'id'
        });
    }
  }

  // Get upcoming games for a sport
  async getUpcomingGames(sportKey: string) {
    const { data } = await this.supabase
      .from('games')
      .select('*')
      .eq('sport_key', sportKey)
      .eq('status', 'upcoming')
      .gte('commence_time', new Date().toISOString())
      .order('commence_time', { ascending: true });

    return data || [];
  }
}
