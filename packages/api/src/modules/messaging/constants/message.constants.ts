/**
 * Constants for the messaging module.
 *
 * All magic numbers and configuration values are centralized here
 * to make the codebase easier to maintain and audit.
 */
export const MESSAGE_CONSTANTS = {
  /** Maximum text length for a single message (characters) */
  MAX_TEXT_LENGTH: 1000,

  /** Maximum file size for media uploads (bytes) — 50 MB */
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,

  /** Mirror Node polling interval for message sync (milliseconds) — 30s */
  MIRROR_NODE_POLL_INTERVAL_MS: 30_000,

  /** Maximum messages to fetch per Mirror Node request */
  MIRROR_NODE_BATCH_SIZE: 100,

  /** Default page size for message pagination */
  DEFAULT_PAGE_SIZE: 50,

  /** Maximum page size for message pagination */
  MAX_PAGE_SIZE: 100,

  /** AES-256-GCM key length in bytes */
  AES_KEY_LENGTH: 32,

  /** AES-256-GCM IV (initialization vector) length in bytes */
  AES_IV_LENGTH: 12,

  /** AES-256-GCM authentication tag length in bytes */
  AES_AUTH_TAG_LENGTH: 16,

  /** Nonce length for message payloads (bytes, used for randomness, not AES IV) */
  PAYLOAD_NONCE_LENGTH: 12,

  /** Maximum HCS message size in bytes (~6 KB) */
  HCS_MAX_MESSAGE_SIZE: 6000,
} as const;
