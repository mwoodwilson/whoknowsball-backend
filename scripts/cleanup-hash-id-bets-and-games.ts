/**
 * Cleanup script to delete bets and parlay legs on hash ID games, then delete the games
 * Run: npx ts-node scripts/cleanup-hash-id-bets-and-games.ts
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
  console.log('🔍 Finding remaining hash ID games with bets...\n');

  // Get all remaining hash ID games
  const { data: games, error } = await supabase
    .from('games')
    .select('id, home_team, away_team');

  if (error) {
    console.error('Error fetching games:', error);
    process.exit(1);
  }

  const hashIdGames = games?.filter(g => HASH_ID_PATTERN.test(g.id)) || [];
  console.log(`Found ${hashIdGames.length} remaining hash ID games\n`);

  if (hashIdGames.length === 0) {
    console.log('No hash ID games remaining. Database is clean!');
    process.exit(0);
  }

  // Get all hash IDs
  const hashIds = hashIdGames.map(g => g.id);

  // Step 1: Delete parlay legs first (child records)
  console.log('1️⃣  Deleting parlay legs on hash ID games...');
  const { data: parlayLegs, error: parlayLegError } = await supabase
    .from('parlay_legs')
    .delete()
    .in('game_id', hashIds)
    .select();

  if (parlayLegError) {
    console.error('   Error deleting parlay legs:', parlayLegError);
  } else {
    console.log(`   Deleted ${parlayLegs?.length || 0} parlay legs`);
  }

  // Step 2: Delete single bets
  console.log('\n2️⃣  Deleting single bets on hash ID games...');
  const { data: deletedBets, error: betError } = await supabase
    .from('bets')
    .delete()
    .in('game_id', hashIds)
    .select();

  if (betError) {
    console.error('   Error deleting bets:', betError);
  } else {
    console.log(`   Deleted ${deletedBets?.length || 0} bets`);
  }

  // Step 3: Now delete the games
  console.log('\n3️⃣  Deleting remaining hash ID games...');

  let deleted = 0;
  const batchSize = 50;

  for (let i = 0; i < hashIds.length; i += batchSize) {
    const batch = hashIds.slice(i, i + batchSize);

    const { error: deleteError } = await supabase
      .from('games')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`   Error deleting games batch: ${deleteError.message}`);
    } else {
      deleted += batch.length;
      console.log(`   Deleted ${deleted}/${hashIdGames.length} games`);
    }
  }

  // Verify cleanup
  const { data: remainingGames } = await supabase
    .from('games')
    .select('id');

  const remainingHashIdGames = remainingGames?.filter(g => HASH_ID_PATTERN.test(g.id)) || [];
  const integerIdGames = remainingGames?.filter(g => /^\d+$/.test(g.id)) || [];

  console.log('\n📊 Final game stats:');
  console.log(`   - Hash ID games (bad): ${remainingHashIdGames.length}`);
  console.log(`   - Integer ID games (good): ${integerIdGames.length}`);
  console.log(`   - Total games: ${remainingGames?.length || 0}`);

  if (remainingHashIdGames.length === 0) {
    console.log('\n✅ All hash ID games deleted successfully!');
  } else {
    console.log(`\n⚠️  ${remainingHashIdGames.length} hash ID games still remain`);
  }

  console.log('\n📝 Next steps:');
  console.log('   1. Restart the backend to trigger GameCreationJob');
  console.log('   2. GameCreationJob will create games with API-Sports integer IDs');
}

main().catch(console.error);
