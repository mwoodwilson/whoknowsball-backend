const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixBrooklynGame() {
  // Find the game - Minnesota @ Brooklyn from Nov 3
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .eq('sport_key', 'basketball_nba')
    .or('home_team.ilike.%Brooklyn%,home_team.ilike.%Nets%')
    .or('away_team.ilike.%Minnesota%,away_team.ilike.%Timberwolves%');

  if (error) {
    console.error('Error finding game:', error);
    return;
  }

  if (!games || games.length === 0) {
    console.log('Game not found');
    return;
  }

  // Find the specific game with both teams
  const game = games.find(g =>
    (g.home_team.toLowerCase().includes('brooklyn') || g.home_team.toLowerCase().includes('nets')) &&
    (g.away_team.toLowerCase().includes('minnesota') || g.away_team.toLowerCase().includes('timberwolves'))
  );

  if (!game) {
    console.log('Minnesota @ Brooklyn game not found');
    console.log('Available games:', games.map(g => `${g.away_team} @ ${g.home_team}`));
    return;
  }

  console.log('Found game:', game.id, game.away_team, '@', game.home_team);
  console.log('Current status:', game.status, 'Completed:', game.completed);
  console.log('Current score:', game.away_score, '-', game.home_score);

  // Fetch current data from API-Sports
  console.log('\nFetching from API-Sports...');
  const response = await axios.get('https://v1.basketball.api-sports.io/games', {
    params: { id: game.id },
    headers: {
      'x-rapidapi-key': process.env.API_SPORTS_NBA_KEY,
      'x-rapidapi-host': 'v1.basketball.api-sports.io'
    }
  });

  const apiGame = response.data.response?.[0];
  if (!apiGame) {
    console.log('Game not found in API-Sports');
    return;
  }

  // Extract score and status
  const gameData = apiGame.game || apiGame;
  const status = gameData.status?.short || 'NS';
  const homeScore = apiGame.scores?.home?.total || null;
  const awayScore = apiGame.scores?.away?.total || null;
  const completed = ['FT', 'AOT'].includes(status);

  console.log('\nAPI-Sports data:');
  console.log('  Status:', status);
  console.log('  Score:', awayScore, '-', homeScore);
  console.log('  Completed:', completed);

  // Update database
  console.log('\nUpdating database...');
  const { error: updateError } = await supabase
    .from('games')
    .update({
      home_score: homeScore,
      away_score: awayScore,
      status: completed ? 'completed' : status.toLowerCase(),
      completed: completed
    })
    .eq('id', game.id);

  if (updateError) {
    console.error('Error updating game:', updateError);
    return;
  }

  console.log('✅ Game updated successfully');
  console.log('   Final score:', awayScore, '-', homeScore);
  console.log('   Status:', completed ? 'completed' : status.toLowerCase());
}

fixBrooklynGame().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
