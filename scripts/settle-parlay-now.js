require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function settleParlay() {
  const parlayBetId = 'b72113e2-c778-491a-bf38-43968070c773';
  const gameId = '45d54dc6c11d254fd1b64ba6967ef453';

  console.log('=== Manual Parlay Settlement ===\n');

  // Get game data
  const { data: game } = await supabase
    .from('games')
    .select('id, home_score, away_score, completed, home_team, away_team')
    .eq('id', gameId)
    .single();

  console.log('Game:', game.away_team, '@', game.home_team);
  console.log('Score:', game.away_score, '-', game.home_score);
  console.log('Completed:', game.completed);
  console.log('');

  if (!game.completed) {
    console.log('❌ Game not completed yet - cannot settle');
    return;
  }

  // Get parlay legs
  const { data: legs, error: legsError } = await supabase
    .from('parlay_legs')
    .select('*')
    .eq('bet_id', parlayBetId)
    .order('leg_number', { ascending: true });

  if (legsError) {
    console.error('Error fetching legs:', legsError);
    return;
  }

  console.log(`Found ${legs.length} parlay legs:\n`);

  const homeScore = game.home_score;
  const awayScore = game.away_score;
  let allLegsWin = true;

  for (const leg of legs) {
    console.log(`Leg ${leg.leg_number}: ${leg.bet_type} - ${leg.selection}`);
    console.log(`  Line: ${leg.line}, Odds: ${leg.odds}`);

    let outcome = 'LOSS';
    let coverMargin = null;

    if (leg.bet_type === 'spread') {
      const line = leg.line || 0;
      if (leg.selection === 'home') {
        coverMargin = (homeScore + line) - awayScore;
        outcome = coverMargin >= 0 ? 'WIN' : 'LOSS';
      } else if (leg.selection === 'away') {
        coverMargin = (awayScore + line) - homeScore;
        outcome = coverMargin >= 0 ? 'WIN' : 'LOSS';
      }
    } else if (leg.bet_type === 'total') {
      const line = leg.line || 0;
      const total = homeScore + awayScore;
      if (leg.selection === 'over') {
        coverMargin = total - line;
        outcome = total > line ? 'WIN' : 'LOSS';
      } else if (leg.selection === 'under') {
        coverMargin = line - total;
        outcome = total < line ? 'WIN' : 'LOSS';
      }
    } else if (leg.bet_type === 'moneyline') {
      if (leg.selection === 'home' && homeScore > awayScore) outcome = 'WIN';
      else if (leg.selection === 'away' && awayScore > homeScore) outcome = 'WIN';
    }

    console.log(`  Result: ${outcome} (margin: ${coverMargin})`);

    // Update leg
    const { error: updateError } = await supabase
      .from('parlay_legs')
      .update({
        status: 'SETTLED',
        outcome: outcome,
        cover_margin: coverMargin
      })
      .eq('id', leg.id);

    if (updateError) {
      console.error(`  Error updating leg: ${updateError.message}`);
    } else {
      console.log(`  ✅ Leg ${leg.leg_number} settled as ${outcome}`);
    }

    if (outcome === 'LOSS') {
      allLegsWin = false;
    }
    console.log('');
  }

  // Settle the parlay bet
  const parlayOutcome = allLegsWin ? 'WIN' : 'LOSS';
  console.log(`=== Parlay Outcome: ${parlayOutcome} ===`);
  console.log(`(${allLegsWin ? 'All legs won' : 'At least one leg lost'})\n`);

  // Calculate a basic BKS for the parlay (simplified)
  const bksFinal = parlayOutcome === 'WIN' ? 75 : 25; // Simplified

  const { error: parlayUpdateError } = await supabase
    .from('bets')
    .update({
      status: 'SETTLED',
      outcome: parlayOutcome,
      bks_final: bksFinal,
      settled_at: new Date().toISOString()
    })
    .eq('id', parlayBetId);

  if (parlayUpdateError) {
    console.error('Error settling parlay:', parlayUpdateError);
  } else {
    console.log(`✅ Parlay bet settled as ${parlayOutcome} (BKS: ${bksFinal})`);
  }

  // Verify final state
  const { data: finalBet } = await supabase
    .from('bets')
    .select('id, status, outcome, bks_final')
    .eq('id', parlayBetId)
    .single();

  console.log('\n=== Final Bet State ===');
  console.log('Status:', finalBet.status);
  console.log('Outcome:', finalBet.outcome);
  console.log('BKS:', finalBet.bks_final);
}

settleParlay().catch(console.error);
