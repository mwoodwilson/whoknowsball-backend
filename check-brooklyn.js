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
    .or('home_team.ilike.%Brooklyn%,away_team.ilike.%Brooklyn%,home_team.ilike.%Patriots%,away_team.ilike.%Patriots%,home_team.ilike.%Cardinals%,away_team.ilike.%Cardinals%,home_team.ilike.%Nets%,away_team.ilike.%Nets%')
    .order('commence_time', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${games.length} games:`);
  console.table(games.map(g => ({
    id: g.id.substring(0, 12),
    sport: g.sport_key,
    matchup: `${g.away_team} @ ${g.home_team}`,
    score: `${g.away_score || '-'} - ${g.home_score || '-'}`,
    status: g.status,
    completed: g.completed,
    commence: new Date(g.commence_time).toLocaleString()
  })));
}

checkGames().then(() => process.exit(0));
