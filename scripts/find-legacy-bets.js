require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function findLegacyBets() {
  console.log('Finding legacy bets with hash ID games...\n');

  // Find all bets that are LIVE or PENDING
  const { data: bets, error: betsError } = await supabase
    .from('bets')
    .select('id, status, game_id, user_id')
    .in('status', ['LIVE', 'PENDING']);

  if (betsError) {
    console.error('Error fetching bets:', betsError);
    return;
  }

  console.log(`Found ${bets.length} LIVE/PENDING bets total\n`);

  // Check each bet's game_id to see if it's a hash ID (32 hex chars)
  const hashIdPattern = /^[a-f0-9]{32}$/;
  const legacyBets = [];

  for (const bet of bets) {
    if (hashIdPattern.test(bet.game_id)) {
      // Fetch the game details
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('id, home_team, away_team, status, home_score, away_score, commence_time')
        .eq('id', bet.game_id)
        .single();

      if (game) {
        legacyBets.push({
          bet_id: bet.id,
          bet_status: bet.status,
          game_id: bet.game_id,
          home_team: game.home_team,
          away_team: game.away_team,
          game_status: game.status,
          home_score: game.home_score,
          away_score: game.away_score,
          commence_time: game.commence_time
        });
      }
    }
  }

  console.log(`Found ${legacyBets.length} legacy bets with hash ID games:\n`);

  if (legacyBets.length === 0) {
    console.log('No legacy bets found!');
    return;
  }

  // Display results
  legacyBets.forEach((bet, i) => {
    console.log(`${i + 1}. Bet: ${bet.bet_id}`);
    console.log(`   Status: ${bet.bet_status}`);
    console.log(`   Game: ${bet.away_team} @ ${bet.home_team}`);
    console.log(`   Game ID: ${bet.game_id}`);
    console.log(`   Game Status: ${bet.game_status}`);
    console.log(`   Score: ${bet.away_score ?? 'null'} - ${bet.home_score ?? 'null'}`);
    console.log(`   Commence: ${bet.commence_time}`);
    console.log('');
  });

  // Also check parlay legs
  console.log('\n--- Checking Parlay Legs ---\n');

  const { data: parlayLegs, error: parlayError } = await supabase
    .from('parlay_legs')
    .select('id, parlay_bet_id, game_id, status');

  if (parlayError) {
    console.error('Error fetching parlay legs:', parlayError);
    return;
  }

  const legacyParlayLegs = [];
  for (const leg of parlayLegs) {
    if (hashIdPattern.test(leg.game_id)) {
      const { data: game } = await supabase
        .from('games')
        .select('id, home_team, away_team, status, home_score, away_score, commence_time')
        .eq('id', leg.game_id)
        .single();

      if (game) {
        legacyParlayLegs.push({
          leg_id: leg.id,
          parlay_bet_id: leg.parlay_bet_id,
          leg_status: leg.status,
          game_id: leg.game_id,
          home_team: game.home_team,
          away_team: game.away_team,
          game_status: game.status,
          home_score: game.home_score,
          away_score: game.away_score,
          commence_time: game.commence_time
        });
      }
    }
  }

  console.log(`Found ${legacyParlayLegs.length} parlay legs with hash ID games:\n`);

  legacyParlayLegs.forEach((leg, i) => {
    console.log(`${i + 1}. Parlay Bet: ${leg.parlay_bet_id}`);
    console.log(`   Leg ID: ${leg.leg_id}`);
    console.log(`   Leg Status: ${leg.leg_status}`);
    console.log(`   Game: ${leg.away_team} @ ${leg.home_team}`);
    console.log(`   Game ID: ${leg.game_id}`);
    console.log(`   Game Status: ${leg.game_status}`);
    console.log(`   Score: ${leg.away_score ?? 'null'} - ${leg.home_score ?? 'null'}`);
    console.log(`   Commence: ${leg.commence_time}`);
    console.log('');
  });
}

findLegacyBets().catch(console.error);
