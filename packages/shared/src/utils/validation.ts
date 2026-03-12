// =============================================================================
// VALIDATION UTILITIES
// =============================================================================
// Reusable validation functions for input checking.
// Used by both backend (controller validation) and frontend (form validation).
// =============================================================================

/** Validate email format */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/** Validate phone number in E.164 format: +[country code][number] */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  return phoneRegex.test(phone);
}

/** Validate Hedera Account ID format: 0.0.XXXXX */
export function isValidAccountId(accountId: string): boolean {
  const accountRegex = /^0\.0\.\d{1,10}$/;
  return accountRegex.test(accountId);
}

/** Validate HCS Topic ID format: 0.0.XXXXX */
export function isValidTopicId(topicId: string): boolean {
  return isValidAccountId(topicId); // Same format
}

/** Validate UUID v4 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/** Check if a string is within max byte length (for HCS payload size) */
export function isWithinByteLimit(str: string, maxBytes: number): boolean {
  return new TextEncoder().encode(str).length <= maxBytes;
}
