import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRPC() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().split('T')[0];

  console.log('Testing increment_daily_quota RPC function...');
  console.log(`Date: ${todayKey}`);

  const { data, error } = await supabase.rpc('increment_daily_quota', {
    p_date: todayKey,
    p_api_name: 'the-odds-api'
  });

  if (error) {
    console.error('❌ RPC Error:', error);
  } else {
    console.log('✅ RPC Success:', data);
  }

  // Check the table
  console.log('\nChecking table...');
  const { data: record, error: selectError } = await supabase
    .from('daily_quota_tracking')
    .select('*')
    .eq('date', todayKey)
    .eq('api_name', 'the-odds-api')
    .single();

  if (selectError) {
    console.error('Error reading table:', selectError);
  } else {
    console.log('Current record:', record);
  }
}

testRPC();
