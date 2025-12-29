import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';
import { BKSCalculator } from '../src/services/bks/BKSCalculator';
import { BetData } from '../src/services/bks/types';

const calculator = new BKSCalculator();

async function resettleAllBets() {
  const supabase = getSupabase();

  console.log('\n🔄 Re-Settling All Bets with BKS v3.2.0\n');

  // 1. Get all settled bets
  const { data: settledBets, error: settledError } = await supabase
    .from('bets')
    .select(`
      id,
      user_id,
      sport_key,
      bet_type,
      selection,
      odds,
      stake,
      line,
      status,
      outcome,
      game_id,
      games (
        id,
        home_team,
        away_team,
        home_score,
        away_score
      )
    `)
    .eq('status', 'SETTLED')
    .order('placed_at', { ascending: false });

  if (settledError) {
    console.error('❌ Error fetching settled bets:', settledError);
    return;
  }

  console.log(`📊 Found ${settledBets?.length || 0} settled bet(s)\n`);

  let recalculated = 0;

  for (const bet of settledBets || []) {
    try {
      const game = (bet as any).games;

      if (!game) {
        console.log(`⚠️  Skipping bet ${bet.id} - no game data`);
        continue;
      }

      // Map bet_type to market
      let market: 'h2h' | '3way' | 'spreads' | 'totals' = 'h2h';
      if (bet.bet_type === 'spread') market = 'spreads';
      else if (bet.bet_type === 'total') market = 'totals';

      // Build BetData
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
        result: bet.outcome,
        score: {
          home: game.home_score || 0,
          away: game.away_score || 0
        }
      };

      // Recalculate BKS
      const bksResult = calculator.calculate(betData);

      // Update bet
      const { error: updateError } = await supabase
        .from('bets')
        .update({
          bks_final: bksResult.bks,
        })
        .eq('id', bet.id);

      if (updateError) {
        console.error(`❌ Error updating bet ${bet.id}:`, updateError);
      } else {
        console.log(`✅ Bet ${bet.id}: ${bet.outcome} - BKS recalculated to ${bksResult.bks}`);
        recalculated++;
      }
    } catch (error) {
      console.error(`❌ Error processing bet ${bet.id}:`, error);
    }
  }

  console.log(`\n✅ Re-settled ${recalculated} bet(s)\n`);

  // 2. Get all PENDING/LIVE bets and recalculate provisional BKS
  const { data: activeBets, error: activeError } = await supabase
    .from('bets')
    .select(`
      id,
      user_id,
      sport_key,
      bet_type,
      selection,
      odds,
      stake,
      line,
      status,
      game_id,
      games (
        id,
        home_team,
        away_team,
        commence_time
      )
    `)
    .in('status', ['PENDING', 'LIVE'])
    .order('placed_at', { ascending: false });

  if (activeError) {
    console.error('❌ Error fetching active bets:', activeError);
    return;
  }

  console.log(`📊 Found ${activeBets?.length || 0} active bet(s)\n`);

  let recalculatedActive = 0;
  let transitionedToLive = 0;

  for (const bet of activeBets || []) {
    try {
      const game = (bet as any).games;

      if (!game) {
        console.log(`⚠️  Skipping bet ${bet.id} - no game data`);
        continue;
      }

      // Check if game has started (should transition PENDING → LIVE)
      const now = new Date();
      const commenceTime = new Date(game.commence_time);
      const hasStarted = commenceTime <= now;

      let newStatus = bet.status;
      if (bet.status === 'PENDING' && hasStarted) {
        newStatus = 'LIVE';
        transitionedToLive++;
        console.log(`🔴 Transitioning bet ${bet.id} from PENDING → LIVE`);
      }

      // Map bet_type to market
      let market: 'h2h' | '3way' | 'spreads' | 'totals' = 'h2h';
      if (bet.bet_type === 'spread') market = 'spreads';
      else if (bet.bet_type === 'total') market = 'totals';

      // Build BetData
      const betData: BetData = {
        bet_id: bet.id,
        sport_key: bet.sport_key,
        status: newStatus,
        market: market,
        selection: bet.selection,
        odds_american: bet.odds,
        stake: bet.stake,
        line: bet.line,
        context: 'regular',
        correlation: 0,
      };

      // Recalculate provisional BKS
      const bksResult = calculator.calculate(betData);

      // Update bet
      const updateData: any = {
        bks_provisional: bksResult.bks,
      };

      if (newStatus !== bet.status) {
        updateData.status = newStatus;
      }

      const { error: updateError } = await supabase
        .from('bets')
        .update(updateData)
        .eq('id', bet.id);

      if (updateError) {
        console.error(`❌ Error updating bet ${bet.id}:`, updateError);
      } else {
        console.log(`✅ Bet ${bet.id}: ${newStatus} - BKS recalculated to ${bksResult.bks}`);
        recalculatedActive++;
      }
    } catch (error) {
      console.error(`❌ Error processing bet ${bet.id}:`, error);
    }
  }

  console.log(`\n✅ Recalculated ${recalculatedActive} active bet(s)`);
  console.log(`🔴 Transitioned ${transitionedToLive} bet(s) to LIVE\n`);
}

resettleAllBets().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
