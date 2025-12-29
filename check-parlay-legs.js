const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkParlayLegs() {
  console.log('🔍 Checking parlay legs...\n');

  const parlayBetId = 'e4ca26dc-0350-4081-919a-d88cd01033b3';

  // Get the parlay legs
  const { data: legs, error } = await supabase
    .from('parlay_legs')
    .select(`
      *,
      games (
        id,
        sport_key,
        home_team,
        away_team,
        home_score,
        away_score,
        status,
        completed,
        commence_time
      )
    `)
    .eq('bet_id', parlayBetId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${legs.length} parlay legs for bet ${parlayBetId}\n`);

  legs.forEach((leg, i) => {
    console.log(`\n━━━━ LEG ${i + 1} ━━━━`);
    console.log(`Leg ID: ${leg.id}`);
    console.log(`Game ID: ${leg.game_id}`);
    console.log(`Bet Type: ${leg.bet_type}`);
    console.log(`Selection: ${leg.selection}${leg.line ? ` (${leg.line})` : ''}`);
    console.log(`Odds: ${leg.odds}`);
    console.log(`Outcome: ${leg.outcome || 'PENDING'}`);

    if (leg.games) {
      console.log(`\nGame Details:`);
      console.log(`  ${leg.games.away_team} @ ${leg.games.home_team}`);
      console.log(`  Score: ${leg.games.away_score || '-'} - ${leg.games.home_score || '-'}`);
      console.log(`  Status: ${leg.games.status}, Completed: ${leg.games.completed}`);
      console.log(`  Commence: ${new Date(leg.games.commence_time).toLocaleString()}`);
    } else {
      console.log(`\n⚠️  Game not found (orphaned leg)`);
    }
  });

  // Check for games that need scores
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('GAMES THAT NEED FINAL SCORES:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const incompleteGames = legs.filter(leg => leg.games && !leg.games.completed);

  incompleteGames.forEach(leg => {
    console.log(`${leg.games.away_team} @ ${leg.games.home_team}`);
    console.log(`  Game ID: ${leg.game_id}`);
    console.log(`  Current status: ${leg.games.status}`);
    console.log('');
  });
}

checkParlayLegs().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
