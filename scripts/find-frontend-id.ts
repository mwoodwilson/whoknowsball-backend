import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function findFrontendID() {
  const supabase = getSupabase();
  const frontendID = '6dd3b8a705ed0db85d59fa19b9062cc8';

  console.log(`\nSearching for frontend game_id: ${frontendID}\n`);

  // Check games table
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', frontendID)
    .single();

  if (game) {
    console.log('✅ FOUND in games table:');
    console.log(`   ${game.home_team} vs ${game.away_team}`);
    console.log(`   Sport: ${game.sport_key}`);
    console.log(`   Commence: ${game.commence_time}`);
    console.log(`   Status: ${game.status}`);
    console.log(`   Last updated: ${game.last_odds_update}`);
  } else {
    console.log('❌ NOT FOUND in games table');
  }

  // Check cached_odds table
  const { data: cached } = await supabase
    .from('cached_odds')
    .select('*')
    .like('cache_key', `%${frontendID}%`);

  if (cached && cached.length > 0) {
    console.log('\n✅ FOUND in cached_odds table:');
    cached.forEach(c => {
      console.log(`   Cache key: ${c.cache_key}`);
      console.log(`   Sport: ${c.sport_key}`);
      console.log(`   Cached at: ${c.cached_at}`);
      console.log(`   Expires at: ${c.expires_at}`);
    });
  } else {
    console.log('\n❌ NOT FOUND in cached_odds table');
  }

  // Search in odds_data JSON (might contain game IDs)
  const { data: allCached } = await supabase
    .from('cached_odds')
    .select('*');

  console.log('\n--- Checking cached_odds.odds_data for the ID ---');
  let found = false;
  allCached?.forEach(cache => {
    const oddsData = cache.odds_data;
    if (Array.isArray(oddsData)) {
      const match = oddsData.find((game: any) => game.id === frontendID);
      if (match) {
        console.log(`✅ FOUND in ${cache.cache_key}:`);
        console.log(`   ${match.home_team} vs ${match.away_team}`);
        found = true;
      }
    }
  });

  if (!found) {
    console.log('❌ NOT FOUND in any cached odds_data');
  }

  // Check all game IDs to see if any match pattern
  console.log('\n--- Similar IDs in database (same prefix) ---');
  const prefix = frontendID.substring(0, 4);
  const { data: similar } = await supabase
    .from('games')
    .select('id, home_team, away_team, sport_key')
    .like('id', `${prefix}%`);

  if (similar && similar.length > 0) {
    similar.forEach(g => {
      console.log(`  ${g.id} (${g.sport_key})`);
      console.log(`    ${g.home_team} vs ${g.away_team}`);
    });
  } else {
    console.log('  No similar IDs found');
  }
}

findFrontendID().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
