import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkGameIDs() {
  const supabase = getSupabase();

  console.log('Fetching all games from database...');
  const { data: games, error } = await supabase
    .from('games')
    .select('id, home_team, away_team, sport_key')
    .limit(20);

  if (error) {
    console.error('Error fetching games:', error);
    return;
  }

  console.log(`\nFound ${games?.length || 0} games in database:`);
  console.log('Sample game IDs:');
  games?.slice(0, 10).forEach(game => {
    console.log(`  ${game.id} (${game.home_team} vs ${game.away_team})`);
  });

  console.log('\nLooking for frontend game_id: 6dd3b8a705ed0db85d59fa19b9062cc8');
  const match = games?.find(g => g.id === '6dd3b8a705ed0db85d59fa19b9062cc8');
  if (match) {
    console.log('✅ FOUND in database:', match);
  } else {
    console.log('❌ NOT FOUND in database');
    console.log('\nFull list of game IDs:');
    games?.forEach(g => console.log(`  - ${g.id}`));
  }
}

checkGameIDs().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
