const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixMinnesotaMoneyline() {
  console.log('🔧 Fixing Minnesota @ Brooklyn moneyline bet...\n');

  const betId = 'a4965cd4-9e78-4346-b262-5c92b7f46853';
  const gameId = '8af5977057054cf39d99326e1e0b9d01';

  // First, verify the game result
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('❌ Game not found:', gameError);
    return;
  }

  console.log('✅ Game found:');
  console.log(`   ${game.away_team} @ ${game.home_team}`);
  console.log(`   Final score: ${game.away_score} - ${game.home_score}`);
  console.log(`   Status: ${game.status}, Completed: ${game.completed}`);
  console.log(`   Winner: ${game.away_score > game.home_score ? game.away_team : game.home_team}`);

  // Get the bet details
  const { data: bet, error: betError } = await supabase
    .from('bets')
    .select('*')
    .eq('id', betId)
    .single();

  if (betError || !bet) {
    console.error('❌ Bet not found:', betError);
    return;
  }

  console.log('\n📊 Current bet details:');
  console.log(`   Bet ID: ${bet.id}`);
  console.log(`   Type: ${bet.bet_type}`);
  console.log(`   Selection: ${bet.selection} (Minnesota was ${bet.selection === 'away' ? 'AWAY' : 'HOME'})`);
  console.log(`   Odds: ${bet.odds}`);
  console.log(`   Stake: ${bet.stake}`);
  console.log(`   Current outcome: ${bet.outcome} ❌ INCORRECT`);
  console.log(`   Current BKS: ${bet.bks_final}`);

  // Determine correct outcome
  const isAwayWin = game.away_score > game.home_score;
  const isHomeWin = game.home_score > game.away_score;

  let correctOutcome;
  if (bet.selection === 'away') {
    correctOutcome = isAwayWin ? 'WIN' : 'LOSS';
  } else if (bet.selection === 'home') {
    correctOutcome = isHomeWin ? 'WIN' : 'LOSS';
  }

  console.log(`\n✅ Correct outcome should be: ${correctOutcome}`);
  console.log(`   Reason: ${game.away_team} scored ${game.away_score}, ${game.home_team} scored ${game.home_score}`);
  console.log(`   Bet selection: ${bet.selection} (${bet.selection === 'away' ? game.away_team : game.home_team})`);

  // Reset bet to LIVE status so SettlementJob re-processes it
  console.log(`\n🔄 Resetting bet to LIVE status for re-settlement...`);

  const { error: updateError } = await supabase
    .from('bets')
    .update({
      status: 'LIVE',
      outcome: null,
      settled_at: null,
      bks_final: null
    })
    .eq('id', betId);

  if (updateError) {
    console.error(`❌ Update failed:`, updateError);
    return;
  }

  console.log(`✅ Bet reset to LIVE - will be re-settled by SettlementJob`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎯 Summary:`);
  console.log(`   - Reset 1 incorrectly settled bet to LIVE status`);
  console.log(`   - SettlementJob will re-settle within 5 minutes`);
  console.log(`   - Expected outcome: ${correctOutcome}`);
}

fixMinnesotaMoneyline().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
