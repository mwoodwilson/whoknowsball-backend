const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkUserBets() {
  console.log('🔍 Checking user bets...\n');

  // Get all bets with their game info
  const { data: bets, error } = await supabase
    .from('bets')
    .select(`
      id,
      user_id,
      game_id,
      sport_key,
      bet_type,
      selection,
      line,
      odds,
      stake,
      status,
      outcome,
      placed_at,
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
    .order('placed_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${bets.length} recent bets\n`);

  // Group by status
  const liveBets = bets.filter(b => b.status === 'LIVE');
  const settledBets = bets.filter(b => b.status === 'SETTLED');

  console.log(`📊 LIVE BETS: ${liveBets.length}`);
  liveBets.forEach(bet => {
    console.log(`\nBet ID: ${bet.id}`);
    console.log(`  Game ID: ${bet.game_id}`);
    console.log(`  Sport: ${bet.sport_key}`);
    console.log(`  Bet Type: ${bet.bet_type}`);
    console.log(`  Selection: ${bet.selection}${bet.line ? ` (${bet.line})` : ''}`);
    console.log(`  Odds: ${bet.odds}`);
    console.log(`  Stake: ${bet.stake}`);
    console.log(`  Placed: ${new Date(bet.placed_at).toLocaleString()}`);

    if (bet.games) {
      console.log(`  Game: ${bet.games.away_team} @ ${bet.games.home_team}`);
      console.log(`  Score: ${bet.games.away_score || '-'} - ${bet.games.home_score || '-'}`);
      console.log(`  Status: ${bet.games.status}, Completed: ${bet.games.completed}`);
    } else {
      console.log(`  ⚠️  Game not found in database (orphaned bet)`);
    }
  });

  console.log(`\n📊 SETTLED BETS: ${settledBets.length}`);
  settledBets.slice(0, 5).forEach(bet => {
    console.log(`\nBet ID: ${bet.id} - ${bet.outcome}`);
    console.log(`  Game: ${bet.games?.away_team || 'Unknown'} @ ${bet.games?.home_team || 'Unknown'}`);
  });
}

checkUserBets().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
