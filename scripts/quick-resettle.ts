import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function quickResettle() {
  console.log('\n🔄 Triggering BKS Re-calculation via API...\n');

  // Get all bets
  const { data: allBets, error } = await supabase
    .from('bets')
    .select('id, status, game_id')
    .order('placed_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`📊 Found ${allBets?.length || 0} total bet(s)\n`);

  const settled = allBets?.filter(b => b.status === 'SETTLED') || [];
  const pending = allBets?.filter(b => b.status === 'PENDING') || [];
  const live = allBets?.filter(b => b.status === 'LIVE') || [];

  console.log(`  - ${settled.length} SETTLED`);
  console.log(`  - ${pending.length} PENDING`);
  console.log(`  - ${live.length} LIVE\n`);

  console.log('✅ To recalculate BKS, the SettlementJob will handle it automatically.');
  console.log('📍 For manual re-settlement, you can manually trigger the SettlementJob or wait for the next run (every 5 minutes).\n');

  // Show user ID for filtering
  if (allBets && allBets.length > 0) {
    const { data: firstBet } = await supabase
      .from('bets')
      .select('user_id')
      .eq('id', allBets[0].id)
      .single();

    if (firstBet) {
      console.log(`🔑 Your User ID: ${firstBet.user_id}\n`);
    }
  }
}

quickResettle().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
