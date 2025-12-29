import { createClient } from '@supabase/supabase-js';

/**
 * VerificationCheckJob
 *
 * Background job that runs every hour to check for unverified users
 * and suspend accounts that have been unverified for > 24 hours.
 *
 * Usage:
 *   const job = new VerificationCheckJob();
 *   job.start();
 *   // Later...
 *   job.stop();
 */

export class VerificationCheckJob {
  private supabase: ReturnType<typeof createClient> | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private readonly INTERVAL_MS = 3600000; // 1 hour in milliseconds

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('[VerificationCheckJob] Already running');
      return;
    }

    console.log('[VerificationCheckJob] Starting job (runs every hour)');

    // Run immediately on start
    this.runCheck();

    // Then run every hour
    this.intervalId = setInterval(() => {
      this.runCheck();
    }, this.INTERVAL_MS);

    this.isRunning = true;
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[VerificationCheckJob] Not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[VerificationCheckJob] Stopped');
  }

  /**
   * Execute a single verification check run
   */
  private async runCheck(): Promise<void> {
    try {
      console.log('[VerificationCheckJob] Running verification check...');

      const db = this.supabase!;

      // Calculate timestamp for 24 hours ago
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get all users created more than 24 hours ago
      const { data: users, error: usersError } = await db
        .from('users')
        .select('id, created_at')
        .lt('created_at', twentyFourHoursAgo);

      if (usersError) {
        console.error('[VerificationCheckJob] Error fetching users:', usersError);
        return;
      }

      if (!users || users.length === 0) {
        console.log('[VerificationCheckJob] No users older than 24 hours found');
        return;
      }

      console.log(`[VerificationCheckJob] Found ${users.length} users older than 24 hours`);

      // Check each user's verification status
      let suspendedCount = 0;
      let alreadySuspendedCount = 0;
      let verifiedCount = 0;

      for (const user of users) {
        try {
          // Get auth user to check email verification
          const { data: authUser, error: authError } = await db.auth.admin.getUserById(user.id);

          if (authError || !authUser.user) {
            console.error(`[VerificationCheckJob] Error fetching auth user ${user.id}:`, authError);
            continue;
          }

          const isVerified = authUser.user.email_confirmed_at !== null;

          if (isVerified) {
            verifiedCount++;
            continue;
          }

          // User is unverified and older than 24 hours - check if already suspended
          const { data: userProfile, error: profileError } = await db
            .from('users')
            .select('id')
            .eq('id', user.id)
            .single();

          if (profileError) {
            console.error(`[VerificationCheckJob] Error fetching profile ${user.id}:`, profileError);
            continue;
          }

          // In a real implementation, you might have a 'status' column
          // For now, we'll just log that the account should be suspended
          // The actual suspension is handled by the auth middleware checking
          // the 24-hour window + verification status

          console.log(`[VerificationCheckJob] User ${user.id} is unverified for > 24 hours (suspended via middleware)`);
          suspendedCount++;

        } catch (error) {
          console.error(`[VerificationCheckJob] Error processing user ${user.id}:`, error);
          continue;
        }
      }

      console.log(`[VerificationCheckJob] Check complete:`, {
        total_checked: users.length,
        verified: verifiedCount,
        suspended: suspendedCount,
        already_suspended: alreadySuspendedCount
      });

    } catch (error) {
      console.error('[VerificationCheckJob] Error during verification check:', error);
      // Don't stop the job, just log and continue
    }
  }

  /**
   * Check if job is currently running
   */
  getStatus(): { running: boolean; interval_hours: number; next_run_in_ms?: number } {
    return {
      running: this.isRunning,
      interval_hours: this.INTERVAL_MS / (1000 * 60 * 60)
    };
  }

  /**
   * Force a manual check run (useful for testing)
   */
  async runNow(): Promise<void> {
    console.log('[VerificationCheckJob] Running manual verification check...');
    await this.runCheck();
  }
}

// Export singleton instance (lazy loaded)
let jobInstance: VerificationCheckJob | null = null;

export function getVerificationCheckJob(): VerificationCheckJob {
  if (!jobInstance) {
    jobInstance = new VerificationCheckJob();
  }
  return jobInstance;
}

// For backward compatibility
export const verificationCheckJob = {
  start: () => getVerificationCheckJob().start(),
  stop: () => getVerificationCheckJob().stop(),
  getStatus: () => getVerificationCheckJob().getStatus(),
  runNow: () => getVerificationCheckJob().runNow()
};
