/**
 * Two-Factor Authentication Utility
 *
 * Provides functions for generating and validating 2FA codes.
 */

/**
 * Generate a random 6-digit verification code
 *
 * @returns A 6-digit numeric string
 */
export function generate2FACode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}

/**
 * Validate a 2FA code format
 *
 * @param code - The code to validate
 * @returns True if the code is a valid 6-digit number, false otherwise
 */
export function validate2FACodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}
