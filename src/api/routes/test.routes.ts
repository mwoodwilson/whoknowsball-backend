import { Router, Request, Response } from 'express';
import { OddsAPIService } from '../../services/odds/OddsAPIService';
import { setWithExpiry, getCache } from '../../config/redis';

const router = Router();

// Lazy initialize odds service to avoid env variable issues
const getOddsService = () => new OddsAPIService();

// GET /api/test/current-games - Fetch current games for MLB and NHL
router.get('/current-games', async (req: Request, res: Response) => {
  try {
    const oddsService = getOddsService();
    console.log('Fetching current games for MLB and NHL...');

    // Check quota first
    const hasQuota = await oddsService.checkQuota();
    if (!hasQuota) {
      return res.status(429).json({
        error: 'Daily quota exceeded',
        message: 'API quota limit reached for today'
      });
    }

    const results: any = {
      timestamp: new Date().toISOString(),
      sports: {}
    };

    // Fetch MLB games
    try {
      console.log('Fetching MLB odds...');
      const mlbOdds = await oddsService.fetchSportOdds('MLB');
      results.sports.MLB = {
        count: mlbOdds.length,
        games: mlbOdds.slice(0, 5).map((game: any) => ({
          id: game.id,
          home_team: game.home_team,
          away_team: game.away_team,
          commence_time: game.commence_time,
          bookmakers_count: game.bookmakers?.length || 0,
          sample_odds: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.slice(0, 2)
        }))
      };
    } catch (error) {
      console.error('Error fetching MLB:', error);
      results.sports.MLB = { error: 'Failed to fetch MLB odds' };
    }

    // Fetch NHL games
    try {
      console.log('Fetching NHL odds...');
      const nhlOdds = await oddsService.fetchSportOdds('NHL');
      results.sports.NHL = {
        count: nhlOdds.length,
        games: nhlOdds.slice(0, 5).map((game: any) => ({
          id: game.id,
          home_team: game.home_team,
          away_team: game.away_team,
          commence_time: game.commence_time,
          bookmakers_count: game.bookmakers?.length || 0,
          sample_odds: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.slice(0, 2)
        }))
      };
    } catch (error) {
      console.error('Error fetching NHL:', error);
      results.sports.NHL = { error: 'Failed to fetch NHL odds' };
    }

    // Get quota info
    const quotaInfo = await getQuotaInfo();
    results.quota = quotaInfo;

    res.json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch games',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to get quota information
async function getQuotaInfo() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('api_quota_tracking')
    .select('*')
    .eq('api_name', 'the-odds-api')
    .gte('created_at', today.toISOString())
    .single();

  const used = data?.request_count || 0;
  const limit = 667;
  const remaining = limit - used;

  return {
    used,
    limit,
    remaining,
    percentage_used: ((used / limit) * 100).toFixed(1) + '%'
  };
}

// GET /api/v1/test/redis - Test Redis connection
router.get('/redis', async (req: Request, res: Response) => {
  try {
    const testKey = 'test:redis:connection';
    const testValue = {
      message: 'Redis is working!',
      timestamp: new Date().toISOString(),
      test_number: Math.floor(Math.random() * 1000)
    };

    // Set test value with 10 second expiry
    await setWithExpiry(testKey, testValue, 10);

    // Retrieve the value
    const retrievedValue = await getCache(testKey);

    res.json({
      redis_status: 'working',
      test_value: retrievedValue,
      note: 'This value will expire in 10 seconds'
    });

  } catch (error) {
    console.error('Redis test error:', error);
    res.status(500).json({
      redis_status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      note: 'Make sure Redis is running on localhost:6379'
    });
  }
});

export default router;
