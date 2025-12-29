const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixBrooklynGameManual() {
  console.log('Searching for Minnesota @ Brooklyn game...\n');

  // Find the game - Minnesota @ Brooklyn
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .eq('sport_key', 'basketball_nba')
    .ilike('home_team', '%Brooklyn%')
    .ilike('away_team', '%Minnesota%');

  if (error) {
    console.error('Error finding game:', error);
    return;
  }

  if (!games || games.length === 0) {
    console.log('Game not found - trying reverse search...');

    // Try alternative search
    const { data: altGames } = await supabase
      .from('games')
      .select('*')
      .eq('sport_key', 'basketball_nba')
      .or('home_team.ilike.%Brooklyn%,home_team.ilike.%Nets%,away_team.ilike.%Minnesota%,away_team.ilike.%Timberwolves%');

    console.log('Found games:', altGames?.map(g => ({
      id: g.id.substring(0, 12),
      matchup: `${g.away_team} @ ${g.home_team}`,
      score: `${g.away_score || '-'} - ${g.home_score || '-'}`,
      status: g.status,
      completed: g.completed
    })));
    return;
  }

  const game = games[0];

  console.log('Found game:');
  console.log('  ID:', game.id);
  console.log('  Matchup:', game.away_team, '@', game.home_team);
  console.log('  Current status:', game.status);
  console.log('  Completed:', game.completed);
  console.log('  Current score:', game.away_score, '-', game.home_score);
  console.log('  Commence time:', game.commence_time);

  // MANUAL FIX: Set the actual final score
  // Minnesota Timberwolves 109, Brooklyn Nets 125
  console.log('\n🔧 Manually setting final score: Minnesota 109, Brooklyn 125');

  const { error: updateError } = await supabase
    .from('games')
    .update({
      home_score: 125,  // Brooklyn Nets
      away_score: 109,  // Minnesota Timberwolves
      status: 'completed',
      completed: true
    })
    .eq('id', game.id);

  if (updateError) {
    console.error('Error updating game:', updateError);
    return;
  }

  console.log('\n✅ Game updated successfully');
  console.log('   Final score: Minnesota 109 - Brooklyn 125');
  console.log('   Status: completed');
  console.log('   Completed: true');

  console.log('\n🎯 SettlementJob should now settle bets on next run (every 5 minutes)');
}

fixBrooklynGameManual().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
