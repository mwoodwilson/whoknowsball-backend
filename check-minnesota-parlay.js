const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkMinnesotaParlay() {
  console.log('🔍 Checking Minnesota parlay that WON...\n');

  const parlayBetId = '9a47228f-8ec5-4cf8-8f1a-741adf578e35';

  // Get the parlay legs
  const { data: legs, error } = await supabase
    .from('parlay_legs')
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
    .eq('bet_id', parlayBetId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${legs.length} parlay legs\n`);

  legs.forEach((leg, i) => {
    console.log(`━━━━ LEG ${i + 1} ━━━━`);
    console.log(`Leg ID: ${leg.id}`);
    console.log(`Game ID: ${leg.game_id}`);
    console.log(`Bet Type: ${leg.bet_type}`);
    console.log(`Selection: ${leg.selection}${leg.line ? ` (${leg.line})` : ''}`);
    console.log(`Odds: ${leg.odds}`);
    console.log(`Outcome: ${leg.outcome}`);

    if (leg.games) {
      console.log(`\nGame Details:`);
      console.log(`  ${leg.games.away_team} @ ${leg.games.home_team}`);
      console.log(`  Score: ${leg.games.away_score} - ${leg.games.home_score}`);
      console.log(`  Winner: ${leg.games.away_score > leg.games.home_score ? leg.games.away_team : leg.games.home_team}`);
      console.log(`  Status: ${leg.games.status}, Completed: ${leg.games.completed}`);

      // Check if this leg should be WIN or LOSS
      let expectedOutcome;
      if (leg.bet_type === 'moneyline') {
        const isAwayWin = leg.games.away_score > leg.games.home_score;
        const isHomeWin = leg.games.home_score > leg.games.away_score;
        if (leg.selection === 'away') {
          expectedOutcome = isAwayWin ? 'WIN' : 'LOSS';
        } else if (leg.selection === 'home') {
          expectedOutcome = isHomeWin ? 'WIN' : 'LOSS';
        }
      }
      console.log(`  Expected outcome: ${expectedOutcome}`);
      console.log(`  Actual outcome: ${leg.outcome}`);
      console.log(`  Match: ${expectedOutcome === leg.outcome ? '✅' : '❌'}`);
    }
    console.log('');
  });

  // Check overall parlay
  const { data: parlay, error: parlayError } = await supabase
    .from('bets')
    .select('*')
    .eq('id', parlayBetId)
    .single();

  if (parlay) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PARLAY BET SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Parlay outcome: ${parlay.outcome}`);
    console.log(`All legs must WIN for parlay to WIN`);
    const allLegsWin = legs.every(leg => leg.outcome === 'WIN');
    console.log(`All legs WIN? ${allLegsWin ? '✅ YES' : '❌ NO'}`);
    console.log(`Expected parlay outcome: ${allLegsWin ? 'WIN' : 'LOSS'}`);
    console.log(`Actual parlay outcome: ${parlay.outcome}`);
    console.log(`Correct? ${(allLegsWin && parlay.outcome === 'WIN') || (!allLegsWin && parlay.outcome === 'LOSS') ? '✅' : '❌'}`);
  }
}

checkMinnesotaParlay().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
