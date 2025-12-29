// Test Supabase database connection
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔍 Testing Supabase connection...\n');

  try {
    // Test 1: Check sport_configs table
    console.log('1️⃣ Testing sport_configs table...');
    const { data: sports, error: sportsError } = await supabase
      .from('sport_configs')
      .select('*');

    if (sportsError) {
      console.error('❌ Error fetching sport configs:', sportsError);
    } else {
      console.log(`✅ Found ${sports?.length || 0} sports configured`);
      sports?.forEach(sport => {
        console.log(`   - ${sport.sport_title} (${sport.sport_key})`);
      });
    }

    console.log('\n2️⃣ Testing games table...');
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .limit(5);

    if (gamesError) {
      console.error('❌ Error fetching games:', gamesError);
    } else {
      console.log(`✅ Games table accessible (${games?.length || 0} results)`);
    }

    console.log('\n3️⃣ Testing bets table...');
    const { data: bets, error: betsError } = await supabase
      .from('bets')
      .select('*')
      .limit(5);

    if (betsError) {
      console.error('❌ Error fetching bets:', betsError);
    } else {
      console.log(`✅ Bets table accessible (${bets?.length || 0} results)`);
    }

    console.log('\n✅ Database connection test complete!');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testConnection();
