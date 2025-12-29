require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    db: {
      schema: 'public'
    }
  }
);

async function runMigration() {
  console.log('📝 Running migration: add_bks_daily_snapshots.sql');
  console.log('');

  const sql = fs.readFileSync('./src/database/migrations/add_bks_daily_snapshots.sql', 'utf8');

  // Split SQL into individual statements and filter out comments
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement) continue;

    console.log(`Executing statement ${i + 1}/${statements.length}...`);

    try {
      // Use the from() method to execute raw SQL
      const { error } = await supabase.rpc('exec', { sql: statement });

      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error);
        process.exit(1);
      }
    } catch (err) {
      console.error(`❌ Exception in statement ${i + 1}:`, err.message);
      process.exit(1);
    }
  }

  console.log('');
  console.log('✅ Migration completed successfully!');
  console.log('');
  console.log('Created table: bks_daily_snapshots');
  console.log('- Columns: id, user_id, snapshot_date, daily_bks, bets_settled_count, created_at, updated_at');
  console.log('- Index: idx_bks_daily_user_date');
  console.log('- RLS enabled with user read + service role manage policies');
  process.exit(0);
}

runMigration();
