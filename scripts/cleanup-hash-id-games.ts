/**
 * Cleanup script to delete games with legacy Odds API hash IDs
 * These games cannot be settled because ScoresJob only works with API-Sports integer IDs
 *
 * Run: npx ts-node scripts/cleanup-hash-id-games.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Pattern for legacy Odds API hash IDs (32 hex characters)
const HASH_ID_PATTERN = /^[a-f0-9]{32}$/i;

async function main() {
  console.log('🔍 Finding games with legacy hash IDs...\n');

  // Get all games
  const { data: games, error } = await supabase
    .from('games')
    .select('id, home_team, away_team, sport_key');

  if (error) {
    console.error('❌ Error fetching games:', error);
    process.exit(1);
  }

  const hashIdGames = games?.filter(g => HASH_ID_PATTERN.test(g.id)) || [];
  const integerIdGames = games?.filter(g => /^\d+$/.test(g.id)) || [];

  console.log(`📊 Current game stats:`);
  console.log(`   - Hash ID games (bad): ${hashIdGames.length}`);
  console.log(`   - Integer ID games (good): ${integerIdGames.length}`);
  console.log(`   - Total games: ${games?.length || 0}\n`);

  if (hashIdGames.length === 0) {
    console.log('✅ No hash ID games found. Database is clean!');
    process.exit(0);
  }

  console.log('🗑️  Deleting hash ID games...\n');

  // Check for bets on these games first
  let gamesWithBets = 0;
  let gamesWithoutBets = 0;

  for (const game of hashIdGames) {
    // Check for bets on this game
    const { count: betCount } = await supabase
      .from('bets')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', game.id);

    // Check for parlay legs on this game
    const { count: parlayCount } = await supabase
      .from('parlay_legs')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', game.id);

    const totalBets = (betCount || 0) + (parlayCount || 0);

    if (totalBets > 0) {
      console.log(`   ⚠️  ${game.away_team} @ ${game.home_team} (${game.id.substring(0, 8)}...) has ${totalBets} bets - will delete game anyway`);
      gamesWithBets++;
    } else {
      gamesWithoutBets++;
    }
  }

  console.log(`\n   Games with bets: ${gamesWithBets}`);
  console.log(`   Games without bets: ${gamesWithoutBets}\n`);

  // Delete all hash ID games (bets will need manual cleanup or will remain orphaned)
  const hashIds = hashIdGames.map(g => g.id);

  // Delete in batches
  const batchSize = 50;
  let deleted = 0;

  for (let i = 0; i < hashIds.length; i += batchSize) {
    const batch = hashIds.slice(i, i + batchSize);

    const { error: deleteError } = await supabase
      .from('games')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`❌ Error deleting batch ${i}-${i + batch.length}:`, deleteError);
    } else {
      deleted += batch.length;
      console.log(`   ✅ Deleted ${deleted}/${hashIdGames.length} games`);
    }
  }

  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Deleted: ${deleted} hash ID games`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Restart the backend to trigger GameCreationJob`);
  console.log(`   2. GameCreationJob will create games with API-Sports integer IDs`);
  console.log(`   3. OddsMatchingJob will then match odds to these games`);
}

main().catch(console.error);
