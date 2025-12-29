require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixLegacyGame() {
  const gameId = '45d54dc6c11d254fd1b64ba6967ef453';

  console.log('=== Fixing Legacy Game ===\n');
  console.log('Game ID:', gameId);
  console.log('Game: Los Angeles Kings @ Washington Capitals');
  console.log('Date: Nov 17, 2025');
  console.log('Final Score: Kings 1, Capitals 2 (Capitals WIN)\n');

  // First, get current game state
  const { data: game, error: getError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (getError) {
    console.error('Error fetching game:', getError);
    return;
  }

  console.log('Current game state:');
  console.log('  status:', game.status);
  console.log('  home_score:', game.home_score);
  console.log('  away_score:', game.away_score);
  console.log('');

  // Update the game with correct final score
  // Home team = Washington Capitals (won 2-1)
  // Away team = Los Angeles Kings (lost 1-2)
  // IMPORTANT: Must set BOTH status AND completed boolean!
  const { data: updated, error: updateError } = await supabase
    .from('games')
    .update({
      status: 'completed',
      completed: true,  // THIS IS CRITICAL - SettlementJob checks this boolean!
      home_score: 2,    // Capitals
      away_score: 1     // Kings
    })
    .eq('id', gameId)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating game:', updateError);
    return;
  }

  console.log('Game updated successfully!');
  console.log('New game state:');
  console.log('  status:', updated.status);
  console.log('  home_score:', updated.home_score);
  console.log('  away_score:', updated.away_score);
  console.log('');
  console.log('The SettlementJob will now process this bet on its next run (every 5 minutes).');
}

fixLegacyGame().catch(console.error);
