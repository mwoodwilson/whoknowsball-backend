import { Router, Request, Response } from 'express';
import { OddsAPIService } from '../../services/odds/OddsAPIService';
import { BKSCalculator } from '../../services/bks/BKSCalculator';
import { BetData, Market, Selection } from '../../services/bks/types';

const router = Router();

// Lazy initialize services
const getOddsService = () => new OddsAPIService();
const getBKSCalculator = () => new BKSCalculator();

/**
 * POST /api/bets
 * Create a new bet and calculate BKS score
 *
 * Request body:
 * - game_id: string
 * - sport_key: string (e.g., 'basketball_nba')
 * - team_selection: 'home' | 'away' | 'draw' | 'over' | 'under'
 * - odds_american: number
 * - stake: number
 * - market: 'h2h' | '3way' | 'spreads' | 'totals'
 * - line?: number (required for spreads/totals)
 *
 * Response:
 * - bks: number (0-100, 1 decimal place)
 * - status: 'PENDING'
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      game_id,
      sport_key,
      team_selection,
      odds_american,
      stake,
      market,
      line
    } = req.body;

    // Validate required fields
    if (!game_id || !sport_key || !team_selection || !odds_american || !stake || !market) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['game_id', 'sport_key', 'team_selection', 'odds_american', 'stake', 'market']
      });
    }

    // Validate market type
    const validMarkets: Market[] = ['h2h', '3way', 'spreads', 'totals'];
    if (!validMarkets.includes(market)) {
      return res.status(400).json({
        error: 'Invalid market type',
        valid_markets: validMarkets
      });
    }

    // Validate selection
    const validSelections: Selection[] = ['home', 'away', 'draw', 'over', 'under'];
    if (!validSelections.includes(team_selection)) {
      return res.status(400).json({
        error: 'Invalid team selection',
        valid_selections: validSelections
      });
    }

    // Validate line for spreads/totals
    if ((market === 'spreads' || market === 'totals') && line === undefined) {
      return res.status(400).json({
        error: 'Line is required for spreads and totals markets'
      });
    }

    // Validate stake is positive
    if (stake <= 0) {
      return res.status(400).json({
        error: 'Stake must be greater than 0'
      });
    }

    // Fetch current odds for validation
    const oddsService = getOddsService();
    let currentOdds;

    try {
      // Map sport_key to the format expected by OddsAPIService
      const sportKeyMap: Record<string, 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'EPL'> = {
        'americanfootball_nfl': 'NFL',
        'basketball_nba': 'NBA',
        'baseball_mlb': 'MLB',
        'icehockey_nhl': 'NHL',
        'soccer_epl': 'EPL'
      };

      const sportName = sportKeyMap[sport_key];
      if (!sportName) {
        return res.status(400).json({
          error: 'Unsupported sport',
          supported_sports: Object.keys(sportKeyMap)
        });
      }

      currentOdds = await oddsService.fetchSportOdds(sportName);

      // Find the specific game
      const game = currentOdds.find((g: any) => g.id === game_id);
      if (!game) {
        return res.status(404).json({
          error: 'Game not found',
          game_id
        });
      }

      console.log(`Validated bet for game: ${game.home_team} vs ${game.away_team}`);
    } catch (error) {
      console.error('Error fetching odds for validation:', error);
      // Continue with bet creation even if odds fetch fails (offline mode)
    }

    // Generate bet_id
    const bet_id = `bet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create BetData object with PENDING status
    const betData: BetData = {
      bet_id,
      sport_key,
      status: 'PENDING',
      market,
      selection: team_selection,
      odds_american,
      stake,
      line: line !== undefined ? parseFloat(line) : undefined
    };

    // Calculate BKS using BKSCalculator
    const calculator = getBKSCalculator();
    const result = calculator.calculate(betData);

    // Return only public fields (bks, status, version)
    // DO NOT expose base, m, or components to client
    res.json({
      success: true,
      bet_id,
      bks: result.bks,
      status: result.status,
      version: result.version,
      game_id,
      odds_american,
      stake
    });

  } catch (error) {
    console.error('Bet creation error:', error);
    res.status(500).json({
      error: 'Failed to create bet',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/bets/validate-game/:game_id
 * Validate that a game exists and return current odds
 */
router.get('/validate-game/:game_id', async (req: Request, res: Response) => {
  try {
    const { game_id } = req.params;
    const { sport_key } = req.query;

    if (!sport_key) {
      return res.status(400).json({
        error: 'sport_key query parameter is required'
      });
    }

    const oddsService = getOddsService();

    // Map sport_key to sport name
    const sportKeyMap: Record<string, 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'EPL'> = {
      'americanfootball_nfl': 'NFL',
      'basketball_nba': 'NBA',
      'baseball_mlb': 'MLB',
      'icehockey_nhl': 'NHL',
      'soccer_epl': 'EPL'
    };

    const sportName = sportKeyMap[sport_key as string];
    if (!sportName) {
      return res.status(400).json({
        error: 'Unsupported sport',
        supported_sports: Object.keys(sportKeyMap)
      });
    }

    const odds = await oddsService.fetchSportOdds(sportName);
    const game = odds.find((g: any) => g.id === game_id);

    if (!game) {
      return res.status(404).json({
        error: 'Game not found',
        game_id
      });
    }

    res.json({
      success: true,
      game: {
        id: game.id,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: game.commence_time,
        bookmakers_count: game.bookmakers?.length || 0
      }
    });

  } catch (error) {
    console.error('Game validation error:', error);
    res.status(500).json({
      error: 'Failed to validate game',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
