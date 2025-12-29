import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';
import fs from 'fs';
import path from 'path';

async function runMigration(filename: string) {
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', filename);
  const migration = fs.readFileSync(migrationPath, 'utf-8');
  const supabase = getSupabase();

  console.log(`\n=== Running migration: ${filename} ===\n`);
  console.log(migration);
  console.log('\nExecuting SQL statements...\n');

  // Split by semicolons and run each statement
  const statements = migration
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`Statement ${i + 1}/${statements.length}:`);
    console.log(statement.substring(0, 100) + '...\n');

    const { error } = await (supabase as any).rpc('query', { query_text: statement });

    if (error) {
      console.error(`❌ Error on statement ${i + 1}:`, error);
      // Try direct SQL execution as fallback
      const result = await (supabase as any).rpc('pg_eval', { command: statement });
      if (result.error) {
        console.error(`❌ Fallback also failed:`, result.error);
        throw result.error;
      }
      console.log(`✅ Statement ${i + 1} executed successfully (via fallback)\n`);
    } else {
      console.log(`✅ Statement ${i + 1} executed successfully\n`);
    }
  }

  console.log('✅ Migration complete!\n');
}

const migrationFile = process.argv[2] || '20251103213554_fix_payout_constraint.sql';

runMigration(migrationFile)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  });
