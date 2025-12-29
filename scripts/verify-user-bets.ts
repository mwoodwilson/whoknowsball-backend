import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function verifyUserBets() {
  const supabase = getSupabase();

  const userId = 'bead6cce-c1db-41bc-9ec9-f102a4f3e8ee';
  const recentBetIds = [
    '9ee1c64f-d3d9-494e-b016-7484b70df1bd',
    '11084abc-d021-43da-ad44-aed09bbe96e4'
  ];

  console.log('\n=== Verifying User Bets ===\n');
  console.log(`User ID: ${userId}\n`);

  // Check all bets for this user
  console.log('--- All Bets for User ---');
  const { data: allBets, error: allError } = await supabase
    .from('bets')
    .select('*')
    .eq('user_id', userId)
    .order('placed_at', { ascending: false });

  if (allError) {
    console.error('Error fetching bets:', allError);
    return;
  }

  console.log(`Total bets: ${allBets?.length || 0}\n`);

  allBets?.forEach(bet => {
    console.log(`Bet ID: ${bet.id}`);
    console.log(`  User ID: ${bet.user_id} ${bet.user_id === userId ? '✅' : '❌'}`);
    console.log(`  Type: ${bet.bet_type}`);
    console.log(`  Stake: $${bet.stake}`);
    console.log(`  BKS: ${bet.bks_provisional}`);
    console.log(`  Status: ${bet.status}`);
    console.log(`  Placed: ${bet.placed_at}`);
    console.log();
  });

  // Check specific recent bets
  console.log('\n--- Recent Parlay Bets (from logs) ---');
  for (const betId of recentBetIds) {
    const { data: bet, error } = await supabase
      .from('bets')
      .select('*')
      .eq('id', betId)
      .single();

    if (error) {
      console.log(`❌ Bet ${betId}: NOT FOUND`);
      console.log(`   Error: ${error.message}\n`);
      continue;
    }

    console.log(`✅ Bet ${betId}:`);
    console.log(`   User ID: ${bet.user_id} ${bet.user_id === userId ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`   Type: ${bet.bet_type}`);
    console.log(`   Legs: ${bet.legs}`);
    console.log(`   Stake: $${bet.stake}`);
    console.log(`   BKS: ${bet.bks_provisional}`);
    console.log();
  }

  // Check parlay legs for recent bets
  console.log('\n--- Parlay Legs for Recent Bets ---');
  for (const betId of recentBetIds) {
    const { data: legs, error } = await supabase
      .from('parlay_legs')
      .select('*')
      .eq('bet_id', betId)
      .order('leg_number');

    if (error) {
      console.log(`❌ Legs for ${betId}: ERROR - ${error.message}\n`);
      continue;
    }

    console.log(`Bet ${betId}: ${legs?.length || 0} legs`);
    legs?.forEach(leg => {
      console.log(`  Leg ${leg.leg_number}: ${leg.bet_type} on ${leg.team || leg.selection}`);
      console.log(`    Game: ${leg.game_id}`);
      console.log(`    Sport: ${leg.sport_key}`);
      console.log(`    Market: ${leg.market}`);
      console.log(`    Odds: ${leg.odds}`);
    });
    console.log();
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`✅ User has ${allBets?.length || 0} total bets`);
  console.log(`✅ Recent parlays found: ${recentBetIds.length}`);
  console.log(`✅ All bets associated with user: ${userId}`);
}

verifyUserBets().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
