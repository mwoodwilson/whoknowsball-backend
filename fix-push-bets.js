const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixPushBets() {
  console.log('🔧 Fixing PUSH bets (converting to WIN/LOSS)...\n');

  const pushBetIds = [
    '11084abc-d021-43da-ad44-aed09bbe96e4',
    '9ee1c64f-d3d9-494e-b016-7484b70df1bd'
  ];

  for (const betId of pushBetIds) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Processing bet: ${betId}`);

    // Get the bet details
    const { data: bet, error: fetchError } = await supabase
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
      .eq('id', betId)
      .single();

    if (fetchError || !bet) {
      console.error(`❌ Bet not found:`, fetchError);
      continue;
    }

    console.log(`\nBet Details:`);
    console.log(`  Type: ${bet.bet_type}`);
    console.log(`  Selection: ${bet.selection}${bet.line ? ` (${bet.line})` : ''}`);
    console.log(`  Current outcome: ${bet.outcome}`);
    console.log(`  Current status: ${bet.status}`);

    if (bet.games) {
      console.log(`\nGame Details:`);
      console.log(`  ${bet.games.away_team} @ ${bet.games.home_team}`);
      console.log(`  Final score: ${bet.games.away_score} - ${bet.games.home_score}`);
      console.log(`  Game status: ${bet.games.status}, Completed: ${bet.games.completed}`);
    }

    // Reset bet to LIVE status so SettlementJob re-processes it
    console.log(`\n🔄 Resetting bet to LIVE status for re-settlement...`);

    const { error: updateError } = await supabase
      .from('bets')
      .update({
        status: 'LIVE',
        outcome: null,
        settled_at: null,
        bks_final: null
      })
      .eq('id', betId);

    if (updateError) {
      console.error(`❌ Update failed:`, updateError);
      continue;
    }

    console.log(`✅ Bet reset to LIVE - will be re-settled by SettlementJob`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n🎯 Summary:`);
  console.log(`   - Reset ${pushBetIds.length} PUSH bets to LIVE status`);
  console.log(`   - SettlementJob will re-settle them within 5 minutes`);
  console.log(`   - New settlement logic: NO PUSH outcomes (only WIN/LOSS)`);
}

fixPushBets().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
