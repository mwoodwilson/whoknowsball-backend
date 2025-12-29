import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkSpecificIDs() {
  const supabase = getSupabase();

  const newIDs = [
    '1abf482ad374aafd4543807af43cb242',
    'd5520c148eed47ba246ad3ecf8cdf503',
    '32340eec3e6f948859da513d81047c24'
  ];

  console.log('Checking for new NBA game IDs that GameSyncJob just synced...\n');

  for (const id of newIDs) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      console.log(`✅ FOUND: ${id}`);
      console.log(`   ${data.home_team} vs ${data.away_team}`);
    } else {
      console.log(`❌ NOT FOUND: ${id}`);
    }
  }

  console.log('\n--- Checking total game count ---');
  const { data: allGames, count } = await supabase
    .from('games')
    .select('*', { count: 'exact' });

  console.log(`Total games in database: ${count}`);
  console.log(`Latest 5 games by last_odds_update:`);

  const sorted = allGames?.sort((a: any, b: any) =>
    new Date(b.last_odds_update || 0).getTime() - new Date(a.last_odds_update || 0).getTime()
  ).slice(0, 5);

  sorted?.forEach((g: any) => {
    const shortId = g.id.substring(0, 8);
    console.log(`  ${shortId}... (${g.sport_key}) - ${g.home_team} vs ${g.away_team}`);
    console.log(`    Last updated: ${g.last_odds_update}`);
  });
}

checkSpecificIDs().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
