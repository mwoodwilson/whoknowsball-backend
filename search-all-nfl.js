const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function searchNFLGames() {
  console.log('🔍 Searching all NFL games...\n');

  // Search for all NFL games, not just incomplete ones
  const { data: allGames, error } = await supabase
    .from('games')
    .select('*')
    .eq('sport_key', 'americanfootball_nfl')
    .order('commence_time', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${allGames.length} total NFL games\n`);

  // Group by status
  const byStatus = {};
  allGames.forEach(g => {
    if (!byStatus[g.status]) byStatus[g.status] = [];
    byStatus[g.status].push(g);
  });

  console.log('Games by status:');
  Object.keys(byStatus).forEach(status => {
    console.log(`  ${status}: ${byStatus[status].length} games`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('INCOMPLETE GAMES (not completed):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const incomplete = allGames.filter(g => g.status !== 'completed');
  incomplete.forEach(g => {
    console.log(`${g.away_team} @ ${g.home_team}`);
    console.log(`  ID: ${g.id.substring(0, 20)}...`);
    console.log(`  Status: ${g.status}, Completed: ${g.completed}`);
    console.log(`  Score: ${g.away_score}-${g.home_score}`);
    console.log(`  Commence: ${g.commence_time}`);
    console.log('');
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SEARCHING FOR SPECIFIC MATCHUPS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Search for the specific games
  const searchTerms = [
    { teams: ['Seattle', 'Seahawks', 'Washington', 'Commanders'], desc: 'Seattle @ Washington' },
    { teams: ['Atlanta', 'Falcons', 'New England', 'Patriots'], desc: 'Atlanta @ New England' },
    { teams: ['Arizona', 'Cardinals', 'Dallas', 'Cowboys'], desc: 'Arizona @ Dallas' }
  ];

  for (const search of searchTerms) {
    console.log(`\nSearching for: ${search.desc}`);
    const matches = allGames.filter(g => {
      const homeMatch = search.teams.some(t => g.home_team.toLowerCase().includes(t.toLowerCase()));
      const awayMatch = search.teams.some(t => g.away_team.toLowerCase().includes(t.toLowerCase()));
      return homeMatch && awayMatch;
    });

    if (matches.length > 0) {
      console.log(`  ✅ Found ${matches.length} match(es):`);
      matches.forEach(m => {
        console.log(`    ${m.away_team} @ ${m.home_team} (${m.status}, ${m.commence_time})`);
      });
    } else {
      console.log(`  ❌ No matches found`);
    }
  }
}

searchNFLGames().then(() => process.exit(0));
