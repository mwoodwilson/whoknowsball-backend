import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  console.log('Applying daily_quota_tracking migration...\n');

  try {
    // Create the table
    console.log('1. Creating daily_quota_tracking table...');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.daily_quota_tracking (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        date DATE NOT NULL,
        api_name TEXT NOT NULL,
        requests_used INTEGER NOT NULL DEFAULT 0,
        quota_limit INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(date, api_name)
      );
    `;

    // Execute using REST API directly
    const tableResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        query: createTableSQL
      })
    });

    console.log('Table creation response status:', tableResponse.status);

    // Create the index
    console.log('\n2. Creating index...');
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_daily_quota_date_api
      ON public.daily_quota_tracking(date, api_name);
    `;

    // Create the function
    console.log('\n3. Creating increment_daily_quota function...');
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION increment_daily_quota(p_date DATE, p_api_name TEXT)
      RETURNS VOID AS $$
      BEGIN
        UPDATE public.daily_quota_tracking
        SET requests_used = requests_used + 1,
            updated_at = NOW()
        WHERE date = p_date AND api_name = p_api_name;
      END;
      $$ LANGUAGE plpgsql;
    `;

    // Grant permissions
    console.log('\n4. Granting permissions...');
    const grantSQL = `
      GRANT ALL ON public.daily_quota_tracking TO authenticated;
      GRANT ALL ON public.daily_quota_tracking TO service_role;
      GRANT EXECUTE ON FUNCTION increment_daily_quota(DATE, TEXT) TO authenticated;
      GRANT EXECUTE ON FUNCTION increment_daily_quota(DATE, TEXT) TO service_role;
    `;

    console.log('\n✅ SQL statements prepared. Now executing via Supabase...\n');

    // Try to query the table to verify
    console.log('Verifying table access...');
    const { data, error } = await supabase
      .from('daily_quota_tracking')
      .select('*')
      .limit(1);

    if (error) {
      console.log('Table does not exist yet or access denied:', error.message);
      console.log('\n⚠️  Please run the following SQL manually in Supabase dashboard:\n');
      console.log('=' .repeat(80));
      console.log(createTableSQL);
      console.log(createIndexSQL);
      console.log(createFunctionSQL);
      console.log(grantSQL);
      console.log('=' .repeat(80));
      console.log('\nSteps:');
      console.log('1. Open https://supabase.com/dashboard');
      console.log('2. Select your project');
      console.log('3. Go to SQL Editor');
      console.log('4. Paste the SQL above');
      console.log('5. Click "Run" or press Cmd/Ctrl+Enter');
    } else {
      console.log('✓ Table already exists and is accessible!');
      console.log('Current records:', data);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

applyMigration();
