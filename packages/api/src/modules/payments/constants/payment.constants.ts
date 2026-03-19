/**
 * Constants for the payments module.
 *
 * All magic numbers and configuration values are centralized here
 * to make the codebase easier to maintain and audit.
 */
export const PAYMENT_CONSTANTS = {
  /** Minimum payment amount (in token units) */
  MIN_AMOUNT: 0.01,

  /** Maximum payment amount per single transfer (safety limit) */
  MAX_AMOUNT: 1_000_000,

  /** Maximum number of participants in a split payment */
  MAX_SPLIT_PARTICIPANTS: 50,

  /** Default page size for payment history pagination */
  DEFAULT_PAGE_SIZE: 20,

  /** Maximum page size for payment history pagination */
  MAX_PAGE_SIZE: 100,

  /** AES-256-GCM IV length in bytes */
  AES_IV_LENGTH: 12,

  /** Nonce length for payment payloads (bytes) */
  PAYLOAD_NONCE_LENGTH: 12,

  /** Maximum note/description length (characters) */
  MAX_NOTE_LENGTH: 500,

  /** Payment request default expiry in hours */
  DEFAULT_REQUEST_EXPIRY_HOURS: 72,

  /** Supported currencies */
  SUPPORTED_CURRENCIES: ["TMUSD"] as const,

  /** HTS token addresses on Hedera */
  TOKEN_ADDRESSES: {
    TMUSD: process.env.TMUSD_TOKEN_ID ?? '0.0.7700096', // Override via TMUSD_TOKEN_ID env var for different networks
  } as const,

  /** HTS token decimal precision */
  TOKEN_DECIMALS: {
    TMUSD: 2,
    USDC: 6,
  } as const,

  /** HCS payment message version */
  HCS_PAYLOAD_VERSION: "1.0",

  /** Maximum transaction fee in HBAR (safety limit) */
  MAX_TRANSACTION_FEE_HBAR: 2,
} as const;
