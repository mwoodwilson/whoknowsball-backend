import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyMigration() {
  const supabase = getSupabase();

  console.log('\n=== Applying parlay_legs Schema Migration ===\n');

  // Read the migration file
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20251102190800_add_parlay_legs_columns.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');

  console.log('Migration SQL:');
  console.log(migrationSQL);
  console.log('\n--- Executing migration ---\n');

  try {
    // Execute the migration SQL
    // Note: Supabase JS client doesn't support raw SQL execution directly
    // We need to use the RPC or REST API approach

    // Split into individual statements and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('COMMENT'));

    for (const statement of statements) {
      if (!statement) continue;

      console.log(`Executing: ${statement.substring(0, 100)}...`);

      // For ALTER TABLE and CREATE INDEX, we need to use the database directly
      // Since Supabase JS client doesn't support DDL, we'll need to use the SQL editor
      console.log('⚠️  This statement needs to be run in Supabase SQL Editor');
    }

    console.log('\n⚠️  MIGRATION NEEDS MANUAL APPLICATION ⚠️');
    console.log('\nThe migration file has been created at:');
    console.log(`  ${migrationPath}`);
    console.log('\nTo apply this migration:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the migration SQL');
    console.log('4. Run the SQL');
    console.log('\nOr use Supabase CLI if installed:');
    console.log('  supabase db push');

  } catch (error) {
    console.error('Error applying migration:', error);
  }
}

applyMigration().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
