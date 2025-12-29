import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkParlayLegsSchema() {
  const supabase = getSupabase();

  console.log('\n=== Checking parlay_legs Table Schema ===\n');

  // Try to select from the table to see what columns exist
  const { data, error } = await supabase
    .from('parlay_legs')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying parlay_legs:', error);
    console.log('\nTable might not exist or no data available.');

    // Try to get schema info from information_schema
    console.log('\nAttempting to query PostgreSQL information_schema...');

    const { data: schemaData, error: schemaError } = await supabase.rpc('get_table_columns', {
      table_name: 'parlay_legs'
    });

    if (schemaError) {
      console.log('Could not get schema info. Error:', schemaError);
    } else {
      console.log('Schema from information_schema:', schemaData);
    }

    return;
  }

  if (data && data.length > 0) {
    console.log('Found existing record. Columns:');
    Object.keys(data[0]).forEach(col => {
      console.log(`  - ${col}: ${typeof data[0][col]}`);
    });
  } else {
    console.log('Table exists but is empty. Cannot determine schema from data.');
    console.log('Attempting direct query...');

    // Try a raw SQL query to get column names
    const testQuery = await supabase
      .from('parlay_legs')
      .select()
      .limit(0);

    console.log('Query result:', testQuery);
  }
}

checkParlayLegsSchema().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
