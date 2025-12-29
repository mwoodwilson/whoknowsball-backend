const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkCompletedGames() {
  // Look for games with scores in the past 7 days
  const { data: games, error } = await supabase
    .from('games')
    .select('id, sport_key, home_team, away_team, home_score, away_score, status, completed, commence_time')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
    .gt('commence_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('commence_time', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nFound ${games.length} games with scores:`);
  console.table(games.map(g => ({
    id: g.id.substring(0, 10),
    sport: g.sport_key.replace('basketball_', '').replace('americanfootball_', ''),
    matchup: `${g.away_team} @ ${g.home_team}`,
    score: `${g.away_score}-${g.home_score}`,
    status: g.status,
    completed: g.completed ? '✓' : '✗',
    time: new Date(g.commence_time).toLocaleString()
  })));
}

checkCompletedGames().then(() => process.exit(0));
