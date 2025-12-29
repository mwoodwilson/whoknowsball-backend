import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function diagnoseNBABet() {
  const supabase = getSupabase();

  console.log('\n=== Diagnosing NBA Bet Structure ===\n');

  // Fetch NBA bets
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
        market,
        selection,
        team,
        line,
        odds,
        outcome
      )
    `)
    .eq('sport_key', 'basketball_nba')
    .order('placed_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Found ${bets?.length || 0} NBA bet(s)\n`);

  bets?.forEach((bet: any) => {
    console.log(`\n--- NBA Bet ID: ${bet.id} ---`);
    console.log(`Sport: ${bet.sport_key}`);
    console.log(`Type: ${bet.bet_type}`);
    console.log(`Legs Count (from bets table): ${bet.legs}`);
    console.log(`Status: ${bet.status}`);
    console.log(`Parlay Legs Array Length: ${bet.parlay_legs?.length || 0}`);
    console.log(`\nIs detected as parlay? ${bet.bet_type === 'parlay' && bet.parlay_legs && bet.parlay_legs.length > 0}`);

    if (bet.parlay_legs && bet.parlay_legs.length > 0) {
      console.log('\n✅ Parlay Legs Data:');
      bet.parlay_legs.forEach((leg: any) => {
        console.log(`\n  Leg ${leg.leg_number}:`);
        console.log(`    Team: ${leg.team}`);
        console.log(`    Selection: ${leg.selection}`);
        console.log(`    Odds: ${leg.odds}`);
        console.log(`    Outcome: ${leg.outcome || 'null/undefined'}`);
        console.log(`    Bet Type: ${leg.bet_type}`);
        console.log(`    Market: ${leg.market}`);
      });
    } else {
      console.log('\n❌ No parlay legs data found!');
      console.log(`   This bet will NOT render as a parlay in the frontend.`);
    }
  });

  console.log('\n=== End Diagnosis ===\n');
}

diagnoseNBABet().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
