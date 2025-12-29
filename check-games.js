const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkGames() {
  const { data: games, error } = await supabase
    .from('games')
    .select('id, sport_key, home_team, away_team, home_score, away_score, status, completed, commence_time')
    .or('home_team.ilike.%Minnesota%,away_team.ilike.%Minnesota%,home_team.ilike.%Dallas%,away_team.ilike.%Dallas%,home_team.ilike.%Patriots%')
    .gt('commence_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('commence_time', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Games found:');
  console.table(games.map(g => ({
    id: g.id,
    sport: g.sport_key,
    matchup: `${g.away_team} @ ${g.home_team}`,
    score: `${g.away_score || '-'} - ${g.home_score || '-'}`,
    status: g.status,
    completed: g.completed,
    commence: new Date(g.commence_time).toLocaleString()
  })));
}

checkGames().then(() => process.exit(0));
