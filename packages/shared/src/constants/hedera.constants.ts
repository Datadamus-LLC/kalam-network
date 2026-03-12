// =============================================================================
// HEDERA CONSTANTS
// =============================================================================
// All magic numbers related to Hedera operations.
// These costs are approximate and based on current testnet/mainnet pricing.
// Source: https://docs.hedera.com/hedera/networks/mainnet/fees
// =============================================================================

// --- Transaction Costs (USD) ---
export const HCS_TOPIC_CREATE_COST_USD = 0.01;
export const HCS_MESSAGE_COST_USD = 0.0008;
export const HCS_TOPIC_UPDATE_COST_USD = 0.001;
export const HTS_TOKEN_CREATE_COST_USD = 1.00;
export const HTS_MINT_COST_USD = 0.05;
export const HTS_TRANSFER_COST_USD = 0.001;
export const HTS_FREEZE_COST_USD = 0.001;
export const HTS_WIPE_COST_USD = 0.001;
export const ACCOUNT_CREATE_COST_USD = 0.05;

// --- Onboarding Cost Breakdown ---
// Per user: 1x CryptoTransfer ($0.05) + 1x TokenMint ($0.05) + 1x TokenFreeze ($0.001)
//         + 1x HCS attestation ($0.0008) + 2x HCS CreateTopic ($0.02)
//         = ~$0.12 per user
export const ONBOARDING_COST_USD = 0.12;

// --- HCS Message Limits ---
export const HCS_MESSAGE_MAX_BYTES = 1024;
/** After AES-256-GCM encryption overhead (~28 bytes: 16 tag + 12 nonce), available for plaintext */
export const HCS_ENCRYPTED_PAYLOAD_MAX_BYTES = 996;
/** Approximate max text length for text-only messages after JSON overhead */
export const MAX_TEXT_MESSAGE_CHARS = 800;

// --- Application Limits ---
export const MAX_GROUP_MEMBERS_INDIVIDUAL = 256;
export const MAX_GROUP_MEMBERS_BUSINESS = 1024;
export const MAX_POST_TEXT_CHARS = 800;
export const MAX_POST_MEDIA_COUNT = 4;
export const MAX_BIO_LENGTH = 256;
export const MAX_DISPLAY_NAME_LENGTH = 64;
export const MAX_PAYMENT_NOTE_LENGTH = 256;
export const MAX_LOCATION_LENGTH = 128;

// --- OTP ---
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 300;        // 5 minutes
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

// --- Real-Time ---
export const TYPING_INDICATOR_TIMEOUT_MS = 5000;
export const WS_HEARTBEAT_INTERVAL_MS = 30000;
export const MIRROR_NODE_POLL_INTERVAL_MS = 2000;

// --- Pagination ---
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_MESSAGE_PAGE_SIZE = 50;

// --- Media Limits ---
export const MAX_IMAGE_SIZE_BYTES = 16 * 1024 * 1024;     // 16 MB
export const MAX_VIDEO_SIZE_BYTES = 64 * 1024 * 1024;     // 64 MB
export const MAX_VOICE_SIZE_BYTES = 16 * 1024 * 1024;     // 16 MB
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;     // 100 MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
export const ALLOWED_VOICE_TYPES = ['audio/ogg', 'audio/mp4', 'audio/m4a'];
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
];
