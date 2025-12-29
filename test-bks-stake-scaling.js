/**
 * BKS Stake Scaling Test Script
 * Tests 5 different bet scenarios with varying stakes to verify logarithmic scaling
 * Expected: ~8 BKS point increase from $10 to $10,000 stake
 */

const API_URL = 'http://localhost:3000/api/v1/bets/calculate';

// 5 different bet scenarios with varying odds
const testBets = [
  {
    name: 'Bet 1: Favorite Moneyline',
    description: 'Lakers ML vs Suns (Heavy favorite)',
    odds: -200,
    opposing_odds: 170,
    bet_type: 'moneyline',
    selection: 'home',
  },
  {
    name: 'Bet 2: Underdog Moneyline',
    description: 'Heat ML vs Celtics (Moderate underdog)',
    odds: 150,
    opposing_odds: -180,
    bet_type: 'moneyline',
    selection: 'away',
  },
  {
    name: 'Bet 3: Standard Spread',
    description: 'Warriors -5.5 vs Kings (Standard line)',
    odds: -110,
    opposing_odds: -110,
    bet_type: 'spread',
    selection: 'home',
  },
  {
    name: 'Bet 4: Heavy Underdog',
    description: 'Pistons ML vs Bucks (Heavy underdog)',
    odds: 300,
    opposing_odds: -400,
    bet_type: 'moneyline',
    selection: 'away',
  },
  {
    name: 'Bet 5: Heavy Favorite Spread',
    description: 'Nuggets -10.5 vs Wizards (Heavy favorite)',
    odds: -400,
    opposing_odds: 320,
    bet_type: 'spread',
    selection: 'home',
  },
];

// Stakes to test (from $10 to $10,000)
const stakes = [10, 50, 100, 500, 1000, 5000, 10000];

async function calculateBKS(betScenario, stake) {
  const payload = {
    bet_id: `test-${Date.now()}`,
    game_id: 'test-game-123',
    commence_time: new Date().toISOString(),
    sport_key: 'basketball_nba',
    status: 'PENDING',
    market: betScenario.bet_type === 'moneyline' ? 'h2h' : 'spreads',
    selection: betScenario.selection,
    odds_american: betScenario.odds,
    opposing_odds_american: betScenario.opposing_odds,
    stake: stake,
    stakePercentile: 0.5, // Middle of the road for S component
    context: 'regular',
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    return result.bks;
  } catch (error) {
    console.error(`Error calculating BKS:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         BKS STAKE SCALING VERIFICATION TEST                    ║');
  console.log('║  Expected: ~8 point BKS increase from $10 to $10,000 stake     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  for (const bet of testBets) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${bet.name}`);
    console.log(`${bet.description}`);
    console.log(`Odds: ${bet.odds > 0 ? '+' : ''}${bet.odds} (opposing: ${bet.opposing_odds > 0 ? '+' : ''}${bet.opposing_odds})`);
    console.log(`${'='.repeat(70)}\n`);

    const results = [];

    for (const stake of stakes) {
      const bks = await calculateBKS(bet, stake);
      if (bks !== null) {
        results.push({ stake, bks });
        console.log(`  💰 Stake: $${stake.toLocaleString().padStart(7)} → BKS: ${bks.toFixed(2).padStart(6)}`);
      }
    }

    // Calculate increase from min to max stake
    if (results.length > 0) {
      const minBKS = results[0].bks;
      const maxBKS = results[results.length - 1].bks;
      const increase = maxBKS - minBKS;
      const percentIncrease = ((increase / minBKS) * 100).toFixed(1);

      console.log(`\n  📊 Analysis:`);
      console.log(`     Min BKS ($${results[0].stake}):     ${minBKS.toFixed(2)}`);
      console.log(`     Max BKS ($${results[results.length - 1].stake.toLocaleString()}): ${maxBKS.toFixed(2)}`);
      console.log(`     Increase:        ${increase.toFixed(2)} points (+${percentIncrease}%)`);
      console.log(`     Expected:        ~8 points`);

      if (increase >= 7 && increase <= 9) {
        console.log(`     ✅ PASS - Stake scaling working correctly`);
      } else {
        console.log(`     ⚠️  WARNING - Scaling differs from expected ~8 points`);
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('TEST COMPLETE');
  console.log(`${'='.repeat(70)}\n`);
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
