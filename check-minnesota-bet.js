const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkMinnesotaBet() {
  console.log('🔍 Checking Minnesota @ Brooklyn bet...\n');

  // Find the Minnesota moneyline bet
  const { data: bets, error } = await supabase
    .from('bets')
    .select(`
      *,
      games (
        id,
        home_team,
        away_team,
        home_score,
        away_score,
        status,
        completed
      )
    `)
    .or('game_id.ilike.%minnesota%,game_id.ilike.%timberwolves%')
    .order('placed_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Also search by team names in the games table
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('*')
    .or('home_team.ilike.%minnesota%,away_team.ilike.%minnesota%,home_team.ilike.%timberwolves%,away_team.ilike.%timberwolves%')
    .order('commence_time', { ascending: false });

  if (gamesError) {
    console.error('Games error:', gamesError);
  } else {
    console.log(`Found ${games.length} Minnesota games:\n`);
    games.forEach(g => {
      console.log(`Game ID: ${g.id}`);
      console.log(`  ${g.away_team} @ ${g.home_team}`);
      console.log(`  Score: ${g.away_score} - ${g.home_score}`);
      console.log(`  Status: ${g.status}, Completed: ${g.completed}`);
      console.log(`  Commence: ${g.commence_time}`);
      console.log('');
    });
  }

  // Find bets on these games
  if (games && games.length > 0) {
    for (const game of games) {
      const { data: gameBets, error: betsError } = await supabase
        .from('bets')
        .select('*')
        .eq('game_id', game.id);

      if (gameBets && gameBets.length > 0) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`BETS FOR: ${game.away_team} @ ${game.home_team}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        gameBets.forEach(bet => {
          console.log(`Bet ID: ${bet.id}`);
          console.log(`  Type: ${bet.bet_type}`);
          console.log(`  Selection: ${bet.selection}${bet.line ? ` (${bet.line})` : ''}`);
          console.log(`  Odds: ${bet.odds}`);
          console.log(`  Stake: ${bet.stake}`);
          console.log(`  Status: ${bet.status}`);
          console.log(`  Outcome: ${bet.outcome}`);
          console.log(`  BKS Final: ${bet.bks_final}`);
          console.log(`  Settled: ${bet.settled_at}`);
          console.log('');
        });
      }
    }
  }
}

checkMinnesotaBet().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
