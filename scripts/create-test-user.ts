import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

async function createTestUser() {
  // First, list existing users to get actual ID
  const { data: listData } = await supabase.auth.admin.listUsers();

  let actualUserId = TEST_USER_ID;

  if (listData && listData.users.length > 0) {
    actualUserId = listData.users[0].id;
    console.log(`Found existing user with ID: ${actualUserId}`);
  }

  // Check if user already exists in public.users
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', actualUserId)
    .single();

  if (existingUser) {
    console.log('✅ Test user already exists!');
    console.log(`User ID: ${actualUserId}`);
    console.log(`\nUpdate TEST_USER_ID in bks.routes.ts to: '${actualUserId}'`);
    return;
  }

  // Create public.users entry
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: actualUserId,
      username: 'testuser',
      overall_bks: 0,
      total_bets: 0,
      total_won: 0,
      total_lost: 0,
      total_parlays: 0
    });

  if (error) {
    console.error('Error creating public user:', error);
    process.exit(1);
  }

  console.log('✅ Test user created successfully!');
  console.log(`User ID: ${actualUserId}`);
  console.log(`Username: testuser`);
  console.log(`\nUpdate TEST_USER_ID in bks.routes.ts to: '${actualUserId}'`);
}

createTestUser();
