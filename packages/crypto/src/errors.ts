// =============================================================================
// CRYPTO ERROR TYPES
// =============================================================================
// Typed error class for all cryptographic operations.
// Provides specific error codes so callers can handle different failure modes.
// =============================================================================

/**
 * Error codes for crypto operations.
 */
export type CryptoErrorCode =
  | 'INVALID_KEY'
  | 'INVALID_KEY_TYPE'
  | 'INVALID_KEY_LENGTH'
  | 'INVALID_IV'
  | 'INVALID_NONCE'
  | 'DECRYPTION_FAILED'
  | 'KEY_DERIVATION_FAILED'
  | 'BOX_OPEN_FAILED'
  | 'KEY_NOT_FOUND'
  | 'KEY_ID_MISMATCH';

/**
 * Typed error class for all cryptographic operations.
 *
 * Every crypto failure throws this error with a specific code,
 * allowing callers to handle different failure modes programmatically.
 */
export class CryptoError extends Error {
  public readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}
