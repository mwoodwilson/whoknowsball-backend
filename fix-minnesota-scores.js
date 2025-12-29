const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixMinnesotaScores() {
  console.log('🔧 Fixing Minnesota @ Brooklyn game scores...\n');

  const gameId = '8af5977057054cf39d99326e1e0b9d01';

  // Get current game data
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    console.error('❌ Game not found:', gameError);
    return;
  }

  console.log('❌ CURRENT (INCORRECT) SCORES:');
  console.log(`   ${game.away_team}: ${game.away_score}`);
  console.log(`   ${game.home_team}: ${game.home_score}`);
  console.log(`   Winner: ${game.away_score > game.home_score ? game.away_team : game.home_team}`);

  console.log('\n🔍 EVIDENCE THAT SCORES ARE SWAPPED:');
  console.log('   - Parlay has Minnesota -16.5 spread that WON');
  console.log('   - For Minnesota -16.5 to WIN, Minnesota must win by >16.5 points');
  console.log('   - Current scores show Brooklyn won by 16 points');
  console.log('   - This is IMPOSSIBLE - scores must be swapped!');

  console.log('\n✅ CORRECT SCORES (SWAPPED):');
  console.log(`   ${game.away_team}: 125 (was ${game.away_score})`);
  console.log(`   ${game.home_team}: 109 (was ${game.home_score})`);
  console.log(`   Winner: Minnesota Timberwolves`);
  console.log(`   Margin: 16 points (covers -16.5 spread)`);
  console.log(`   Total: 234 points (over 233.5)`);

  // Swap the scores
  console.log('\n🔄 Swapping away_score and home_score...');

  const { error: updateError } = await supabase
    .from('games')
    .update({
      away_score: game.home_score,  // 125
      home_score: game.away_score    // 109
    })
    .eq('id', gameId);

  if (updateError) {
    console.error('❌ Update failed:', updateError);
    return;
  }

  console.log('✅ Game scores corrected!');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 Summary:');
  console.log('   - Swapped away_score and home_score');
  console.log('   - Minnesota now correctly shows as winner (125-109)');
  console.log('   - Moneyline bet will be re-settled by SettlementJob');
  console.log('   - Expected moneyline outcome: WIN');
}

fixMinnesotaScores().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
