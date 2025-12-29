import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkBetSettlement() {
  const supabase = getSupabase();

  const userId = 'bead6cce-c1db-41bc-9ec9-f102a4f3e8ee';

  console.log('\n=== Checking Bet Settlement Status ===\n');

  // Get all active bets for this user
  const { data: bets, error } = await supabase
    .from('bets')
    .select(`
      id,
      status,
      bet_type,
      stake,
      odds,
      placed_at,
      games (
        id,
        home_team,
        away_team,
        commence_time,
        completed,
        home_score,
        away_score,
        status
      )
    `)
    .eq('user_id', userId)
    .in('status', ['PENDING', 'LIVE'])
    .order('placed_at', { ascending: false });

  if (error) {
    console.error('Error fetching bets:', error);
    return;
  }

  if (!bets || bets.length === 0) {
    console.log('✅ No active bets found (all settled)');
    return;
  }

  console.log(`Found ${bets.length} active bet(s):\n`);

  const now = new Date();

  bets.forEach((bet, index) => {
    const game = (bet as any).games;

    console.log(`--- Bet #${index + 1} ---`);
    console.log(`Bet ID: ${bet.id}`);
    console.log(`Status: ${bet.status}`);
    console.log(`Type: ${bet.bet_type}`);
    console.log(`Stake: $${bet.stake}`);
    console.log(`Odds: ${bet.odds}`);
    console.log(`Placed: ${bet.placed_at}`);

    if (game) {
      console.log(`\nGame Info:`);
      console.log(`  Game ID: ${game.id}`);
      console.log(`  Matchup: ${game.away_team} @ ${game.home_team}`);
      console.log(`  Commence Time: ${game.commence_time}`);

      const commenceTime = new Date(game.commence_time);
      const hasStarted = commenceTime <= now;
      const timeUntilStart = commenceTime.getTime() - now.getTime();
      const minutesUntilStart = Math.floor(timeUntilStart / 60000);

      console.log(`  Has Started: ${hasStarted ? '✅ YES' : '❌ NO'} (${minutesUntilStart > 0 ? `starts in ${minutesUntilStart} mins` : `started ${Math.abs(minutesUntilStart)} mins ago`})`);
      console.log(`  Completed: ${game.completed ? '✅ YES' : '❌ NO'}`);
      console.log(`  Score: ${game.home_team} ${game.home_score || '?'} - ${game.away_team} ${game.away_score || '?'}`);
      console.log(`  Game Status: ${game.status || 'N/A'}`);

      // Identify issues
      console.log(`\n  Issues:`);
      if (bet.status === 'PENDING' && hasStarted) {
        console.log(`  ⚠️  Bet is PENDING but game has started (should be LIVE)`);
      }
      if (bet.status === 'LIVE' && !game.completed) {
        console.log(`  ⚠️  Bet is LIVE but game not marked as completed`);
      }
      if (bet.status === 'LIVE' && game.completed && (!game.home_score || !game.away_score)) {
        console.log(`  ⚠️  Game marked completed but missing scores`);
      }
      if (bet.status === 'LIVE' && game.completed && game.home_score && game.away_score) {
        console.log(`  ✅ Ready to settle! Game is complete with scores`);
      }
    } else {
      console.log(`⚠️  No game data found for this bet`);
    }

    console.log();
  });

  // Check if there are any parlay bets
  console.log('\n--- Checking for Parlay Bets ---\n');

  const { data: parlays, error: parlayError } = await supabase
    .from('bets')
    .select(`
      id,
      status,
      bet_type,
      legs,
      parlay_legs (
        leg_number,
        game_id,
        sport_key,
        bet_type,
        team,
        selection,
        odds,
        games (
          id,
          home_team,
          away_team,
          commence_time,
          completed,
          home_score,
          away_score
        )
      )
    `)
    .eq('user_id', userId)
    .eq('bet_type', 'parlay')
    .in('status', ['PENDING', 'LIVE']);

  if (parlayError) {
    console.error('Error fetching parlays:', parlayError);
    return;
  }

  if (parlays && parlays.length > 0) {
    console.log(`Found ${parlays.length} active parlay bet(s):\n`);

    parlays.forEach((parlay, index) => {
      console.log(`--- Parlay Bet #${index + 1} ---`);
      console.log(`Bet ID: ${parlay.id}`);
      console.log(`Status: ${parlay.status}`);
      console.log(`Legs: ${parlay.legs}`);

      const legs = (parlay as any).parlay_legs || [];
      console.log(`\nLeg Details:`);

      legs.forEach((leg: any) => {
        const game = leg.games;
        console.log(`  Leg ${leg.leg_number}: ${leg.team || leg.selection}`);
        if (game) {
          console.log(`    Game: ${game.away_team} @ ${game.home_team}`);
          console.log(`    Completed: ${game.completed ? '✅' : '❌'}`);
          console.log(`    Score: ${game.home_score || '?'} - ${game.away_score || '?'}`);
        } else {
          console.log(`    ⚠️  No game data`);
        }
      });

      console.log();
    });
  } else {
    console.log('No active parlay bets found\n');
  }
}

checkBetSettlement().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
