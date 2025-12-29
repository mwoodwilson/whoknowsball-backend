import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    const migrationPath = path.join(__dirname, '../supabase/migrations/20251106020000_create_daily_quota_tracking.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Applying migration: 20251106020000_create_daily_quota_tracking.sql');
    console.log('SQL Content:');
    console.log(sqlContent);
    console.log('\n---\n');

    // Split SQL into individual statements (split by semicolons but preserve function bodies)
    const statements = sqlContent
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)(?=(?:[^$]*\$[^$]*\$)*[^$]*$)/g)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length === 0) continue;

      console.log(`Executing: ${statement.substring(0, 100)}...`);

      // Use raw query execution via REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: statement + ';' })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`Error executing statement: ${error}`);

        // Try alternative approach using pg-meta
        console.log('Trying direct SQL execution...');
        const { data, error: supabaseError } = await supabase.rpc('exec', {
          sql: statement + ';'
        });

        if (supabaseError) {
          console.error('Supabase error:', supabaseError);
          throw supabaseError;
        }
      }

      console.log('✓ Statement executed successfully');
    }

    console.log('\n✅ Migration applied successfully!');

    // Verify table was created
    const { data, error } = await supabase
      .from('daily_quota_tracking')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Verification failed:', error);
    } else {
      console.log('✓ Table verified - daily_quota_tracking exists');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
