const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function verifyMinnesotaFix() {
  console.log('🔍 Verifying Minnesota @ Brooklyn bet fix...\n');

  const betId = 'a4965cd4-9e78-4346-b262-5c92b7f46853';
  const gameId = '8af5977057054cf39d99326e1e0b9d01';

  // Check the game
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (game) {
    console.log('✅ GAME STATUS:');
    console.log(`   ${game.away_team} @ ${game.home_team}`);
    console.log(`   Score: ${game.away_score} - ${game.home_score}`);
    console.log(`   Winner: ${game.away_score > game.home_score ? game.away_team + ' ✅' : game.home_team}`);
    console.log(`   Minnesota won by ${game.away_score - game.home_score} points`);
  }

  // Check the bet
  const { data: bet, error: betError } = await supabase
    .from('bets')
    .select('*')
    .eq('id', betId)
    .single();

  if (bet) {
    console.log('\n✅ BET STATUS:');
    console.log(`   Bet ID: ${bet.id}`);
    console.log(`   Type: ${bet.bet_type}`);
    console.log(`   Selection: ${bet.selection} (Minnesota)`);
    console.log(`   Odds: ${bet.odds}`);
    console.log(`   Stake: $${bet.stake}`);
    console.log(`   Status: ${bet.status}`);
    console.log(`   Outcome: ${bet.outcome} ${bet.outcome === 'WIN' ? '✅ CORRECT!' : '❌ INCORRECT!'}`);
    console.log(`   BKS Final: ${bet.bks_final}`);
    console.log(`   Settled: ${bet.settled_at}`);

    if (bet.outcome === 'WIN') {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 SUCCESS! Bet settled correctly as WIN');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   - Minnesota won 125-109`);
      console.log(`   - Moneyline bet on Minnesota = WIN`);
      console.log(`   - BKS score: ${bet.bks_final}`);
    } else {
      console.log('\n⚠️ Bet outcome is still incorrect');
    }
  }
}

verifyMinnesotaFix().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
