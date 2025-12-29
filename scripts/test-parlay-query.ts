import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function testParlayQuery() {
  const supabase = getSupabase();

  console.log('\n=== Testing Parlay Query ===\n');

  const { data: parlayBets, error: parlayError } = await supabase
    .from('bets')
    .select(`
      id,
      user_id,
      sport_key,
      bet_type,
      odds,
      stake,
      status,
      legs
    `)
    .eq('bet_type', 'parlay')
    .in('status', ['PENDING', 'LIVE'])
    .order('placed_at', { ascending: true });

  if (parlayError) {
    console.error('❌ Error fetching parlay bets:', parlayError);
    return;
  }

  console.log(`Found ${parlayBets?.length || 0} parlay bet(s)`);

  if (parlayBets && parlayBets.length > 0) {
    parlayBets.forEach((bet) => {
      console.log(`\nParlay Bet:`);
      console.log(`  ID: ${bet.id}`);
      console.log(`  Status: ${bet.status}`);
      console.log(`  Legs: ${bet.legs}`);
      console.log(`  Sport: ${bet.sport_key}`);
    });
  }

  console.log('\n');
}

testParlayQuery().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
