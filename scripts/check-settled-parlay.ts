import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkSettledParlay() {
  const supabase = getSupabase();

  const userId = 'bead6cce-c1db-41bc-9ec9-f102a4f3e8ee';
  const betId = '24104e15-b374-450f-aec1-0f9f5d5c51a4';

  console.log('\n=== Checking Settled Parlay Bet ===\n');

  // Get the bet
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
  console.log(`  ID: ${bet.id}`);
  console.log(`  Type: ${bet.bet_type}`);
  console.log(`  Status: ${bet.status}`);
  console.log(`  Outcome: ${bet.outcome}`);
  console.log(`  BKS Final: ${bet.bks_final}`);
  console.log(`  Settled At: ${bet.settled_at}`);

  // Get parlay legs
  const { data: legs, error: legsError } = await supabase
    .from('parlay_legs')
    .select(`
      *,
      games (
        id,
        home_team,
        away_team,
        home_score,
        away_score,
        completed
      )
    `)
    .eq('bet_id', betId)
    .order('leg_number', { ascending: true });

  if (legsError) {
    console.error('Error fetching legs:', legsError);
    return;
  }

  if (legs && legs.length > 0) {
    console.log(`\nParlay Legs (${legs.length} total):`);

    legs.forEach((leg: any) => {
      const game = leg.games;
      console.log(`\n  Leg ${leg.leg_number}:`);
      console.log(`    Bet Type: ${leg.bet_type}`);
      console.log(`    Selection: ${leg.selection}`);
      console.log(`    Team: ${leg.team || 'N/A'}`);
      console.log(`    Line: ${leg.line || 'N/A'}`);
      console.log(`    Odds: ${leg.odds}`);
      console.log(`    Status: ${leg.status}`);
      console.log(`    Outcome: ${leg.outcome || 'N/A'}`);
      console.log(`    Cover Margin: ${leg.cover_margin || 'N/A'}`);
      if (game) {
        console.log(`    Game: ${game.away_team} @ ${game.home_team}`);
        console.log(`    Score: ${game.away_score} - ${game.home_score}`);
        console.log(`    Completed: ${game.completed ? '✅' : '❌'}`);
      }
    });
  } else {
    console.log('\n⚠️  No parlay legs found');
  }

  console.log('\n');
}

checkSettledParlay().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
