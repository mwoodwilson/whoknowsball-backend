import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function updateSeahawksScores() {
  const supabase = getSupabase();

  const gameId = 'c2fd8a23091a954fb21ff6d3537db826';

  console.log('\n=== Updating Seahawks @ Commanders Game with Final Scores ===\n');

  // Update game with final scores from Odds API
  const { error } = await supabase
    .from('games')
    .update({
      completed: true,
      status: 'completed',
      home_score: 14,  // Commanders
      away_score: 38   // Seahawks
    })
    .eq('id', gameId);

  if (error) {
    console.error('Error updating game:', error);
    return;
  }

  console.log('✅ Game updated successfully with final scores:');
  console.log('   Seattle Seahawks 38 @ Washington Commanders 14');
  console.log('   Status: completed');
  console.log('\nNow the SettlementJob should settle the parlay on its next run (every 5 minutes)');
  console.log('Or you can manually trigger settlement by running the recalculate script.\n');
}

updateSeahawksScores().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
