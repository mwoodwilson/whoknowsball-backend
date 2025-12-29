import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { BKSCalculator } from '../../services/bks/BKSCalculator';
import { BetData, Market, Selection, Status, Leg } from '../../services/bks/types';
import { authenticate } from '../../middleware/auth.middleware';
import { bksRateLimiter } from '../../middleware/security.middleware';
import { OddsEnhancementService } from '../../services/odds/OddsEnhancementService';
import { OverallBKSService } from '../../services/bks/OverallBKSService';
import { validateGameIdForBetting } from '../../utils/gameIdValidation';

const router = Router();
const oddsEnhancer = OddsEnhancementService.getInstance();

// Initialize BKS Calculator
const getBKSCalculator = () => new BKSCalculator();

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


/**
 * POST /api/v1/bets/calculate
 * Calculate BKS score for a bet
 *
 * IMPORTANT: This endpoint only returns { bks, status, version }
 * Component breakdowns are internal-only and NOT exposed to clients
 *
 * Request body (BetData):
 * {
 *   bet_id: string,
 *   game_id: string,  // REQUIRED - from odds API
 *   commence_time: string,  // REQUIRED - ISO8601 timestamp for scheduling
 *   sport_key: string,
 *   status: 'PENDING' | 'LIVE' | 'SETTLING' | 'SETTLED' | 'VOID',
 *   market: 'h2h' | '3way' | 'spreads' | 'totals',
 *   selection: 'home' | 'away' | 'draw' | 'over' | 'under',
 *   odds_american: number,
 *   stake: number,
 *   line?: number,  // required for spreads/totals
 *   entry_opposing_odds_american?: number,  // for 2-way CLV
 *   entry_draw_odds_american?: number,  // for 3-way CLV
 *   closing?: { odds_american, opposing_odds_american?, draw_odds_american?, line?, ts },
 *   legs?: Leg[],  // for parlays
 *   correlation?: number,  // [0,1] for SGP
 *   context?: string,  // e.g., 'playoffs', 'finals_contrarian'
 *   timeRatio?: number,  // [0,1] for LIVE bets
 *   score?: { home, away, total? },  // for LIVE bets
 *   final?: { result, home, away, total? },  // for SETTLED bets
 *   stakePercentile?: number  // [0,1] if pre-computed
 * }
 *
 * Response:
 * {
 *   bks: number,      // 0-100, rounded to 1 decimal
 *   status: Status,
 *   version: string
 * }
 */
router.post('/calculate', bksRateLimiter, async (req: Request, res: Response) => {
  try {
    const betData = req.body as BetData;

    // ========================================================================
    // INPUT VALIDATION
    // ========================================================================

    // Required fields
    if (!betData.bet_id || typeof betData.bet_id !== 'string') {
      return res.status(400).json({
        error: 'Invalid bet_id',
        message: 'bet_id is required and must be a string'
      });
    }

    if (!betData.game_id || typeof betData.game_id !== 'string') {
      return res.status(400).json({
        error: 'Invalid game_id',
        message: 'game_id is required and must be a string (from odds API)'
      });
    }

    if (!betData.commence_time || typeof betData.commence_time !== 'string') {
      return res.status(400).json({
        error: 'Invalid commence_time',
        message: 'commence_time is required and must be an ISO8601 timestamp string'
      });
    }

    // Validate commence_time is a valid date
    const commenceDate = new Date(betData.commence_time);
    if (isNaN(commenceDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid commence_time format',
        message: 'commence_time must be a valid ISO8601 timestamp'
      });
    }

    if (!betData.sport_key || typeof betData.sport_key !== 'string') {
      return res.status(400).json({
        error: 'Invalid sport_key',
        message: 'sport_key is required and must be a string'
      });
    }

    // Validate status
    const validStatuses: Status[] = ['PENDING', 'LIVE', 'SETTLING', 'SETTLED', 'VOID'];
    if (!betData.status || !validStatuses.includes(betData.status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `status must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Validate market
    const validMarkets: Market[] = ['h2h', '3way', 'spreads', 'totals'];
    if (!betData.market || !validMarkets.includes(betData.market)) {
      return res.status(400).json({
        error: 'Invalid market',
        message: `market must be one of: ${validMarkets.join(', ')}`
      });
    }

    // Validate selection
    const validSelections: Selection[] = ['home', 'away', 'draw', 'over', 'under'];
    if (!betData.selection || !validSelections.includes(betData.selection)) {
      return res.status(400).json({
        error: 'Invalid selection',
        message: `selection must be one of: ${validSelections.join(', ')}`
      });
    }

    // Validate odds_american
    if (
      typeof betData.odds_american !== 'number' ||
      betData.odds_american === 0 ||
      (betData.odds_american > -100 && betData.odds_american < 100)
    ) {
      return res.status(400).json({
        error: 'Invalid odds_american',
        message:
          'odds_american must be a number, cannot be 0, and must be >= 100 or <= -100'
      });
    }

    // Validate stake
    if (typeof betData.stake !== 'number' || betData.stake <= 0) {
      return res.status(400).json({
        error: 'Invalid stake',
        message: 'stake must be a positive number'
      });
    }

    // Validate line for spreads/totals
    if ((betData.market === 'spreads' || betData.market === 'totals') && betData.line === undefined) {
      return res.status(400).json({
        error: 'Missing line',
        message: 'line is required for spreads and totals markets'
      });
    }

    // Validate draw selection only for 3way market
    if (betData.selection === 'draw' && betData.market !== '3way') {
      return res.status(400).json({
        error: 'Invalid selection for market',
        message: 'draw selection is only valid for 3way market'
      });
    }

    // Validate over/under selection only for totals
    if ((betData.selection === 'over' || betData.selection === 'under') && betData.market !== 'totals') {
      return res.status(400).json({
        error: 'Invalid selection for market',
        message: 'over/under selection is only valid for totals market'
      });
    }

    // Validate timeRatio for LIVE bets
    if (betData.status === 'LIVE') {
      if (betData.timeRatio !== undefined) {
        if (typeof betData.timeRatio !== 'number' || betData.timeRatio < 0 || betData.timeRatio > 1) {
          return res.status(400).json({
            error: 'Invalid timeRatio',
            message: 'timeRatio must be a number between 0 and 1'
          });
        }
      }
    }

    // Validate final result for SETTLED/SETTLING bets
    if ((betData.status === 'SETTLED' || betData.status === 'SETTLING') && !betData.final) {
      return res.status(400).json({
        error: 'Missing final result',
        message: 'final result is required for SETTLED/SETTLING bets'
      });
    }

    // Validate parlay legs
    if (betData.legs && betData.legs.length > 0) {
      if (betData.legs.length > 12) {
        return res.status(400).json({
          error: 'Too many legs',
          message: 'Parlays are capped at 12 legs'
        });
      }

      // Validate each leg
      for (let i = 0; i < betData.legs.length; i++) {
        const leg = betData.legs[i];

        if (!leg.sport_key || !leg.market || !leg.selection || typeof leg.odds_american !== 'number') {
          return res.status(400).json({
            error: `Invalid leg at index ${i}`,
            message: 'Each leg must have sport_key, market, selection, and odds_american'
          });
        }

        if (!validMarkets.includes(leg.market)) {
          return res.status(400).json({
            error: `Invalid leg market at index ${i}`,
            message: `Leg market must be one of: ${validMarkets.join(', ')}`
          });
        }

        if (!validSelections.includes(leg.selection)) {
          return res.status(400).json({
            error: `Invalid leg selection at index ${i}`,
            message: `Leg selection must be one of: ${validSelections.join(', ')}`
          });
        }
      }
    }

    // Validate correlation
    if (betData.correlation !== undefined) {
      if (typeof betData.correlation !== 'number' || betData.correlation < 0 || betData.correlation > 1) {
        return res.status(400).json({
          error: 'Invalid correlation',
          message: 'correlation must be a number between 0 and 1'
        });
      }
    }

    // Validate stakePercentile
    if (betData.stakePercentile !== undefined) {
      if (
        typeof betData.stakePercentile !== 'number' ||
        betData.stakePercentile < 0 ||
        betData.stakePercentile > 1
      ) {
        return res.status(400).json({
          error: 'Invalid stakePercentile',
          message: 'stakePercentile must be a number between 0 and 1'
        });
      }
    }

    // ========================================================================
    // SCHEDULE CLOSING ODDS CAPTURE
    // ========================================================================

    // For PENDING bets, schedule closing odds capture at T-2 minutes
    if (betData.status === 'PENDING') {
      try {
        await oddsEnhancer.scheduleClosingOddsCapture(betData.game_id, betData.commence_time);
      } catch (error) {
        console.error('Error scheduling closing odds capture:', error);
        // Don't fail the request if scheduling fails
      }
    }

    // ========================================================================
    // CALCULATE BKS
    // ========================================================================

    const calculator = getBKSCalculator();
    const result = calculator.calculate(betData);

    // ========================================================================
    // RETURN PUBLIC FIELDS ONLY
    // ========================================================================

    // SECURITY: Do NOT expose base, m, or components to client
    // These are internal-only fields for admin/analysis
    res.json({
      bks: result.bks,
      status: result.status,
      version: result.version
    });

  } catch (error) {
    console.error('BKS calculation error:', error);

    // Handle specific error types
    if (error instanceof TypeError) {
      return res.status(400).json({
        error: 'Invalid input data',
        message: error.message
      });
    }

    if (error instanceof RangeError) {
      return res.status(400).json({
        error: 'Value out of range',
        message: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'BKS calculation failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/bets/validate
 * Validate bet data structure without calculating BKS
 * Useful for pre-flight checks from client
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const betData = req.body as Partial<BetData>;

    const errors: string[] = [];

    // Check required fields
    if (!betData.bet_id) errors.push('bet_id is required');
    if (!betData.sport_key) errors.push('sport_key is required');
    if (!betData.status) errors.push('status is required');
    if (!betData.market) errors.push('market is required');
    if (!betData.selection) errors.push('selection is required');
    if (betData.odds_american === undefined) errors.push('odds_american is required');
    if (betData.stake === undefined) errors.push('stake is required');

    // Check market-specific requirements
    if ((betData.market === 'spreads' || betData.market === 'totals') && betData.line === undefined) {
      errors.push('line is required for spreads and totals markets');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        valid: false,
        errors
      });
    }

    res.json({
      valid: true,
      message: 'Bet data structure is valid'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Validation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/bets/version
 * Get BKS calculator version
 */
router.get('/version', (req: Request, res: Response) => {
  res.json({
    version: process.env.BKS_VERSION || '3.1.5',
    algorithm: 'BKS',
    formula: 'BKS = Base × M',
    base: '[REDACTED - Proprietary Algorithm]',
    components: {
      D: 'Difficulty',
      C: 'Complexity',
      P: 'Payout',
      A: 'Accuracy (CLV)',
      S: 'Stake Significance',
      K: 'Context'
    },
    multiplier: '[REDACTED]',
    note: 'Contact matthew.wood.wilson@gmail.com for licensing inquiries'
  });
});

/**
 * POST /api/v1/bets
 * Place a new bet with full validation and database persistence
 *
 * REQUIRES AUTHENTICATION
 *
 * Request body:
 * - sport_key: string (e.g., 'baseball_mlb')
 * - event_id: string (game ID from odds API)
 * - market: 'h2h' | '3way' | 'spreads' | 'totals'
 * - selection: 'home' | 'away' | 'draw' | 'over' | 'under'
 * - odds_american: number (≥100 or ≤-100)
 * - stake: number (positive)
 * - line?: number (required for spreads/totals)
 * - entry_opposing_odds_american?: number (for 2-way de-vigging)
 * - entry_draw_odds_american?: number (for 3-way markets)
 * - context?: string (preseason/regular/playoffs/finals)
 * - correlation?: number (0-1, for future parlay support)
 *
 * Response:
 * - bet_id: UUID
 * - bks_provisional: number
 * - status: 'PENDING'
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      sport_key,
      event_id,
      market,
      selection,
      odds_american,
      stake,
      line,
      entry_opposing_odds_american,
      entry_draw_odds_american,
      context,
      correlation
    } = req.body;

    // ========================================================================
    // INPUT VALIDATION
    // ========================================================================

    // Required fields
    if (!sport_key || typeof sport_key !== 'string') {
      return res.status(400).json({
        error: 'Invalid sport_key',
        message: 'sport_key is required and must be a string'
      });
    }

    if (!event_id || typeof event_id !== 'string') {
      return res.status(400).json({
        error: 'Invalid event_id',
        message: 'event_id is required and must be a string'
      });
    }

    // SAFEGUARD: Reject bets on legacy hash ID games (they cannot be settled by ScoresJob)
    const gameIdError = validateGameIdForBetting(event_id);
    if (gameIdError) {
      return res.status(400).json({
        error: 'Invalid game',
        message: gameIdError
      });
    }

    // Validate market
    const validMarkets: Market[] = ['h2h', '3way', 'spreads', 'totals'];
    if (!market || !validMarkets.includes(market)) {
      return res.status(400).json({
        error: 'Invalid market',
        message: `market must be one of: ${validMarkets.join(', ')}`
      });
    }

    // Validate selection
    const validSelections: Selection[] = ['home', 'away', 'draw', 'over', 'under'];
    if (!selection || !validSelections.includes(selection)) {
      return res.status(400).json({
        error: 'Invalid selection',
        message: `selection must be one of: ${validSelections.join(', ')}`
      });
    }

    // Validate odds_american format
    if (
      typeof odds_american !== 'number' ||
      odds_american === 0 ||
      (odds_american > -100 && odds_american < 100)
    ) {
      return res.status(400).json({
        error: 'Invalid odds_american',
        message: 'odds_american must be a number, cannot be 0, and must be ≥100 or ≤-100'
      });
    }

    // Validate stake is positive
    if (typeof stake !== 'number' || stake <= 0) {
      return res.status(400).json({
        error: 'Invalid stake',
        message: 'stake must be a positive number'
      });
    }

    // Validate line for spreads/totals
    if ((market === 'spreads' || market === 'totals') && line === undefined) {
      return res.status(400).json({
        error: 'Missing line',
        message: 'line is required for spreads and totals markets'
      });
    }

    // Validate market/selection combinations
    if (selection === 'draw' && market !== '3way') {
      return res.status(400).json({
        error: 'Invalid selection for market',
        message: 'draw selection is only valid for 3way market'
      });
    }

    if ((selection === 'over' || selection === 'under') && market !== 'totals') {
      return res.status(400).json({
        error: 'Invalid selection for market',
        message: 'over/under selection is only valid for totals market'
      });
    }

    // Validate correlation if provided
    if (correlation !== undefined) {
      if (typeof correlation !== 'number' || correlation < 0 || correlation > 1) {
        return res.status(400).json({
          error: 'Invalid correlation',
          message: 'correlation must be a number between 0 and 1'
        });
      }
    }

    // ========================================================================
    // EVENT VALIDATION
    // ========================================================================

    const db = getSupabase();

    // Check if game exists in database
    const { data: gameData, error: gameError } = await db
      .from('games')
      .select('*')
      .eq('id', event_id)
      .single();

    if (gameError || !gameData) {
      return res.status(404).json({
        error: 'Game not found',
        message: `Game with id ${event_id} does not exist in database`,
        event_id
      });
    }

    // Allow betting on upcoming AND live games, only block finished games
    // Live betting is a core feature - users can bet on games in progress
    if (gameData.completed || gameData.status === 'completed') {
      return res.status(400).json({
        error: 'Game already finished',
        message: `Cannot place bet - game has already finished`,
        game: {
          id: gameData.id,
          home_team: gameData.home_team,
          away_team: gameData.away_team,
          status: gameData.status
        }
      });
    }

    // ========================================================================
    // CHECK FOR DUPLICATE BETS
    // ========================================================================

    // Check if identical bet already exists for this user (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: duplicateCheck } = await db
      .from('bets')
      .select('id')
      .eq('user_id', req.user!.id)
      .eq('game_id', event_id)
      .eq('selection', selection)
      .eq('odds', odds_american)
      .eq('stake', stake)
      .gte('placed_at', fiveMinutesAgo.toISOString())
      .limit(1);

    if (duplicateCheck && duplicateCheck.length > 0) {
      return res.status(409).json({
        error: 'Duplicate bet',
        message: 'Identical bet was placed within the last 5 minutes',
        existing_bet_id: duplicateCheck[0].id
      });
    }

    // ========================================================================
    // FETCH OPPOSING ODDS FROM OPENING_ODDS TABLE
    // ========================================================================

    let opposingOdds = entry_opposing_odds_american;
    let drawOdds = entry_draw_odds_american;

    // If opposing odds not provided, fetch from opening_odds table
    if (!opposingOdds) {
      try {
        const { data: openingOdds, error: oddsError } = await db
          .from('opening_odds')
          .select('odds_data')
          .eq('game_id', event_id)
          .limit(1)
          .single();

        if (!oddsError && openingOdds && openingOdds.odds_data) {
          const oddsData = openingOdds.odds_data;

          // Extract opposing odds based on market and selection
          if (market === 'h2h' || market === '3way') {
            const h2hOutcomes = oddsData.h2h || [];

            if (selection === 'home') {
              const awayOutcome = h2hOutcomes.find((o: any) => o.name === 'away' || o.name.toLowerCase().includes('away'));
              opposingOdds = awayOutcome?.price;
            } else if (selection === 'away') {
              const homeOutcome = h2hOutcomes.find((o: any) => o.name === 'home' || o.name.toLowerCase().includes('home'));
              opposingOdds = homeOutcome?.price;
            } else if (selection === 'draw' && market === '3way') {
              // For draw, get both home and away as opposing
              const homeOutcome = h2hOutcomes.find((o: any) => o.name === 'home' || o.name.toLowerCase().includes('home'));
              opposingOdds = homeOutcome?.price;
            }

            // Get draw odds for 3-way markets
            if (market === '3way') {
              const drawOutcome = h2hOutcomes.find((o: any) => o.name === 'draw');
              drawOdds = drawOutcome?.price;
            }
          } else if (market === 'spreads') {
            const spreadOutcomes = oddsData.spreads || [];

            if (selection === 'home') {
              const awayOutcome = spreadOutcomes.find((o: any) =>
                (o.name === 'away' || o.name.toLowerCase().includes('away')) &&
                o.point === -(line || 0)
              );
              opposingOdds = awayOutcome?.price;
            } else if (selection === 'away') {
              const homeOutcome = spreadOutcomes.find((o: any) =>
                (o.name === 'home' || o.name.toLowerCase().includes('home')) &&
                o.point === -(line || 0)
              );
              opposingOdds = homeOutcome?.price;
            }
          } else if (market === 'totals') {
            const totalsOutcomes = oddsData.totals || [];

            if (selection === 'over') {
              const underOutcome = totalsOutcomes.find((o: any) =>
                o.name === 'Under' && o.point === line
              );
              opposingOdds = underOutcome?.price;
            } else if (selection === 'under') {
              const overOutcome = totalsOutcomes.find((o: any) =>
                o.name === 'Over' && o.point === line
              );
              opposingOdds = overOutcome?.price;
            }
          }

          console.log(`📊 Fetched opposing odds from opening_odds: ${opposingOdds}`);
        }
      } catch (error) {
        console.error('Error fetching opening odds:', error);
        // Continue without opposing odds - BKS will use default CLV
      }
    }

    // ========================================================================
    // CALCULATE BKS SCORE
    // ========================================================================

    // Determine bet status: LIVE if game has started, PENDING if upcoming
    const gameCommenceTime = new Date(gameData.commence_time);
    const now = new Date();
    const betStatus: Status = gameCommenceTime <= now ? 'LIVE' : 'PENDING';

    console.log(`🎯 Bet status: ${betStatus} (game starts at ${gameCommenceTime.toISOString()}, now is ${now.toISOString()})`);

    const betData: BetData = {
      bet_id: 'temp', // Will be replaced with UUID from database
      sport_key,
      status: betStatus,
      market,
      selection,
      odds_american,
      stake,
      line: line !== undefined ? parseFloat(line) : undefined,
      entry_opposing_odds_american: opposingOdds,
      entry_draw_odds_american: drawOdds,
      context: context || 'regular',
      correlation: correlation || 0
    };

    const calculator = getBKSCalculator();
    const bksResult = calculator.calculate(betData);

    // ========================================================================
    // SAVE TO DATABASE
    // ========================================================================

    // Map market to bet_type for database
    const betTypeMap: Record<Market, string> = {
      'h2h': 'moneyline',
      '3way': 'moneyline',
      'spreads': 'spread',
      'totals': 'total'
    };

    const betType = betTypeMap[market];
    const marketType = market === '3way' ? '3way' : '2way';

    const { data: insertedBet, error: insertError } = await db
      .from('bets')
      .insert({
        user_id: req.user!.id,
        game_id: event_id,
        sport_key,
        bet_type: betType,
        market_type: marketType,
        selection,
        team: selection === 'home' ? gameData.home_team :
              selection === 'away' ? gameData.away_team : null,
        line: line || null,
        odds: odds_american,
        stake,
        legs: 1, // Single bet

        // BKS v3.1.5 fields
        entry_opposing_odds_american: entry_opposing_odds_american || null,
        entry_draw_odds_american: entry_draw_odds_american || null,
        correlation: correlation || 0,
        context: context || 'regular',

        // BKS component scores (from calculation)
        // Clamp base_score to 100 for database constraint (unclamped base can exceed 100)
        base_score: Math.min(bksResult.base, 100),
        difficulty: bksResult.components.D,
        complexity: bksResult.components.C,
        payout: bksResult.components.P,
        accuracy_clv: bksResult.components.A,
        stake_significance: bksResult.components.S,
        context_novelty: bksResult.components.K,

        // BKS results
        bks_provisional: bksResult.bks,
        m_provisional: bksResult.m,

        status: betStatus,  // Use calculated status (LIVE or PENDING)
        outcome: null,
        placement_signature: bksResult.signature
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return res.status(500).json({
        error: 'Failed to save bet',
        message: insertError.message
      });
    }

    // ========================================================================
    // RETURN PUBLIC RESPONSE
    // ========================================================================

    // Only return public fields (DO NOT expose components, base, multiplier)
    res.status(201).json({
      success: true,
      bet_id: insertedBet.id,
      bks_provisional: insertedBet.bks_provisional,
      status: insertedBet.status,
      game: {
        id: gameData.id,
        home_team: gameData.home_team,
        away_team: gameData.away_team,
        commence_time: gameData.commence_time
      },
      bet: {
        market,
        selection,
        odds_american,
        stake,
        line
      },
      placed_at: insertedBet.placed_at
    });

  } catch (error) {
    console.error('Bet placement error:', error);
    res.status(500).json({
      error: 'Failed to place bet',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/bets/:betId
 * Retrieve a single bet by ID
 *
 * REQUIRES AUTHENTICATION
 * Users can only view their own bets
 */
router.get('/:betId', authenticate, async (req: Request, res: Response) => {
  try {
    const { betId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(betId)) {
      return res.status(400).json({
        error: 'Invalid bet_id',
        message: 'bet_id must be a valid UUID'
      });
    }

    const db = getSupabase();

    // Fetch bet with game details
    const { data: bet, error } = await db
      .from('bets')
      .select(`
        *,
        games (
          id,
          home_team,
          away_team,
          commence_time,
          home_score,
          away_score,
          completed,
          status
        )
      `)
      .eq('id', betId)
      .eq('user_id', req.user!.id) // Only allow user to see their own bets
      .single();

    if (error || !bet) {
      return res.status(404).json({
        error: 'Bet not found',
        message: `Bet with id ${betId} does not exist`
      });
    }

    // Return public fields only
    res.json({
      success: true,
      bet: {
        id: bet.id,
        sport_key: bet.sport_key,
        market_type: bet.market_type,
        selection: bet.selection,
        team: bet.team,
        line: bet.line,
        odds: bet.odds,
        stake: bet.stake,
        bks_provisional: bet.bks_provisional,
        bks_final: bet.bks_final,
        status: bet.status,
        outcome: bet.outcome,
        placed_at: bet.placed_at,
        settled_at: bet.settled_at,
        game: bet.games
      }
    });

  } catch (error) {
    console.error('Bet retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve bet',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/v1/bets
 * List all bets for the current user
 *
 * REQUIRES AUTHENTICATION
 * Users can only view their own bets
 *
 * Query params:
 * - status: Filter by status (PENDING/LIVE/SETTLING/SETTLED/VOID)
 * - sport_key: Filter by sport
 * - limit: Max results (default 20, max 100)
 * - offset: Pagination offset (default 0)
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      status,
      sport_key,
      limit = '20',
      offset = '0'
    } = req.query;

    // Validate limit and offset
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offsetNum = parseInt(offset as string) || 0;

    const db = getSupabase();

    // Build query
    let query = db
      .from('bets')
      .select(`
        *,
        games (
          id,
          home_team,
          away_team,
          commence_time,
          completed,
          status
        ),
        parlay_legs (
          leg_number,
          game_id,
          sport_key,
          bet_type,
          market,
          selection,
          team,
          line,
          odds,
          outcome
        )
      `, { count: 'exact' })
      .eq('user_id', req.user!.id);

    // Apply filters
    if (status && typeof status === 'string') {
      query = query.eq('status', status.toUpperCase());
    }

    if (sport_key && typeof sport_key === 'string') {
      query = query.eq('sport_key', sport_key);
    }

    // Order by placed_at descending (most recent first)
    query = query
      .order('placed_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data: bets, error, count } = await query;

    if (error) {
      console.error('Bet list error:', error);
      return res.status(500).json({
        error: 'Failed to retrieve bets',
        message: error.message
      });
    }

    // Transform to public format
    const publicBets = (bets || []).map(bet => ({
      id: bet.id,
      sport_key: bet.sport_key,
      bet_type: bet.bet_type,  // moneyline, spread, total, parlay
      legs: bet.legs || null,  // Number of legs for parlays
      parlay_legs: bet.parlay_legs || null,  // Detailed leg info for parlays
      market_type: bet.market_type,
      selection: bet.selection,
      team: bet.team,
      line: bet.line,
      odds: bet.odds,
      stake: bet.stake,
      bks_provisional: bet.bks_provisional,
      bks_final: bet.bks_final,
      status: bet.status,
      outcome: bet.outcome,
      placed_at: bet.placed_at,
      settled_at: bet.settled_at,
      game: bet.games
    }));

    res.json({
      success: true,
      bets: publicBets,
      pagination: {
        total: count || 0,
        limit: limitNum,
        offset: offsetNum,
        has_more: (count || 0) > offsetNum + limitNum
      }
    });

  } catch (error) {
    console.error('Bet list error:', error);
    res.status(500).json({
      error: 'Failed to retrieve bets',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/v1/bets/parlay
 * Place a multi-leg parlay bet with full validation and database persistence
 *
 * REQUIRES AUTHENTICATION
 *
 * Request body:
 * - legs: Array of bet legs (2-12 legs)
 *   Each leg:
 *   - game_id: string
 *   - sport_key: string
 *   - market: 'h2h' | '3way' | 'spreads' | 'totals'
 *   - selection: 'home' | 'away' | 'draw' | 'over' | 'under'
 *   - odds_american: number
 *   - line?: number (for spreads/totals)
 *   - entry_opposing_odds_american?: number
 *   - market_type: '2way' | '3way'
 * - stake: number (positive)
 * - parlay_odds_american: number (combined parlay odds)
 * - context?: string (preseason/regular/playoffs/finals)
 * - correlation?: number (0-1, for SGP)
 *
 * Response:
 * - bet_id: UUID
 * - bks_provisional: number
 * - status: 'PENDING'
 */
router.post('/parlay', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      legs,
      stake,
      parlay_odds_american,
      context,
      correlation
    } = req.body;

    console.log('[Parlay Placement] Request received:', {
      legs: legs?.length,
      stake,
      parlay_odds_american,
      user_id: req.user?.id,
      game_ids: legs?.map(l => l.game_id)
    });

    // ========================================================================
    // INPUT VALIDATION
    // ========================================================================

    // Validate legs array
    if (!Array.isArray(legs) || legs.length < 2 || legs.length > 12) {
      return res.status(400).json({
        error: 'Invalid legs',
        message: 'Parlays must have between 2 and 12 legs'
      });
    }

    // Validate stake
    if (typeof stake !== 'number' || stake <= 0) {
      return res.status(400).json({
        error: 'Invalid stake',
        message: 'stake must be a positive number'
      });
    }

    // Validate parlay odds
    if (
      typeof parlay_odds_american !== 'number' ||
      parlay_odds_american === 0 ||
      (parlay_odds_american > -100 && parlay_odds_american < 100)
    ) {
      return res.status(400).json({
        error: 'Invalid parlay_odds_american',
        message: 'parlay_odds_american must be a number, cannot be 0, and must be ≥100 or ≤-100'
      });
    }

    // Validate each leg
    const validMarkets: Market[] = ['h2h', '3way', 'spreads', 'totals'];
    const validSelections: Selection[] = ['home', 'away', 'draw', 'over', 'under'];

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];

      if (!leg.game_id || typeof leg.game_id !== 'string') {
        return res.status(400).json({
          error: `Invalid leg ${i + 1}`,
          message: 'game_id is required and must be a string'
        });
      }

      // SAFEGUARD: Reject parlay legs on legacy hash ID games (they cannot be settled)
      const legGameIdError = validateGameIdForBetting(leg.game_id);
      if (legGameIdError) {
        return res.status(400).json({
          error: `Invalid leg ${i + 1} game`,
          message: legGameIdError
        });
      }

      if (!leg.sport_key || typeof leg.sport_key !== 'string') {
        return res.status(400).json({
          error: `Invalid leg ${i + 1}`,
          message: 'sport_key is required and must be a string'
        });
      }

      if (!validMarkets.includes(leg.market)) {
        return res.status(400).json({
          error: `Invalid leg ${i + 1} market`,
          message: `market must be one of: ${validMarkets.join(', ')}`
        });
      }

      if (!validSelections.includes(leg.selection)) {
        return res.status(400).json({
          error: `Invalid leg ${i + 1} selection`,
          message: `selection must be one of: ${validSelections.join(', ')}`
        });
      }

      if (
        typeof leg.odds_american !== 'number' ||
        leg.odds_american === 0 ||
        (leg.odds_american > -100 && leg.odds_american < 100)
      ) {
        return res.status(400).json({
          error: `Invalid leg ${i + 1} odds`,
          message: 'odds_american must be a number, cannot be 0, and must be ≥100 or ≤-100'
        });
      }

      // Validate line for spreads/totals
      if ((leg.market === 'spreads' || leg.market === 'totals') && leg.line === undefined) {
        return res.status(400).json({
          error: `Missing line in leg ${i + 1}`,
          message: 'line is required for spreads and totals markets'
        });
      }
    }

    // ========================================================================
    // GAME VALIDATION
    // ========================================================================

    const db = getSupabase();

    // Check all games exist and haven't commenced
    const gameIds = legs.map(leg => leg.game_id);
    console.log('[Parlay Placement] Looking for game IDs:', gameIds);

    const { data: gamesData, error: gamesError } = await db
      .from('games')
      .select('*')
      .in('id', gameIds);

    console.log('[Parlay Placement] Found games:', gamesData?.length || 0);
    console.log('[Parlay Placement] Found game IDs:', gamesData?.map(g => g.id) || []);

    if (gamesError) {
      console.error('[Parlay Placement] Error fetching games:', gamesError);
      return res.status(500).json({
        error: 'Failed to validate games',
        message: gamesError.message
      });
    }

    // Ensure all games were found
    // Note: gameIds may contain duplicates (same game, different bets)
    // but gamesData will only contain unique games
    const foundIds = gamesData?.map(g => g.id) || [];
    const uniqueGameIds = [...new Set(gameIds)];
    const missingIds = uniqueGameIds.filter(id => !foundIds.includes(id));

    console.log('[Parlay Placement] Missing game IDs:', missingIds);

    if (!gamesData || missingIds.length > 0) {
      return res.status(404).json({
        error: 'Games not found',
        message: `Games not found: ${missingIds.join(', ')}`,
        missing_game_ids: missingIds
      });
    }

    // Allow betting on upcoming AND live games, only block finished games
    // Live betting is a core feature - users can bet on games in progress
    const finishedGames = gamesData.filter(g => g.completed || g.status === 'completed');

    if (finishedGames.length > 0) {
      return res.status(400).json({
        error: 'Games already finished',
        message: `Cannot place parlay - some games have already finished`,
        finished_games: finishedGames.map(g => ({
          id: g.id,
          home_team: g.home_team,
          away_team: g.away_team,
          status: g.status
        }))
      });
    }

    // ========================================================================
    // CALCULATE BKS SCORE FOR PARLAY
    // ========================================================================

    // Use the first game as the primary game for commence_time
    const primaryGame = gamesData[0];

    // Determine bet status: LIVE if any game has started, PENDING if all upcoming
    // For parlays, if ANY leg has started, the entire parlay is considered LIVE
    const now = new Date();
    const anyGameStarted = gamesData.some(game => new Date(game.commence_time) <= now);
    const betStatus: Status = anyGameStarted ? 'LIVE' : 'PENDING';

    console.log(`🎯 Parlay bet status: ${betStatus} (${gamesData.filter(g => new Date(g.commence_time) <= now).length}/${gamesData.length} games started)`);

    const parlayBetData: BetData = {
      bet_id: 'temp', // Will be replaced with UUID from database
      game_id: primaryGame.id,
      commence_time: primaryGame.commence_time,
      sport_key: legs[0].sport_key,
      status: betStatus,
      market: legs[0].market,
      selection: legs[0].selection,
      odds_american: parlay_odds_american,
      stake,
      entry_opposing_odds_american: legs[0].entry_opposing_odds_american,
      context: context || 'regular',
      correlation: correlation || 0,
      legs: legs.map(leg => ({
        sport_key: leg.sport_key,
        market: leg.market,
        selection: leg.selection,
        odds_american: leg.odds_american,
        entry_opposing_odds_american: leg.entry_opposing_odds_american,
        market_type: leg.market_type || '2way',
        line: leg.line
      }))
    };

    const calculator = getBKSCalculator();
    const bksResult = calculator.calculate(parlayBetData);

    console.log('[Parlay Placement] BKS calculated:', {
      bks: bksResult.bks,
      base: bksResult.base,
      m: bksResult.m
    });

    // ========================================================================
    // SAVE PARLAY TO DATABASE
    // ========================================================================

    // Create parent parlay bet
    const { data: insertedBet, error: insertError } = await db
      .from('bets')
      .insert({
        user_id: req.user!.id,
        game_id: primaryGame.id,  // Primary game (first leg)
        sport_key: legs[0].sport_key,
        bet_type: 'parlay',
        market_type: legs[0].market_type || '2way',
        selection: null,  // Parlays don't have a single selection
        team: null,
        line: null,
        odds: parlay_odds_american,
        stake,
        legs: legs.length,

        // BKS v3.1.5 fields
        entry_opposing_odds_american: null,
        entry_draw_odds_american: null,
        correlation: correlation || 0,
        context: context || 'regular',

        // BKS component scores
        // Clamp base_score to 100 for database constraint (unclamped base can exceed 100)
        base_score: Math.min(bksResult.base, 100),
        difficulty: bksResult.components.D,
        complexity: bksResult.components.C,
        payout: bksResult.components.P,
        accuracy_clv: bksResult.components.A,
        stake_significance: bksResult.components.S,
        context_novelty: bksResult.components.K,

        // BKS results
        bks_provisional: bksResult.bks,
        m_provisional: bksResult.m,

        status: betStatus,  // Use calculated status (LIVE or PENDING)
        outcome: null,
        placement_signature: bksResult.signature
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Parlay Placement] Error inserting parlay bet:', insertError);
      return res.status(500).json({
        error: 'Failed to save parlay bet',
        message: insertError.message
      });
    }

    console.log('[Parlay Placement] Parlay bet created:', insertedBet.id);

    // Helper function to convert market to bet_type
    const getBetType = (market: string): string => {
      if (market === 'h2h') return 'moneyline';
      if (market === 'spreads') return 'spread';
      if (market === 'totals') return 'total';
      return market; // fallback
    };

    // Save individual legs to parlay_legs table
    const parlayLegsData = legs.map((leg, index) => {
      const legGame = gamesData.find(g => g.id === leg.game_id);

      return {
        bet_id: insertedBet.id,
        leg_number: index + 1,
        game_id: leg.game_id,
        sport_key: leg.sport_key,
        bet_type: getBetType(leg.market),  // Derive from market
        market: leg.market,
        selection: leg.selection,
        team: leg.selection === 'home' ? legGame?.home_team :
              leg.selection === 'away' ? legGame?.away_team : null,
        line: leg.line || null,
        odds: leg.odds_american,
        entry_opposing_odds_american: leg.entry_opposing_odds_american || null,
        market_type: leg.market_type || '2way'
      };
    });

    const { error: legsInsertError } = await db
      .from('parlay_legs')
      .insert(parlayLegsData);

    if (legsInsertError) {
      console.error('[Parlay Placement] Error inserting parlay legs:', legsInsertError);
      // Rollback - delete the parent bet
      await db.from('bets').delete().eq('id', insertedBet.id);

      return res.status(500).json({
        error: 'Failed to save parlay legs',
        message: legsInsertError.message
      });
    }

    console.log('[Parlay Placement] Parlay legs saved:', parlayLegsData.length);

    // ========================================================================
    // UPDATE OVERALL BKS
    // ========================================================================
    // Update user's overall BKS immediately after bet placement
    // This gives provisional BKS until bet settles
    // CRITICAL: Wrap in try-catch so BKS update failure doesn't fail the bet placement
    try {
      const bksService = new OverallBKSService();
      await bksService.updateUserBKS(req.user!.id);
    } catch (bksError) {
      // Log the error but don't fail the bet placement
      // User's overall BKS will be updated on next bet or by settlement job
      console.error('[Parlay Placement] Warning: Failed to update user BKS:', bksError);
    }

    // ========================================================================
    // RETURN PUBLIC RESPONSE
    // ========================================================================

    res.status(201).json({
      success: true,
      bet_id: insertedBet.id,
      bks_provisional: Math.round(insertedBet.bks_provisional),
      status: insertedBet.status,
      parlay: {
        legs: legs.length,
        odds_american: parlay_odds_american,
        stake
      },
      games: gamesData.map(g => ({
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time
      })),
      placed_at: insertedBet.placed_at
    });

  } catch (error) {
    console.error('[Parlay Placement] Error:', error);
    res.status(500).json({
      error: 'Failed to place parlay',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;
