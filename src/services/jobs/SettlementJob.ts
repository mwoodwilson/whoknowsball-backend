import { supabase } from '../../config/supabase';
import { BKSCalculator } from '../bks/BKSCalculator';
import { BetData } from '../bks/types';
import { OverallBKSService } from '../bks/OverallBKSService';
import { dailyBKSService } from '../DailyBKSService';

export class SettlementJob {
  private calculator = new BKSCalculator();
  private bksService = new OverallBKSService();

  async run() {
    try {
      console.log('🔄 Running settlement job...');

      // Find games that have commenced (past commence_time) with PENDING or LIVE bets
      // EXCLUDE parlay bets from this query - they'll be handled separately
      const now = new Date();
      const { data: bets, error } = await supabase
        .from('bets')
        .select(`
          id,
          user_id,
          game_id,
          sport_key,
          bet_type,
          market_type,
          selection,
          odds,
          stake,
          line,
          status,
          outcome,
          bks_provisional,
          games (
            id,
            commence_time,
            completed,
            home_score,
            away_score
          )
        `)
        .in('status', ['PENDING', 'LIVE'])
        .neq('bet_type', 'parlay')  // Exclude parlay bets
        .order('games(commence_time)', { ascending: true });

      if (error) {
        console.error('Error fetching bets for settlement:', error);
        return;
      }

      console.log(`📊 [SettlementJob] Found ${bets?.length || 0} single bet(s) to process`);

      let settledCount = 0;
      let transitionedToLive = 0;

      // Process single bets (if any)
      if (!bets || bets.length === 0) {
        console.log('No single bets to settle');
      } else {

      for (const bet of bets) {
        const game = (bet as any).games;

        console.log(`[SettlementJob] Processing bet ${bet.id} (${bet.sport_key}, status: ${bet.status})`);

        if (!game) {
          console.log(`⚠️  Bet ${bet.id} has no associated game`);
          continue;
        }

        const commenceTime = new Date(game.commence_time);
        const isGameStarted = commenceTime <= now;

        console.log(`  Game: ${game.id}, Started: ${isGameStarted}, Completed: ${game.completed}`);

        // Transition PENDING bets to LIVE if game has started
        if (bet.status === 'PENDING' && isGameStarted) {
          await this.transitionToLive(bet.id);
          transitionedToLive++;
          continue;
        }

        // Settle completed games
        if (game.completed && bet.status === 'LIVE') {
          await this.settleBet(bet, game);
          settledCount++;
        }
      }
      } // End of single bet processing

      // Process parlay bets
      const { data: parlayBets, error: parlayError } = await supabase
        .from('bets')
        .select(`
          id,
          user_id,
          sport_key,
          bet_type,
          odds,
          stake,
          status,
          legs
        `)
        .eq('bet_type', 'parlay')
        .in('status', ['PENDING', 'LIVE'])
        .order('placed_at', { ascending: true });

      if (parlayError) {
        console.error('Error fetching parlay bets:', parlayError);
      } else if (parlayBets && parlayBets.length > 0) {
        console.log(`📊 [SettlementJob] Found ${parlayBets.length} parlay bet(s) to process`);

        let parlayLegsSettled = 0;
        let parlayBetsSettled = 0;
        let parlayTransitionedToLive = 0;

        for (const parlayBet of parlayBets) {
          console.log(`[SettlementJob] Processing parlay bet ${parlayBet.id} (status: ${parlayBet.status})`);

          // First, check if PENDING parlay should transition to LIVE
          if (parlayBet.status === 'PENDING') {
            const shouldTransition = await this.checkParlayGameStart(parlayBet.id);
            if (shouldTransition) {
              await this.transitionToLive(parlayBet.id);
              parlayTransitionedToLive++;
              console.log(`🟢 Parlay ${parlayBet.id} transitioned to LIVE`);
              continue; // Skip to next parlay - we'll process settlement on next run
            }
          }

          // Then, settle any completed legs
          const legsSettled = await this.settleParlayLegs(parlayBet);
          parlayLegsSettled += legsSettled;

          // Finally, try to settle the overall parlay if all legs are settled
          const betSettled = await this.settleParlayBet(parlayBet);
          if (betSettled) {
            parlayBetsSettled++;
          }
        }

        if (parlayLegsSettled > 0 || parlayBetsSettled > 0 || parlayTransitionedToLive > 0) {
          console.log(`✅ Parlay settlement: ${parlayTransitionedToLive} transitioned to LIVE, ${parlayLegsSettled} legs settled, ${parlayBetsSettled} parlays completed`);
        }
      } else {
        console.log('No parlay bets to process');
      }

      if (settledCount > 0 || transitionedToLive > 0) {
        console.log(`✅ Settlement complete: ${settledCount} bets settled, ${transitionedToLive} transitioned to LIVE`);
      }
    } catch (error) {
      console.error('SettlementJob error:', error);
    }
  }

  /**
   * Check if any game in a parlay has started
   */
  private async checkParlayGameStart(parlayBetId: string): Promise<boolean> {
    try {
      const now = new Date();

      // Fetch all legs for this parlay with their associated games
      const { data: legs, error: legsError } = await supabase
        .from('parlay_legs')
        .select(`
          id,
          leg_number,
          game_id,
          games (
            id,
            commence_time
          )
        `)
        .eq('bet_id', parlayBetId)
        .order('leg_number', { ascending: true });

      if (legsError || !legs || legs.length === 0) {
        console.log(`⚠️  Cannot check parlay ${parlayBetId} game start - no legs found`);
        return false;
      }

      // Check if ANY game has started
      for (const leg of legs) {
        const game = (leg as any).games;
        if (game) {
          const commenceTime = new Date(game.commence_time);
          const hasStarted = commenceTime <= now;

          console.log(`  Parlay leg ${leg.leg_number}: Game ${game.id}, started: ${hasStarted}`);

          if (hasStarted) {
            console.log(`  ✅ At least one game has started - parlay should be LIVE`);
            return true;
          }
        }
      }

      console.log(`  All games are upcoming - parlay remains PENDING`);
      return false;
    } catch (error) {
      console.error(`Error in checkParlayGameStart for parlay ${parlayBetId}:`, error);
      return false;
    }
  }

  private async transitionToLive(betId: string) {
    try {
      const { error } = await supabase
        .from('bets')
        .update({
          status: 'LIVE',
          updated_at: new Date().toISOString()
        })
        .eq('id', betId);

      if (error) {
        console.error(`Error transitioning bet ${betId} to LIVE:`, error);
      } else {
        console.log(`🟢 Bet ${betId} transitioned to LIVE`);
      }
    } catch (error) {
      console.error(`Error in transitionToLive for bet ${betId}:`, error);
    }
  }

  private async settleBet(bet: any, game: any) {
    try {
      // Determine bet outcome (WIN/LOSS/PUSH)
      const outcome = this.determineBetResult(bet, game);

      // Skip settlement if scores are missing
      if (outcome === null) {
        console.log(`[SettlementJob] ⏳ Skipping bet ${bet.id} - waiting for scores`);
        return;
      }

      // Map bet_type to market for BKS calculator
      let market: 'h2h' | '3way' | 'spreads' | 'totals' = 'h2h';
      if (bet.bet_type === 'spread') market = 'spreads';
      else if (bet.bet_type === 'total') market = 'totals';
      else if (bet.market_type === '3way') market = '3way';

      // Calculate final BKS score with game scores for z-score calculation
      const betData: BetData = {
        bet_id: bet.id,
        sport_key: bet.sport_key,
        status: 'SETTLED',
        market: market,
        selection: bet.selection,
        odds_american: bet.odds,
        stake: bet.stake,
        line: bet.line,
        context: 'regular',
        correlation: 0,
        result: outcome,
        // Include score data for z-score based multiplier calculation
        score: {
          home: game.home_score || 0,
          away: game.away_score || 0
        }
      };

      const bksResult = this.calculator.calculate(betData);

      // Update bet with final status and BKS
      const { error: updateError } = await supabase
        .from('bets')
        .update({
          status: 'SETTLED',
          outcome: outcome,
          bks_final: bksResult.bks,
          settled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', bet.id);

      if (updateError) {
        console.error(`Error settling bet ${bet.id}:`, updateError);
      } else {
        console.log(`✅ Settled bet ${bet.id}: ${outcome} (BKS: ${bksResult.bks})`);

        // Update user's overall BKS after bet settlement
        await this.bksService.updateUserBKS(bet.user_id);

        // Update daily BKS snapshot
        try {
          await dailyBKSService.updateDailySnapshot(bet.user_id);
        } catch (error) {
          console.error('[Settlement] Failed to update daily BKS:', error);
          // Don't throw - daily snapshot is non-critical
        }
      }
    } catch (error) {
      console.error(`Error in settleBet for bet ${bet.id}:`, error);
    }
  }

  private determineBetResult(bet: any, game: any): 'WIN' | 'LOSS' | null {
    // NO PUSH OUTCOMES - Either WIN or LOSS only
    // Exact spread/total hits = WIN, moneyline ties = WIN

    // SAFETY: Check for missing scores - return null to skip settlement
    if (game.home_score === null || game.home_score === undefined ||
        game.away_score === null || game.away_score === undefined) {
      console.warn(`[SettlementJob] ⚠️  Game ${game.id} has missing scores (home: ${game.home_score}, away: ${game.away_score}) - skipping settlement`);
      return null;  // Signal to skip this bet
    }

    const homeScore = game.home_score;
    const awayScore = game.away_score;

    // Basic result logic based on bet_type
    if (bet.bet_type === 'moneyline') {
      if (bet.selection === 'home' && homeScore > awayScore) return 'WIN';
      if (bet.selection === 'away' && awayScore > homeScore) return 'WIN';
      if (bet.selection === 'draw' && homeScore === awayScore) return 'WIN';
      // 2-way moneyline tie = WIN (not PUSH)
      return homeScore === awayScore && bet.market_type !== '3way' ? 'WIN' : 'LOSS';
    }

    if (bet.bet_type === 'spread') {
      const line = bet.line || 0;
      const homeCover = homeScore + line;
      const awayCover = awayScore - line;

      if (bet.selection === 'home') {
        // Exact cover = WIN (not PUSH)
        if (homeCover >= awayScore) return 'WIN';
        return 'LOSS';
      }

      if (bet.selection === 'away') {
        // Exact cover = WIN (not PUSH)
        if (awayCover >= homeScore) return 'WIN';
        return 'LOSS';
      }
    }

    if (bet.bet_type === 'total') {
      const line = bet.line || 0;
      const total = homeScore + awayScore;

      if (bet.selection === 'over') {
        // Exact hit = WIN (not PUSH)
        if (total >= line) return 'WIN';
        return 'LOSS';
      }

      if (bet.selection === 'under') {
        // Exact hit = WIN (not PUSH)
        if (total <= line) return 'WIN';
        return 'LOSS';
      }
    }

    // Default to LOSS if unable to determine
    return 'LOSS';
  }

  /**
   * Settle individual parlay legs when their games complete
   */
  private async settleParlayLegs(parlayBet: any): Promise<number> {
    try {
      // Fetch all legs for this parlay with their associated games
      const { data: legs, error: legsError } = await supabase
        .from('parlay_legs')
        .select(`
          id,
          leg_number,
          game_id,
          bet_type,
          selection,
          line,
          odds,
          status,
          outcome,
          games (
            id,
            completed,
            home_score,
            away_score,
            commence_time
          )
        `)
        .eq('bet_id', parlayBet.id)
        .order('leg_number', { ascending: true });

      if (legsError) {
        console.error(`Error fetching legs for parlay ${parlayBet.id}:`, legsError);
        return 0;
      }

      if (!legs || legs.length === 0) {
        console.log(`⚠️  Parlay ${parlayBet.id} has no legs`);
        return 0;
      }

      let settledLegsCount = 0;

      for (const leg of legs) {
        const game = (leg as any).games;

        if (!game) {
          console.log(`⚠️  Leg ${leg.id} (${leg.leg_number}) has no game data`);
          continue;
        }

        // Skip if leg is already settled
        if (leg.status === 'SETTLED') {
          continue;
        }

        // Check if game is completed
        if (!game.completed) {
          continue;
        }

        // Determine leg outcome using same logic as single bets
        const legBetData = {
          bet_type: leg.bet_type,
          selection: leg.selection,
          line: leg.line,
          market_type: '2way' // Most parlay legs are 2-way
        };

        const outcome = this.determineBetResult(legBetData, game);

        // Skip settlement if scores are missing
        if (outcome === null) {
          console.log(`[SettlementJob] ⏳ Skipping parlay leg ${leg.leg_number} of bet ${parlayBet.id} - waiting for scores`);
          continue;
        }

        // Calculate cover margin for display
        const coverMargin = this.calculateCoverMargin(legBetData, game);

        // Update leg status and outcome
        const { error: updateError } = await supabase
          .from('parlay_legs')
          .update({
            status: 'SETTLED',
            outcome: outcome,
            cover_margin: coverMargin
          })
          .eq('id', leg.id);

        if (updateError) {
          console.error(`Error settling leg ${leg.id}:`, updateError);
        } else {
          console.log(`✅ Settled parlay leg ${leg.leg_number} of bet ${parlayBet.id}: ${outcome}`);
          settledLegsCount++;
        }
      }

      return settledLegsCount;
    } catch (error) {
      console.error(`Error in settleParlayLegs for bet ${parlayBet.id}:`, error);
      return 0;
    }
  }

  /**
   * Map bet_type to BKS market type
   */
  private mapBetTypeToMarket(betType: string): 'h2h' | '3way' | 'spreads' | 'totals' {
    switch (betType) {
      case 'spread':
        return 'spreads';
      case 'total':
        return 'totals';
      case 'moneyline':
      default:
        return 'h2h';
    }
  }

  /**
   * Calculate cover margin for a bet (how close the bet was)
   */
  private calculateCoverMargin(bet: any, game: any): number | null {
    if (!game.home_score || !game.away_score) {
      return null;
    }

    const homeScore = game.home_score;
    const awayScore = game.away_score;

    if (bet.bet_type === 'spread') {
      const line = bet.line || 0;
      if (bet.selection === 'home') {
        return (homeScore + line) - awayScore;
      } else if (bet.selection === 'away') {
        return (awayScore - line) - homeScore;
      }
    }

    if (bet.bet_type === 'total') {
      const line = bet.line || 0;
      const total = homeScore + awayScore;
      if (bet.selection === 'over') {
        return total - line;
      } else if (bet.selection === 'under') {
        return line - total;
      }
    }

    return null;
  }

  /**
   * Settle overall parlay bet when all legs are settled
   */
  private async settleParlayBet(parlayBet: any): Promise<boolean> {
    try {
      // Fetch all legs with full data needed for BKS calculation
      const { data: legs, error: legsError } = await supabase
        .from('parlay_legs')
        .select('id, leg_number, status, outcome, sport_key, bet_type, selection, line, odds')
        .eq('bet_id', parlayBet.id)
        .order('leg_number', { ascending: true });

      if (legsError || !legs || legs.length === 0) {
        console.log(`⚠️  Cannot settle parlay ${parlayBet.id} - no legs found`);
        return false;
      }

      // Check if all legs are settled
      const allSettled = legs.every(leg => leg.status === 'SETTLED');
      if (!allSettled) {
        return false; // Not ready to settle yet
      }

      // Determine overall parlay outcome
      // NO PUSH OUTCOMES - Either WIN or LOSS only
      // For parlays: ALL legs must WIN for parlay to WIN
      // If ANY leg is LOSS → entire parlay is LOSS
      const hasAnyLoss = legs.some(leg => leg.outcome === 'LOSS');

      let parlayOutcome: 'WIN' | 'LOSS';

      if (hasAnyLoss) {
        parlayOutcome = 'LOSS'; // Any leg lost = entire parlay lost
      } else {
        parlayOutcome = 'WIN'; // All legs won = parlay won
      }

      // Build proper leg data for BKS calculation
      // This enables the zero-hit check and difficulty-weighted parlay loss calculation
      const bksLegs = legs.map(leg => ({
        sport_key: leg.sport_key || parlayBet.sport_key,
        market: this.mapBetTypeToMarket(leg.bet_type),
        selection: leg.selection as 'home' | 'away' | 'draw' | 'over' | 'under',
        odds_american: leg.odds,
        line: leg.line,
        outcome: leg.outcome as 'WIN' | 'LOSS' | 'PUSH' | 'VOID' | undefined
      }));

      // Calculate final BKS score for settled parlay
      const parlayBetData: BetData = {
        bet_id: parlayBet.id,
        sport_key: parlayBet.sport_key,
        status: 'SETTLED',
        market: 'h2h', // Placeholder - parlays can have mixed markets
        selection: 'home', // Placeholder
        odds_american: parlayBet.odds,
        stake: parlayBet.stake,
        context: 'regular',
        correlation: 0,
        result: parlayOutcome,
        legs: bksLegs
      };

      const bksResult = this.calculator.calculate(parlayBetData);

      // Update parlay bet with final status and BKS
      const { error: updateError } = await supabase
        .from('bets')
        .update({
          status: 'SETTLED',
          outcome: parlayOutcome,
          bks_final: bksResult.bks,
          settled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', parlayBet.id);

      if (updateError) {
        console.error(`Error settling parlay bet ${parlayBet.id}:`, updateError);
        return false;
      } else {
        console.log(`✅ Settled parlay bet ${parlayBet.id}: ${parlayOutcome} (${legs.length} legs, BKS: ${bksResult.bks})`);

        // Update user's overall BKS after parlay bet settlement
        await this.bksService.updateUserBKS(parlayBet.user_id);

        // Update daily BKS snapshot
        try {
          await dailyBKSService.updateDailySnapshot(parlayBet.user_id);
        } catch (error) {
          console.error('[Settlement] Failed to update daily BKS:', error);
          // Don't throw - daily snapshot is non-critical
        }

        return true;
      }
    } catch (error) {
      console.error(`Error in settleParlayBet for bet ${parlayBet.id}:`, error);
      return false;
    }
  }
}

// Run every 5 minutes
setInterval(() => {
  const job = new SettlementJob();
  job.run();
}, 5 * 60 * 1000);

console.log('✅ SettlementJob initialized (runs every 5 minutes)');
