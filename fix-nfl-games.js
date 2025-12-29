const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixNFLGames() {
  console.log('🔍 Fixing old NFL games...\n');

  const gamesToFix = [
    {
      teams: ['Seattle', 'Washington', 'Seahawks', 'Commanders'],
      scores: { seahawks: 38, commanders: 14 },
      description: 'Seattle Seahawks @ Washington Commanders'
    },
    {
      teams: ['Atlanta', 'New England', 'Falcons', 'Patriots'],
      scores: { falcons: 23, patriots: 24 },
      description: 'Atlanta Falcons @ New England Patriots'
    },
    {
      teams: ['Arizona', 'Dallas', 'Cardinals', 'Cowboys'],
      scores: { cardinals: 27, cowboys: 17 },
      description: 'Arizona Cardinals @ Dallas Cowboys'
    }
  ];

  for (const gameInfo of gamesToFix) {
    console.log(`\n🔍 Searching for: ${gameInfo.description}`);

    // Build OR filter for team names
    const teamFilters = gameInfo.teams.map(team =>
      `home_team.ilike.%${team}%,away_team.ilike.%${team}%`
    ).join(',');

    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('sport_key', 'americanfootball_nfl')
      .or(teamFilters)
      .order('commence_time', { ascending: false })
      .limit(10);

    if (!games || games.length === 0) {
      console.log(`❌ No games found for ${gameInfo.description}`);
      continue;
    }

    // Find the specific matchup
    const game = games.find(g => {
      const homeMatch = gameInfo.teams.some(t => g.home_team.toLowerCase().includes(t.toLowerCase()));
      const awayMatch = gameInfo.teams.some(t => g.away_team.toLowerCase().includes(t.toLowerCase()));
      return homeMatch && awayMatch;
    });

    if (!game) {
      console.log(`❌ Specific matchup not found for ${gameInfo.description}`);
      console.log('Available games:', games.slice(0, 3).map(g => `${g.away_team} @ ${g.home_team}`));
      continue;
    }

    console.log(`✅ Found: ${game.away_team} @ ${game.home_team}`);
    console.log(`   ID: ${game.id}`);
    console.log(`   Current: ${game.away_score}-${game.home_score}, status: ${game.status}`);

    // Determine correct scores based on team positions
    let homeScore, awayScore;

    if (gameInfo.description.includes('Seahawks @ Commanders')) {
      // Seattle @ Washington: 38-14
      homeScore = game.home_team.toLowerCase().includes('washington') || game.home_team.toLowerCase().includes('commanders') ? 14 : 38;
      awayScore = game.away_team.toLowerCase().includes('seattle') || game.away_team.toLowerCase().includes('seahawks') ? 38 : 14;
    } else if (gameInfo.description.includes('Falcons @ Patriots')) {
      // Atlanta @ New England: 23-24
      homeScore = game.home_team.toLowerCase().includes('england') || game.home_team.toLowerCase().includes('patriots') ? 24 : 23;
      awayScore = game.away_team.toLowerCase().includes('atlanta') || game.away_team.toLowerCase().includes('falcons') ? 23 : 24;
    } else if (gameInfo.description.includes('Cardinals @ Cowboys')) {
      // Arizona @ Dallas: 27-17
      homeScore = game.home_team.toLowerCase().includes('dallas') || game.home_team.toLowerCase().includes('cowboys') ? 17 : 27;
      awayScore = game.away_team.toLowerCase().includes('arizona') || game.away_team.toLowerCase().includes('cardinals') ? 27 : 17;
    }

    console.log(`📝 Updating to: ${awayScore}-${homeScore} (${game.away_team} @ ${game.home_team})`);

    const { error } = await supabase
      .from('games')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: 'completed',
        completed: true
      })
      .eq('id', game.id);

    if (error) {
      console.error(`❌ Update failed for ${gameInfo.description}:`, error);
    } else {
      console.log(`✅ ${gameInfo.description} updated successfully`);
    }
  }

  console.log('\n🎯 All games processed. SettlementJob should settle bets within 5 minutes.');
}

fixNFLGames().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
