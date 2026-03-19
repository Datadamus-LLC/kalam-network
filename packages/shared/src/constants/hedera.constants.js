"use strict";
// =============================================================================
// HEDERA CONSTANTS
// =============================================================================
// All magic numbers related to Hedera operations.
// These costs are approximate and based on current testnet/mainnet pricing.
// Source: https://docs.hedera.com/hedera/networks/mainnet/fees
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_FILE_TYPES = exports.ALLOWED_VOICE_TYPES = exports.ALLOWED_VIDEO_TYPES = exports.ALLOWED_IMAGE_TYPES = exports.MAX_FILE_SIZE_BYTES = exports.MAX_VOICE_SIZE_BYTES = exports.MAX_VIDEO_SIZE_BYTES = exports.MAX_IMAGE_SIZE_BYTES = exports.DEFAULT_MESSAGE_PAGE_SIZE = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.MIRROR_NODE_POLL_INTERVAL_MS = exports.WS_HEARTBEAT_INTERVAL_MS = exports.TYPING_INDICATOR_TIMEOUT_MS = exports.OTP_MAX_ATTEMPTS = exports.OTP_RESEND_COOLDOWN_SECONDS = exports.OTP_EXPIRY_SECONDS = exports.OTP_LENGTH = exports.MAX_LOCATION_LENGTH = exports.MAX_PAYMENT_NOTE_LENGTH = exports.MAX_DISPLAY_NAME_LENGTH = exports.MAX_BIO_LENGTH = exports.MAX_POST_MEDIA_COUNT = exports.MAX_POST_TEXT_CHARS = exports.MAX_GROUP_MEMBERS_BUSINESS = exports.MAX_GROUP_MEMBERS_INDIVIDUAL = exports.MAX_TEXT_MESSAGE_CHARS = exports.HCS_ENCRYPTED_PAYLOAD_MAX_BYTES = exports.HCS_MESSAGE_MAX_BYTES = exports.ONBOARDING_COST_USD = exports.ACCOUNT_CREATE_COST_USD = exports.HTS_WIPE_COST_USD = exports.HTS_FREEZE_COST_USD = exports.HTS_TRANSFER_COST_USD = exports.HTS_MINT_COST_USD = exports.HTS_TOKEN_CREATE_COST_USD = exports.HCS_TOPIC_UPDATE_COST_USD = exports.HCS_MESSAGE_COST_USD = exports.HCS_TOPIC_CREATE_COST_USD = void 0;
// --- Transaction Costs (USD) ---
exports.HCS_TOPIC_CREATE_COST_USD = 0.01;
exports.HCS_MESSAGE_COST_USD = 0.0008;
exports.HCS_TOPIC_UPDATE_COST_USD = 0.001;
exports.HTS_TOKEN_CREATE_COST_USD = 1.00;
exports.HTS_MINT_COST_USD = 0.05;
exports.HTS_TRANSFER_COST_USD = 0.001;
exports.HTS_FREEZE_COST_USD = 0.001;
exports.HTS_WIPE_COST_USD = 0.001;
exports.ACCOUNT_CREATE_COST_USD = 0.05;
// --- Onboarding Cost Breakdown ---
// Per user: 1x CryptoTransfer ($0.05) + 1x TokenMint ($0.05) + 1x TokenFreeze ($0.001)
//         + 1x HCS attestation ($0.0008) + 2x HCS CreateTopic ($0.02)
//         = ~$0.12 per user
exports.ONBOARDING_COST_USD = 0.12;
// --- HCS Message Limits ---
exports.HCS_MESSAGE_MAX_BYTES = 1024;
/** After AES-256-GCM encryption overhead (~28 bytes: 16 tag + 12 nonce), available for plaintext */
exports.HCS_ENCRYPTED_PAYLOAD_MAX_BYTES = 996;
/** Approximate max text length for text-only messages after JSON overhead */
exports.MAX_TEXT_MESSAGE_CHARS = 800;
// --- Application Limits ---
exports.MAX_GROUP_MEMBERS_INDIVIDUAL = 256;
exports.MAX_GROUP_MEMBERS_BUSINESS = 1024;
exports.MAX_POST_TEXT_CHARS = 800;
exports.MAX_POST_MEDIA_COUNT = 4;
exports.MAX_BIO_LENGTH = 256;
exports.MAX_DISPLAY_NAME_LENGTH = 64;
exports.MAX_PAYMENT_NOTE_LENGTH = 256;
exports.MAX_LOCATION_LENGTH = 128;
// --- OTP ---
exports.OTP_LENGTH = 6;
exports.OTP_EXPIRY_SECONDS = 300; // 5 minutes
exports.OTP_RESEND_COOLDOWN_SECONDS = 60;
exports.OTP_MAX_ATTEMPTS = 5;
// --- Real-Time ---
exports.TYPING_INDICATOR_TIMEOUT_MS = 5000;
exports.WS_HEARTBEAT_INTERVAL_MS = 30000;
exports.MIRROR_NODE_POLL_INTERVAL_MS = 2000;
// --- Pagination ---
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
exports.DEFAULT_MESSAGE_PAGE_SIZE = 50;
// --- Media Limits ---
exports.MAX_IMAGE_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB
exports.MAX_VIDEO_SIZE_BYTES = 64 * 1024 * 1024; // 64 MB
exports.MAX_VOICE_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB
exports.MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
exports.ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
exports.ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
exports.ALLOWED_VOICE_TYPES = ['audio/ogg', 'audio/mp4', 'audio/m4a'];
exports.ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
];
//# sourceMappingURL=hedera.constants.js.map