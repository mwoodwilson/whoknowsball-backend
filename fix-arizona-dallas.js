const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixArizonaDallas() {
  console.log('🔧 Fixing Arizona Cardinals @ Dallas Cowboys game...\n');

  const gameId = 'f3dfb574e0a542375a480534525ee6cf';

  // First, verify the game exists
  const { data: game, error: fetchError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (fetchError || !game) {
    console.error('❌ Game not found:', fetchError);
    return;
  }

  console.log('✅ Found game:');
  console.log(`   ${game.away_team} @ ${game.home_team}`);
  console.log(`   Current score: ${game.away_score || '-'} - ${game.home_score || '-'}`);
  console.log(`   Status: ${game.status}, Completed: ${game.completed}`);

  // Set final score: Arizona 27, Dallas 17
  // Arizona is away, Dallas is home
  console.log('\n🔧 Setting final score: Arizona Cardinals 27, Dallas Cowboys 17');

  const { error: updateError } = await supabase
    .from('games')
    .update({
      away_score: 27,  // Arizona Cardinals
      home_score: 17,  // Dallas Cowboys
      status: 'completed',
      completed: true
    })
    .eq('id', gameId);

  if (updateError) {
    console.error('❌ Update failed:', updateError);
    return;
  }

  console.log('\n✅ Game updated successfully!');
  console.log('   Final score: Arizona Cardinals 27 - Dallas Cowboys 17');
  console.log('   Status: completed');
  console.log('   Completed: true');

  console.log('\n📊 Bet outcomes:');
  console.log('   Leg 1: Dallas Cowboys moneyline (-130) → LOSS (Dallas scored 17, lost to Arizona 27)');
  console.log('   Leg 2: Under 48.5 (-115) → WIN (Total: 44 points < 48.5)');
  console.log('   Parlay result: LOSS (one leg failed → entire parlay fails)');

  console.log('\n🎯 SettlementJob will settle the parlay within 5 minutes.');
}

fixArizonaDallas().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
