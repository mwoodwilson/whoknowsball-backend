import { createClient } from '@supabase/supabase-js';

// Lazy-load Supabase client to ensure env vars are loaded
let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return supabase;
}

/**
 * DailyBKSService - Calculate and store daily BKS snapshots
 *
 * PURPOSE:
 * - Track daily BKS performance for historical charts
 * - Powers "BKS Over Time" line chart in MyBKS dashboard
 * - Stores average BKS of all bets settled each day
 *
 * TRIGGERED BY:
 * - SettlementJob when bets are settled
 * - Calculates daily average in real-time
 */
export class DailyBKSService {
  /**
   * Update daily BKS snapshot for a user on a specific date
   * Called after bets are settled
   *
   * @param userId - The user's UUID
   * @param date - Optional date (defaults to today)
   */
  async updateDailySnapshot(userId: string, date?: Date): Promise<void> {
    const snapshotDate = date || new Date();
    const dateStr = snapshotDate.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      const db = getSupabase();

      // Get all bets settled on this date
      const { data: bets, error } = await db
        .from('bets')
        .select('bks_final')
        .eq('user_id', userId)
        .eq('status', 'SETTLED')
        .gte('settled_at', `${dateStr}T00:00:00Z`)
        .lt('settled_at', `${dateStr}T23:59:59Z`);

      if (error) throw error;

      if (!bets || bets.length === 0) {
        console.log(`[DailyBKS] No bets settled on ${dateStr} for user ${userId}`);
        return;
      }

      // Calculate average BKS for this day
      const validBKS = bets
        .map(b => b.bks_final)
        .filter(bks => bks != null && !isNaN(bks));

      if (validBKS.length === 0) {
        console.log(`[DailyBKS] No valid BKS scores on ${dateStr} for user ${userId}`);
        return;
      }

      const dailyBKS = validBKS.reduce((sum, bks) => sum + bks, 0) / validBKS.length;

      // Upsert daily snapshot
      const { error: upsertError } = await db
        .from('bks_daily_snapshots')
        .upsert({
          user_id: userId,
          snapshot_date: dateStr,
          daily_bks: parseFloat(dailyBKS.toFixed(2)),
          bets_settled_count: bets.length,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,snapshot_date'
        });

      if (upsertError) throw upsertError;

      console.log(`[DailyBKS] ✅ Updated snapshot for ${dateStr}: ${dailyBKS.toFixed(2)} (${bets.length} bets)`);
    } catch (error) {
      console.error(`[DailyBKS] Error updating daily snapshot:`, error);
      throw error;
    }
  }

  /**
   * Get last N days of BKS snapshots for a user
   *
   * @param userId - The user's UUID
   * @param days - Number of days to retrieve (default: 30). Use 0 for all time (no limit).
   * @returns Array of {date, bks} objects sorted by date ascending
   */
  async getRecentSnapshots(userId: string, days: number = 30): Promise<Array<{date: string, bks: number}>> {
    try {
      const db = getSupabase();

      let query = db
        .from('bks_daily_snapshots')
        .select('snapshot_date, daily_bks')
        .eq('user_id', userId)
        .order('snapshot_date', { ascending: true });

      // Only apply limit if days > 0 (days=0 means "all time")
      if (days > 0) {
        query = query.limit(days);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(row => ({
        date: row.snapshot_date,
        bks: row.daily_bks
      }));
    } catch (error) {
      console.error(`[DailyBKS] Error fetching snapshots:`, error);
      return [];
    }
  }
}

export const dailyBKSService = new DailyBKSService();
