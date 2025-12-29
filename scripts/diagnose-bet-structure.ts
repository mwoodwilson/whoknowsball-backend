import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function diagnoseBetStructure() {
  const supabase = getSupabase();

  console.log('\n=== Diagnosing Bet Structure (NBA vs NFL) ===\n');

  // Fetch all recent bets
  const { data: bets, error } = await supabase
    .from('bets')
    .select(`
      id,
      sport_key,
      bet_type,
      legs,
      status,
      parlay_legs (
        leg_number,
        game_id,
        sport_key,
        bet_type,
        selection,
        team,
        line,
        odds,
        outcome
      )
    `)
    .order('placed_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Found ${bets?.length || 0} bet(s)\n`);

  bets?.forEach((bet: any) => {
    console.log(`\n--- Bet ID: ${bet.id} ---`);
    console.log(`Sport: ${bet.sport_key}`);
    console.log(`Type: ${bet.bet_type}`);
    console.log(`Legs Count: ${bet.legs}`);
    console.log(`Status: ${bet.status}`);
    console.log(`Parlay Legs Count: ${bet.parlay_legs?.length || 0}`);

    if (bet.parlay_legs && bet.parlay_legs.length > 0) {
      console.log('Parlay Legs Details:');
      bet.parlay_legs.forEach((leg: any) => {
        console.log(`  Leg ${leg.leg_number}:`);
        console.log(`    Team: ${leg.team}`);
        console.log(`    Selection: ${leg.selection}`);
        console.log(`    Odds: ${leg.odds}`);
        console.log(`    Outcome: ${leg.outcome || 'null/undefined'}`);
      });
    } else {
      console.log('No parlay legs data');
    }
  });

  console.log('\n=== End Diagnosis ===\n');
}

diagnoseBetStructure().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
