import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function resetParlayToLive() {
  const supabase = getSupabase();

  const betId = '24104e15-b374-450f-aec1-0f9f5d5c51a4';

  console.log('\n=== Resetting Parlay Bet to LIVE for Testing ===\n');

  // Reset the bet to LIVE
  const { error: betError } = await supabase
    .from('bets')
    .update({
      status: 'LIVE',
      outcome: null,
      bks_final: null,
      settled_at: null
    })
    .eq('id', betId);

  if (betError) {
    console.error('Error resetting bet:', betError);
    return;
  }

  console.log('✅ Bet reset to LIVE status');

  // Reset all parlay legs to PENDING
  const { error: legsError } = await supabase
    .from('parlay_legs')
    .update({
      status: 'PENDING',
      outcome: null,
      cover_margin: null
    })
    .eq('bet_id', betId);

  if (legsError) {
    console.error('Error resetting legs:', legsError);
    return;
  }

  console.log('✅ Parlay legs reset to PENDING\n');
  console.log('Now you can run the SettlementJob again to test proper parlay settlement.\n');
}

resetParlayToLive().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
