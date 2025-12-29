require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkParlayDetails() {
  const betId = 'b72113e2-c778-491a-bf38-43968070c773';

  console.log('=== Checking Parlay Bet Details ===\n');
  console.log('Bet ID:', betId);
  console.log('');

  // Get bet details
  const { data: bet, error: betError } = await supabase
    .from('bets')
    .select('*')
    .eq('id', betId)
    .single();

  if (betError) {
    console.error('Error fetching bet:', betError);
    return;
  }

  console.log('Bet Details:');
  console.log('  status:', bet.status);
  console.log('  bet_type:', bet.bet_type);
  console.log('  game_id:', bet.game_id);
  console.log('  market_type:', bet.market_type);
  console.log('  selection:', bet.selection);
  console.log('  user_id:', bet.user_id);
  console.log('');

  // Get game details (should now be completed)
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', bet.game_id)
    .single();

  if (game) {
    console.log('Game Details:');
    console.log('  status:', game.status);
    console.log('  home_team:', game.home_team);
    console.log('  away_team:', game.away_team);
    console.log('  home_score:', game.home_score);
    console.log('  away_score:', game.away_score);
    console.log('');
  }

  // Check if there's a parlay_bets table
  const { data: parlayBet, error: parlayError } = await supabase
    .from('parlay_bets')
    .select('*')
    .eq('id', betId)
    .single();

  if (parlayBet) {
    console.log('Parlay Bet Record:');
    console.log(JSON.stringify(parlayBet, null, 2));
    console.log('');
  }

  // Try to find parlay legs (various possible table/column names)
  // First try bet_legs
  const { data: betLegs } = await supabase
    .from('bet_legs')
    .select('*')
    .eq('bet_id', betId);

  if (betLegs && betLegs.length > 0) {
    console.log('Bet Legs (from bet_legs table):');
    betLegs.forEach((leg, i) => {
      console.log(`  Leg ${i + 1}:`, JSON.stringify(leg, null, 2));
    });
    console.log('');
  }

  // Try parlay_legs with bet_id
  const { data: parlayLegs1 } = await supabase
    .from('parlay_legs')
    .select('*')
    .eq('bet_id', betId);

  if (parlayLegs1 && parlayLegs1.length > 0) {
    console.log('Parlay Legs (from parlay_legs, bet_id):');
    parlayLegs1.forEach((leg, i) => {
      console.log(`  Leg ${i + 1}:`, JSON.stringify(leg, null, 2));
    });
    console.log('');
  }

  console.log('--- Summary ---');
  console.log('The game is now marked as completed with scores.');
  console.log('SettlementJob should pick this up on next run (every 5 minutes).');
}

checkParlayDetails().catch(console.error);
