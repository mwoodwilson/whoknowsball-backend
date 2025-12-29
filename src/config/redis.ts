import { createClient } from 'redis';

/**
 * Redis Client Configuration
 *
 * Provides a singleton Redis client for caching operations.
 * Used for:
 * - User BKS rankings cache
 * - Leaderboard data
 * - Frequently accessed game data
 * - Rate limiting
 */

// Create Redis client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[Redis] Too many reconnection attempts, giving up');
        return new Error('Redis reconnection failed');
      }
      // Exponential backoff: 50ms, 100ms, 200ms, 400ms, etc.
      const delay = Math.min(retries * 50, 3000);
      console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    }
  }
});

// Connection event handlers
redisClient.on('connect', () => {
  console.log('[Redis] Connecting to Redis server...');
});

redisClient.on('ready', () => {
  console.log('[Redis] Redis client ready');
});

redisClient.on('error', (err) => {
  console.error('[Redis] Redis client error:', err);
});

redisClient.on('end', () => {
  console.log('[Redis] Redis connection closed');
});

/**
 * Initialize Redis connection
 * Should be called once on server startup
 */
export async function initRedis(): Promise<void> {
  try {
    await redisClient.connect();
    console.log('[Redis] Successfully connected to Redis');
  } catch (error) {
    console.error('[Redis] Failed to connect to Redis:', error);
    throw error;
  }
}

/**
 * Close Redis connection
 * Should be called on server shutdown
 */
export async function closeRedis(): Promise<void> {
  try {
    await redisClient.quit();
    console.log('[Redis] Redis connection closed gracefully');
  } catch (error) {
    console.error('[Redis] Error closing Redis connection:', error);
  }
}

/**
 * Set a key-value pair with expiry time
 *
 * @param key - Cache key
 * @param value - Value to cache (will be JSON stringified)
 * @param seconds - Expiry time in seconds
 */
export async function setWithExpiry(key: string, value: any, seconds: number): Promise<void> {
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await redisClient.setEx(key, seconds, stringValue);
  } catch (error) {
    console.error(`[Redis] Error setting key ${key}:`, error);
    throw error;
  }
}

/**
 * Get a cached value by key
 *
 * @param key - Cache key
 * @returns Parsed value or null if not found
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    const value = await redisClient.get(key);
    if (!value) return null;

    // Try to parse as JSON, return as string if parsing fails
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  } catch (error) {
    console.error(`[Redis] Error getting key ${key}:`, error);
    throw error;
  }
}

/**
 * Delete a cached value by key
 *
 * @param key - Cache key
 * @returns Number of keys deleted (0 or 1)
 */
export async function deleteCache(key: string): Promise<number> {
  try {
    return await redisClient.del(key);
  } catch (error) {
    console.error(`[Redis] Error deleting key ${key}:`, error);
    throw error;
  }
}

/**
 * Delete multiple cached values by pattern
 *
 * @param pattern - Key pattern (e.g., 'user:*')
 * @returns Number of keys deleted
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return 0;
    return await redisClient.del(keys);
  } catch (error) {
    console.error(`[Redis] Error deleting pattern ${pattern}:`, error);
    throw error;
  }
}

/**
 * Check if a key exists in cache
 *
 * @param key - Cache key
 * @returns True if key exists, false otherwise
 */
export async function exists(key: string): Promise<boolean> {
  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    console.error(`[Redis] Error checking existence of key ${key}:`, error);
    throw error;
  }
}

/**
 * Get time-to-live (TTL) for a key
 *
 * @param key - Cache key
 * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
 */
export async function getTTL(key: string): Promise<number> {
  try {
    return await redisClient.ttl(key);
  } catch (error) {
    console.error(`[Redis] Error getting TTL for key ${key}:`, error);
    throw error;
  }
}

/**
 * Set a key-value pair without expiry
 *
 * @param key - Cache key
 * @param value - Value to cache
 */
export async function set(key: string, value: any): Promise<void> {
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await redisClient.set(key, stringValue);
  } catch (error) {
    console.error(`[Redis] Error setting key ${key}:`, error);
    throw error;
  }
}

/**
 * Increment a numeric value
 *
 * @param key - Cache key
 * @param increment - Amount to increment by (default: 1)
 * @returns New value after increment
 */
export async function increment(key: string, increment: number = 1): Promise<number> {
  try {
    return await redisClient.incrBy(key, increment);
  } catch (error) {
    console.error(`[Redis] Error incrementing key ${key}:`, error);
    throw error;
  }
}

/**
 * Get Redis client info
 *
 * @returns Redis server info
 */
export async function getInfo(): Promise<string> {
  try {
    return await redisClient.info();
  } catch (error) {
    console.error('[Redis] Error getting Redis info:', error);
    throw error;
  }
}
