/**
 * Circuit Breaker for API-Sports Quota Protection
 *
 * CONTEXT: Prevents catastrophic quota exhaustion by tracking and limiting API requests
 *
 * PROBLEM: Backend was burning 56,000+ API-Sports requests/day across 4 sport APIs
 * - Football API quota: 7,500/day
 * - Basketball API quota: 7,500/day
 * - Hockey API quota: 7,500/day
 * - Baseball API quota: 7,500/day
 * - Combined safe limit: 25,000/day (leaving 5,000 buffer for spikes)
 *
 * SOLUTION: Track all API-Sports calls and enforce daily limit
 */

interface QuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: string;
  resetTime: string;
}

class QuotaCircuitBreaker {
  private dailyRequestCount = 0;
  private readonly MAX_DAILY_REQUESTS = 25000; // Safety limit across all API-Sports APIs
  private lastResetDate = new Date().toDateString();
  private requestHistory: { timestamp: Date; sport: string; endpoint: string }[] = [];

  /**
   * Check if we can make an API request without exceeding quota
   */
  canMakeRequest(): boolean {
    this.checkAndResetDaily();

    // Check if we've hit the safety limit
    if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
      console.error(`🚨 CIRCUIT BREAKER: Daily quota limit reached (${this.dailyRequestCount}/${this.MAX_DAILY_REQUESTS})`);
      console.error(`🚨 All API-Sports requests BLOCKED until midnight UTC`);
      return false;
    }

    return true;
  }

  /**
   * Record an API request (must be called after every successful API call)
   */
  recordRequest(sport: string, endpoint: string) {
    this.checkAndResetDaily();
    this.dailyRequestCount++;

    // Keep last 1000 requests for debugging
    this.requestHistory.push({ timestamp: new Date(), sport, endpoint });
    if (this.requestHistory.length > 1000) {
      this.requestHistory.shift();
    }

    // Warn at quota milestones
    if (this.dailyRequestCount === Math.floor(this.MAX_DAILY_REQUESTS * 0.5)) {
      console.warn(`⚠️ QUOTA WARNING: 50% of daily limit used (${this.dailyRequestCount}/${this.MAX_DAILY_REQUESTS})`);
    } else if (this.dailyRequestCount === Math.floor(this.MAX_DAILY_REQUESTS * 0.8)) {
      console.warn(`⚠️ QUOTA WARNING: 80% of daily limit used (${this.dailyRequestCount}/${this.MAX_DAILY_REQUESTS})`);
      console.warn(`⚠️ Consider stopping non-essential background jobs`);
    } else if (this.dailyRequestCount === Math.floor(this.MAX_DAILY_REQUESTS * 0.95)) {
      console.error(`🚨 QUOTA CRITICAL: 95% of daily limit used (${this.dailyRequestCount}/${this.MAX_DAILY_REQUESTS})`);
      console.error(`🚨 Circuit breaker will trip at 100%`);
    }

    // Log every 100 requests for monitoring
    if (this.dailyRequestCount % 100 === 0) {
      console.log(`[Circuit Breaker] 📊 Quota usage: ${this.dailyRequestCount}/${this.MAX_DAILY_REQUESTS} (${this.getUsage().percentUsed}%)`);
    }
  }

  /**
   * Get current quota usage statistics
   */
  getUsage(): QuotaUsage {
    this.checkAndResetDaily();

    const percentUsed = ((this.dailyRequestCount / this.MAX_DAILY_REQUESTS) * 100).toFixed(1);
    const remaining = this.MAX_DAILY_REQUESTS - this.dailyRequestCount;

    // Calculate next reset time (midnight UTC)
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setUTCHours(24, 0, 0, 0);

    return {
      used: this.dailyRequestCount,
      limit: this.MAX_DAILY_REQUESTS,
      remaining,
      percentUsed,
      resetTime: nextReset.toISOString()
    };
  }

  /**
   * Get recent request history (for debugging quota burn)
   */
  getRecentRequests(limit = 50) {
    return this.requestHistory.slice(-limit).reverse();
  }

  /**
   * Get request count by sport (for debugging which sport is burning quota)
   */
  getRequestsBySport(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const req of this.requestHistory) {
      counts[req.sport] = (counts[req.sport] || 0) + 1;
    }
    return counts;
  }

  /**
   * Reset quota counter at midnight UTC
   */
  private checkAndResetDaily() {
    const today = new Date().toDateString();

    if (today !== this.lastResetDate) {
      console.log(`[Circuit Breaker] ♻️ Daily quota reset: ${this.dailyRequestCount} requests used yesterday`);
      this.dailyRequestCount = 0;
      this.lastResetDate = today;
      this.requestHistory = [];
    }
  }

  /**
   * Manual reset (for testing only)
   */
  reset() {
    console.warn('[Circuit Breaker] ⚠️ Manual reset triggered');
    this.dailyRequestCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.requestHistory = [];
  }
}

// Singleton instance
export const quotaCircuitBreaker = new QuotaCircuitBreaker();
