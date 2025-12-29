import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkSeahawksGame() {
  const supabase = getSupabase();

  const gameId = 'c2fd8a23091a954fb21ff6d3537db826';

  console.log('\n=== Checking Seahawks @ Commanders Game ===\n');

  const { data: game, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error) {
    console.error('Error fetching game:', error);
    return;
  }

  console.log('Game Data:');
  console.log(JSON.stringify(game, null, 2));

  console.log('\n=== Checking if Scores API has data ===\n');

  // Try to manually fetch scores for this game
  const apiKey = process.env.ODDS_API_KEY;
  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/scores/?apiKey=${apiKey}&daysFrom=2`;

  console.log('Fetching from Odds API...');
  const response = await fetch(url);
  const scoresData: any[] = await response.json();

  console.log(`Found ${scoresData.length} games with scores from NFL`);

  const targetGame = scoresData.find((g: any) => g.id === gameId);

  if (targetGame) {
    console.log('\n✅ Game found in Scores API:');
    console.log(JSON.stringify(targetGame, null, 2));
  } else {
    console.log('\n❌ Game NOT found in Scores API response');
    console.log('Checking all games...');
    scoresData.forEach((g: any) => {
      if (g.home_team.includes('Commanders') || g.away_team.includes('Seahawks')) {
        console.log(`Found similar: ${g.away_team} @ ${g.home_team} (ID: ${g.id})`);
      }
    });
  }
}

checkSeahawksGame().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
