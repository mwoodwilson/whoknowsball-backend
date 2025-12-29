import dotenv from 'dotenv';
dotenv.config();

import { getSupabase } from '../src/config/supabase';

async function checkAllBets() {
  const supabase = getSupabase();

  const { data: bets } = await supabase
    .from('bets')
    .select('id, sport_key, bet_type, legs, status')
    .order('placed_at', { ascending: false })
    .limit(10);

  console.log('\n=== All Recent Bets ===\n');
  bets?.forEach((bet: any) => {
    const sport = bet.sport_key.toUpperCase().padEnd(20);
    const type = bet.bet_type.padEnd(10);
    console.log(`${sport} | Type: ${type} | Legs: ${bet.legs} | Status: ${bet.status}`);
  });
  console.log('\n');
}

checkAllBets().then(() => process.exit(0));
