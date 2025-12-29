require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function verifyGame() {
  const gameId = '45d54dc6c11d254fd1b64ba6967ef453';

  const { data: game, error } = await supabase
    .from('games')
    .select('id, status, completed, home_score, away_score, home_team, away_team')
    .eq('id', gameId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== Game Status ===');
  console.log('ID:', game.id);
  console.log('Teams:', game.away_team, '@', game.home_team);
  console.log('Status (text):', game.status);
  console.log('Completed (boolean):', game.completed);
  console.log('Score:', game.away_score, '-', game.home_score);
  console.log('');

  if (game.completed === true) {
    console.log('✅ Game is properly marked as completed - SettlementJob should process it!');
  } else {
    console.log('❌ Game NOT marked as completed - SettlementJob will skip it!');
    console.log('   Fixing now...');

    const { error: updateError } = await supabase
      .from('games')
      .update({ completed: true })
      .eq('id', gameId);

    if (updateError) {
      console.error('   Error updating:', updateError);
    } else {
      console.log('   ✅ Fixed! completed is now true');
    }
  }
}

verifyGame().catch(console.error);
