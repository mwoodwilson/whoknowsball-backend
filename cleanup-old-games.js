const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function cleanupOldGames() {
  console.log('🧹 Cleaning up stale games...\\n');

  // Find all incomplete games that started more than 4 hours ago
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: staleGames, error: fetchError } = await supabase
    .from('games')
    .select('id, sport_key, home_team, away_team, commence_time, status, completed')
    .eq('completed', false)
    .lt('commence_time', fourHoursAgo)
    .order('commence_time', { ascending: false });

  if (fetchError) {
    console.error('❌ Error fetching stale games:', fetchError);
    return;
  }

  if (!staleGames || staleGames.length === 0) {
    console.log('✅ No stale games found - database is clean!');
    return;
  }

  console.log(`📊 Found ${staleGames.length} stale games to clean up:\\n`);

  // Group by sport
  const bySport = {};
  staleGames.forEach(game => {
    if (!bySport[game.sport_key]) {
      bySport[game.sport_key] = [];
    }
    bySport[game.sport_key].push(game);
  });

  // Show summary
  Object.keys(bySport).forEach(sport => {
    console.log(`   ${sport}: ${bySport[sport].length} games`);
  });

  console.log('\\n🔧 Marking games as completed...\\n');

  // Update all stale games to completed
  const { data: updated, error: updateError } = await supabase
    .from('games')
    .update({
      status: 'completed',
      completed: true
    })
    .eq('completed', false)
    .lt('commence_time', fourHoursAgo)
    .select('id, sport_key');

  if (updateError) {
    console.error('❌ Error updating games:', updateError);
    return;
  }

  console.log(`✅ Successfully marked ${updated.length} games as completed!\\n`);

  // Show breakdown by sport
  const updatedBySport = {};
  updated.forEach(game => {
    updatedBySport[game.sport_key] = (updatedBySport[game.sport_key] || 0) + 1;
  });

  console.log('📈 Cleanup Summary:');
  Object.keys(updatedBySport).forEach(sport => {
    console.log(`   ${sport}: ${updatedBySport[sport]} games marked completed`);
  });

  console.log('\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Cleanup complete! Stale games have been marked as completed.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

cleanupOldGames().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
