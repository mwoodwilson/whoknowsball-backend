/**
 * Game ID Validation Utilities
 *
 * PURPOSE: Prevent betting on games that cannot be settled
 *
 * CONTEXT:
 * - API-Sports game IDs are integers (e.g., "17478", "415936")
 * - Legacy Odds API game IDs are 32-char hex hashes (e.g., "45d54dc6c11d254fd1b64ba6967ef453")
 * - ScoresJob can ONLY update games with API-Sports integer IDs
 * - Hash ID games will NEVER get score updates, causing bets to be stuck forever
 *
 * SAFEGUARD: Reject any bets on hash ID games at placement time
 */

// Regex pattern for legacy Odds API hash IDs (32 hex characters)
const HASH_ID_PATTERN = /^[a-f0-9]{32}$/i;

// Regex pattern for valid API-Sports integer IDs
const INTEGER_ID_PATTERN = /^\d+$/;

/**
 * Check if a game ID is a legacy hash ID (Odds API format)
 * These games CANNOT be settled because ScoresJob cannot update them
 */
export function isLegacyHashId(gameId: string): boolean {
  return HASH_ID_PATTERN.test(gameId);
}

/**
 * Check if a game ID is a valid API-Sports integer ID
 * Only these games can be properly settled
 */
export function isValidApiSportsId(gameId: string): boolean {
  return INTEGER_ID_PATTERN.test(gameId);
}

/**
 * Validate a game ID for bet placement
 * Returns an error message if invalid, null if valid
 */
export function validateGameIdForBetting(gameId: string): string | null {
  if (!gameId || typeof gameId !== 'string') {
    return 'game_id is required and must be a string';
  }

  if (isLegacyHashId(gameId)) {
    return 'Cannot place bet on legacy game. This game uses an old ID format that cannot be settled. Please select a different game.';
  }

  if (!isValidApiSportsId(gameId)) {
    return 'Invalid game_id format. Expected an API-Sports integer ID.';
  }

  return null; // Valid
}

/**
 * Log a warning for games that cannot be updated
 * Used by ScoresJob to track problematic games
 */
export function logUnupdatableGame(gameId: string, reason: string): void {
  if (isLegacyHashId(gameId)) {
    // This is expected for legacy games - log at debug level
    console.debug(`[GameValidation] Legacy hash ID game ${gameId}: ${reason}`);
  } else {
    // This is unexpected - log as warning
    console.warn(`[GameValidation] WARNING: Cannot update game ${gameId}: ${reason}`);
  }
}
