import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function manualSettleGame() {
  const supabase = getSupabase();

  const gameId = '6dd3b8a705ed0db85d59fa19b9062cc8'; // Atlanta @ NE

  console.log('\n=== Manually Updating Game to Completed ===\n');

  // The Atlanta Falcons @ New England Patriots game from November 2, 2024
  // Final Score: Patriots 15, Falcons 25
  // Source: https://www.espn.com/nfl/game/_/gameId/401671676

  const updates = {
    home_score: 15, // Patriots (home)
    away_score: 25, // Falcons (away)
    completed: true,
    status: 'completed'
  };

  const { error } = await supabase
    .from('games')
    .update(updates)
    .eq('id', gameId);

  if (error) {
    console.error('❌ Error updating game:', error);
    return;
  }

  console.log('✅ Game updated successfully:');
  console.log(`   Game ID: ${gameId}`);
  console.log(`   Matchup: Atlanta Falcons @ New England Patriots`);
  console.log(`   Final Score: Patriots ${updates.home_score} - Falcons ${updates.away_score}`);
  console.log(`   Status: ${updates.status}`);
  console.log(`   Completed: ${updates.completed}`);
  console.log('\n⏳ The SettlementJob will automatically settle related bets within 5 minutes.\n');
}

manualSettleGame().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
