// =============================================================================
// USER TYPES
// =============================================================================
// These types represent user data across the platform.
// Maps to: PostgreSQL "users" table + DID NFT metadata on IPFS.
// Reference: docs/SPECIFICATION.md Section 1.4 (Account Types), Section 4.2 (users table)
// =============================================================================

/** The type of account — determines features and limits */
export type AccountType = 'individual' | 'business';

/**
 * User lifecycle states.
 *
 * Flow: pending_wallet → pending_kyc → kyc_submitted → active
 *                                                    → kyc_rejected (can resubmit)
 */
export type UserStatus =
  | 'pending_wallet'   // Just registered, wallet not yet created
  | 'pending_kyc'      // Wallet created, awaiting KYC submission
  | 'kyc_submitted'    // KYC documents submitted to Mirsad AI, awaiting result
  | 'active'           // KYC approved, DID NFT minted, fully onboarded
  | 'kyc_rejected';    // KYC rejected, user can resubmit

/** KYC verification levels for individual accounts */
export type KycLevel = 'basic' | 'enhanced' | 'institutional';

/** KYB verification levels for business accounts */
export type KybLevel = 'basic' | 'verified' | 'certified';

/**
 * Core user record.
 *
 * This is the shape of the user as stored in PostgreSQL.
 * It's an INDEX of on-chain data — if the DB is wiped, this can be
 * reconstructed from the Hedera account + DID NFT metadata.
 */
export interface User {
  /** Platform-internal UUID */
  id: string;

  /** Hedera Account ID, e.g., "0.0.12345" — this IS the user's identity */
  hederaAccountId: string;

  /** Individual or business account */
  accountType: AccountType;

  /** Registration email (nullable — could register with phone) */
  email?: string | null;

  /** Registration phone in E.164 format, e.g., "+971501234567" */
  phone?: string | null;

  /** Display name shown to other users (max 64 chars) */
  displayName?: string | null;

  /** User bio text (max 256 chars) */
  bio?: string | null;

  /** IPFS CID of the profile avatar image */
  avatarIpfsCid?: string | null;

  /** Current lifecycle status */
  status: UserStatus;

  /** KYC verification level (null until approved) */
  kycLevel?: KycLevel | null;

  /** HTS NFT serial number of the user's DID NFT */
  didNftSerial?: number | null;

  /** IPFS CID of the current DID NFT metadata JSON */
  didNftMetadataCid?: string | null;

  /** HCS Topic ID for this user's public post feed */
  publicFeedTopic?: string | null;

  /** HCS Topic ID for this user's notification inbox */
  notificationTopic?: string | null;

  /** HCS Topic ID for business broadcast channel (business only) */
  broadcastTopic?: string | null;

  /** X25519 public key for E2E encryption (hex format, Layer 2) */
  publicKey?: string | null;

  /** Tamam Custody wallet ID (for signing transactions) */
  custodyWalletId?: string | null;

  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}

/**
 * Additional profile data for business accounts.
 * Maps to: PostgreSQL "business_profiles" table.
 */
export interface BusinessProfile {
  userId: string;
  companyName?: string | null;
  registrationNumber?: string | null;
  businessCategory?: string | null;
  kybLevel?: KybLevel | null;
  website?: string | null;
  businessHours?: Record<string, string> | null; // { "mon": "9:00-17:00", ... }
  createdAt: string;
}

/**
 * DID NFT Metadata stored on IPFS.
 * Conforms to HIP-412 (Hedera NFT metadata standard).
 * Reference: docs/SPECIFICATION.md DM-ID-001
 */
export interface DIDNftMetadata {
  name: string;           // "DID:hedera:mainnet:0.0.12345"
  description: string;    // "Decentralized Identity Credential"
  image: string;          // "ipfs://{profile_image_cid}"
  type: string;           // "image/png"
  format: string;         // "HIP412@2.0.0"
  properties: {
    accountType: AccountType;
    kycLevel: KycLevel | KybLevel;
    kycProvider: 'mirsad-ai';
    kycTimestamp: string;  // ISO8601
    kycHash: string;       // SHA-256 of KYC attestation
    displayName: string;
    bio: string;
    location?: string;
    createdAt: string;     // ISO8601
    version: string;       // "1.0.0"
  };
  /** Only present for business accounts */
  businessProperties?: {
    companyName?: string;
    registrationNumber?: string;
    businessCategory?: string;
    kybLevel?: KybLevel;
    website?: string;
  };
}

/**
 * Public profile response (what other users see).
 * Returned by: GET /api/v1/profile/:accountId
 */
export interface PublicProfile {
  hederaAccountId: string;
  accountType: AccountType;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;       // Full IPFS gateway URL
  kycVerified: boolean;
  kycLevel: KycLevel | null;
  publicFeedTopic: string | null;
  broadcastTopic: string | null;  // null for individual accounts
  stats: {
    followers: number;
    following: number;
    posts: number;
    messagesOnChain: number;
    paymentsOnChain: number;
  };
  createdAt: string;
  didNft: {
    tokenId: string;
    serial: number;
    metadataCid: string;
  } | null;
}
