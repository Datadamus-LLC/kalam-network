# P0-T02: Shared Types & Constants Package

| Field | Value |
|-------|-------|
| Task ID | P0-T02 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 3 hours |
| Depends On | P0-T01 (Monorepo Init) |
| Phase | 0 — Project Setup |
| Assignee | Any developer |

---

## Objective

Create the `@hedera-social/shared` package containing all TypeScript types, interfaces, constants, and enums used across the backend and frontend. This is the single source of truth for data shapes — both the API and the web app import from here.

---

## Why This Matters

Every time data moves between services, it needs to match a contract:
- The API sends a `User` object → the frontend must know its shape
- An HCS message has a specific JSON format → both encrypt/decrypt sides must agree
- Payment receipts have specific fields → API, frontend, and on-chain data must match

By defining all types in one shared package, we guarantee consistency and catch mismatches at compile time.

---

## Pre-requisites

- P0-T01 complete (monorepo exists, pnpm works)
- Working terminal in the repo root

---

## Step-by-Step Instructions

### Step 1: Initialize the package

```bash
cd packages/shared
```

Replace the `package.json` with this exact content:

```json
{
  "name": "@hedera-social/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

Install dependencies:

```bash
pnpm install
```

### Step 2: Create directory structure

```bash
mkdir -p src/types
mkdir -p src/constants
mkdir -p src/utils
```

### Step 3: Create User types

Create `src/types/user.types.ts`:

```typescript
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
```

### Step 4: Create Message types

Create `src/types/message.types.ts`:

```typescript
// =============================================================================
// MESSAGE TYPES
// =============================================================================
// Types for all HCS (Hedera Consensus Service) message payloads.
// These are the JSON structures that get encrypted and submitted to HCS topics.
// Reference: docs/SPECIFICATION.md Section 4.1 (On-Chain Data Models)
// =============================================================================

// --- Enums ---

/** Types of content that can be sent in a message */
export type MessageContentType = 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact';

/** Conversation types */
export type ConversationType = 'direct' | 'group';

/** All possible HCS message types on a conversation topic */
export type HcsMessageType =
  | 'message'           // Regular chat message (text, image, file, voice)
  | 'key_exchange'      // Symmetric key distribution (first msg on topic)
  | 'group_meta'        // Group name, avatar, participant list
  | 'system'            // Member added/removed, key rotated
  | 'payment'           // Payment receipt
  | 'payment_request'   // Payment request
  | 'payment_split';    // Split payment

/** Group member roles */
export type GroupMemberRole = 'admin' | 'member';

/** System message actions */
export type SystemAction = 'member_added' | 'member_removed' | 'key_rotated' | 'group_renamed';

// --- HCS Payloads ---

/**
 * DM-MSG-001: Chat Message Payload
 *
 * This is the JSON that gets encrypted with AES-256-GCM and submitted to HCS.
 * Max size: 1024 bytes after encryption (HCS limit).
 * For text messages: ~800 chars available.
 * For media messages: ~200-300 bytes (CID + metadata).
 *
 * IMPORTANT: The "nonce" field is the AES-GCM nonce used for encryption.
 * It must be unique for every message (random 96-bit value).
 */
export interface ChatMessagePayload {
  v: '1.0';
  type: 'message';
  sender: string;           // Hedera Account ID, e.g., "0.0.12345"
  ts: number;               // Unix timestamp in milliseconds
  content: {
    type: MessageContentType;
    text?: string;           // Message text (max 800 chars for text type)
    mediaRef?: string;       // "ipfs://CID" (for image, file, voice types)
    mediaMeta?: {
      filename: string;      // Original filename, e.g., "photo.jpg"
      mimeType: string;      // MIME type, e.g., "image/jpeg"
      size: number;          // File size in bytes
      dimensions?: string;   // "WxH" for images/video, e.g., "1920x1080"
    };
  };
  replyTo?: number;          // HCS sequence number of the message being replied to
  nonce: string;             // Base64-encoded 96-bit AES-GCM nonce
}

/**
 * DM-MSG-002: Key Exchange Payload
 *
 * Submitted as the FIRST message on every conversation topic.
 * The wrapper is plaintext, but each key bundle is encrypted with
 * the recipient's X25519 public key (nacl.box).
 *
 * When you receive this and find your account ID in "keys":
 * 1. Decode the base64 value
 * 2. Decrypt with your X25519 secret key (nacl.box.open)
 * 3. The result is the 256-bit AES key for this conversation
 * 4. Import it and store it locally indexed by topicId + keyId
 */
export interface KeyExchangePayload {
  v: '1.0';
  type: 'key_exchange';
  keys: Record<string, string>;  // { "0.0.ACCOUNT_ID": "base64(encrypt(Ks, pubKey))" }
  algorithm: 'AES-256-GCM';
  keyId: string;                 // UUID v4 — identifies this key version
  rotationIndex: number;         // 0 for initial, increments on key rotation
}

/**
 * DM-MSG-003: Group Metadata Payload
 *
 * Submitted when a group is created or its metadata is updated.
 * This message IS encrypted (part of the conversation topic).
 */
export interface GroupMetaPayload {
  v: '1.0';
  type: 'group_meta';
  action: 'create' | 'update';
  data: {
    name: string;               // Group display name
    avatar?: string;            // "ipfs://CID" of group avatar
    admin: string;              // Account ID of the group admin
    participants: string[];     // Array of all participant Account IDs
  };
}

/**
 * DM-MSG-004: System Message Payload
 *
 * Auto-generated messages for group events.
 * These are encrypted and submitted to the conversation topic.
 * The frontend renders them as gray system messages (not chat bubbles).
 */
export interface SystemMessagePayload {
  v: '1.0';
  type: 'system';
  sender: string;               // Usually "0.0.PLATFORM" or the admin's Account ID
  action: SystemAction;
  data: {
    actor: string;              // Who performed the action
    target: string;             // Who was affected
    newKeyId?: string;          // New key ID after rotation
  };
}

// --- Conversation & Message UI Types ---

/**
 * Conversation object returned by the API.
 * This is NOT an HCS payload — it's a platform-level aggregation.
 */
export interface Conversation {
  id: string;                   // Platform UUID
  hcsTopicId: string;           // HCS Topic ID, e.g., "0.0.99999"
  type: ConversationType;
  groupName?: string | null;    // Only for groups
  groupAvatarCid?: string | null;
  adminAccountId?: string | null;
  createdBy: string;            // Account ID of creator
  participants: ConversationParticipant[];
  lastMessage?: MessagePreview | null;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface ConversationParticipant {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: GroupMemberRole;
  isOnline: boolean;
}

export interface MessagePreview {
  type: HcsMessageType;
  preview: string;              // Truncated/summary text (max 100 chars)
  senderAccountId: string;
  timestamp: string;
  sequenceNumber: number;
}

/**
 * Encrypted message as received from the API / WebSocket.
 * The client must decrypt "encryptedPayload" using the conversation's
 * symmetric key to get the actual ChatMessagePayload.
 */
export interface EncryptedMessage {
  sequenceNumber: number;
  consensusTimestamp: string;   // ISO8601, from Hedera consensus
  senderAccountId: string;
  encryptedPayload: string;    // Base64-encoded AES-256-GCM ciphertext
  nonce: string;               // Base64-encoded 96-bit nonce
  keyId: string;               // Which key version to use for decryption
  transactionId: string;       // Hedera transaction ID
}

/**
 * Decrypted message — what the UI actually renders.
 * Created by combining EncryptedMessage metadata + decrypted ChatMessagePayload.
 */
export interface DecryptedMessage {
  sequenceNumber: number;
  consensusTimestamp: string;
  senderAccountId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  transactionId: string;
  content: {
    type: MessageContentType;
    text?: string;
    mediaRef?: string;
    mediaMeta?: {
      filename: string;
      mimeType: string;
      size: number;
      dimensions?: string;
    };
  };
  replyTo?: number;
  isMine: boolean;             // True if current user sent this
}
```

### Step 5: Create Payment types

Create `src/types/payment.types.ts`:

```typescript
// =============================================================================
// PAYMENT TYPES
// =============================================================================
// Types for in-chat payment widgets and HCS payment receipt payloads.
// All payments are executed via Tamam Rails (HTS token transfer).
// The platform records receipts as encrypted HCS messages in the conversation.
// Reference: docs/SPECIFICATION.md Section 2.4 (In-Chat Payments), DM-PAY-001/002/003
// =============================================================================

export type PaymentStatus = 'confirmed' | 'failed';
export type PaymentRequestStatus = 'pending' | 'paid' | 'declined';
export type PaymentType = 'send' | 'request_fulfillment' | 'split_payment';
export type SplitMethod = 'equal' | 'custom';

/**
 * DM-PAY-001: Payment Receipt
 *
 * Submitted to the conversation topic AFTER a successful Tamam Rails transfer.
 * Encrypted with the conversation's symmetric key.
 *
 * IMPORTANT: Only submit this AFTER the HTS transfer is confirmed.
 * If the transfer fails, do NOT submit a receipt.
 */
export interface PaymentReceiptPayload {
  v: '1.0';
  type: 'payment';
  sender: string;
  content: {
    action: 'send';
    amount: number;
    currency: string;           // "USD", "AED", "HBAR", etc.
    tokenId: string;            // HTS token ID used for the transfer
    recipient: string;          // Recipient's Account ID
    note?: string;              // Optional message (max 256 chars)
    txHash: string;             // Hedera transaction ID from HTS transfer
    status: PaymentStatus;
    custodyTxId: string;        // Custody transaction ID from Tamam MPC Custody
  };
}

/**
 * DM-PAY-002: Payment Request
 *
 * Sent when a user requests money from another user.
 * The recipient sees a "Pay" button. When they pay, a follow-up
 * message updates the status to "paid".
 */
export interface PaymentRequestPayload {
  v: '1.0';
  type: 'payment_request';
  sender: string;               // Who is requesting money
  content: {
    action: 'request';
    amount: number;
    currency: string;
    note?: string;
    requestId: string;          // UUID — used to match request with fulfillment
    status: PaymentRequestStatus;
    paidTxHash?: string | null; // Filled in when status becomes "paid"
  };
}

/**
 * DM-PAY-003: Split Payment
 *
 * Created in group conversations. Each participant has a share.
 * As each participant pays, their status updates.
 * A completion message is sent when all have paid.
 *
 * Hedera transactions per split (N participants):
 * - 1x HCS for initial split request
 * - Nx (1 HTS transfer + 1 HCS confirmation) for each payment
 * - Example: 4-person split = up to 9 Hedera transactions
 */
export interface SplitPaymentPayload {
  v: '1.0';
  type: 'payment_split';
  sender: string;               // Who initiated the split
  content: {
    action: 'split';
    totalAmount: number;
    currency: string;
    note?: string;
    splitId: string;            // UUID — identifies this split
    splitMethod: SplitMethod;
    participants: Record<string, SplitParticipant>;
  };
}

export interface SplitParticipant {
  amount: number;
  status: PaymentRequestStatus;
  txHash?: string | null;
}

// --- API Request/Response Types for Payments ---

export interface SendMoneyRequest {
  topicId: string;
  recipientAccountId: string;
  amount: number;
  currency: string;
  note?: string;
}

export interface SendMoneyResponse {
  paymentId: string;
  status: PaymentStatus;
  htsTransactionId: string;
  hcsReceiptSequence: number;
  hcsTransactionId: string;
  custodyTxId: string;
  amount: number;
  currency: string;
}

export interface RequestMoneyRequest {
  topicId: string;
  amount: number;
  currency: string;
  note?: string;
}

export interface RequestMoneyResponse {
  requestId: string;
  status: PaymentRequestStatus;
  hcsSequenceNumber: number;
  transactionId: string;
}

export interface CreateSplitRequest {
  topicId: string;
  totalAmount: number;
  currency: string;
  note?: string;
  splitMethod: SplitMethod;
  participants: string[];       // Account IDs
}

export interface CreateSplitResponse {
  splitId: string;
  status: 'pending';
  shares: Record<string, { amount: number; status: PaymentRequestStatus }>;
  hcsSequenceNumber: number;
  transactionId: string;
}

export interface PaySplitResponse {
  paid: boolean;
  htsTransactionId: string;
  hcsSequenceNumber: number;
  remainingUnpaid: number;
}
```

### Step 6: Create Social types

Create `src/types/social.types.ts`:

```typescript
// =============================================================================
// SOCIAL FEED TYPES
// =============================================================================
// Types for public posts, social graph events (follow/unfollow), and feeds.
// Posts are plaintext HCS messages on a user's public feed topic.
// Social graph events are recorded on a platform-wide HCS topic.
// Reference: docs/SPECIFICATION.md Section 2.3, DM-SOCIAL-001, DM-SOCIAL-002
// =============================================================================

export type SocialAction = 'follow' | 'unfollow' | 'block';

/**
 * DM-SOCIAL-001: Public Post
 *
 * Submitted to the user's public feed HCS topic.
 * These are NOT encrypted — they are public and visible to anyone.
 */
export interface PublicPostPayload {
  v: '1.0';
  type: 'post';
  sender: string;               // Author's Account ID
  content: {
    text: string;               // Post text (max 800 chars)
    media?: PostMedia[];        // Up to 4 media items
  };
}

export interface PostMedia {
  type: 'image' | 'video';
  ref: string;                  // "ipfs://CID"
  mimeType: string;             // "image/jpeg", "video/mp4", etc.
  size: number;                 // File size in bytes
  dimensions?: string;          // "1920x1080"
  alt?: string;                 // Accessibility alt text
}

/**
 * DM-SOCIAL-002: Social Graph Event
 *
 * Submitted to the platform-wide social graph HCS topic.
 * These are plaintext — the social graph is public.
 * The platform indexes these in PostgreSQL for fast queries.
 */
export interface SocialGraphEvent {
  v: '1.0';
  type: SocialAction;
  actor: string;                // Who performed the action
  target: string;               // Who it was performed on
}

// --- API Response Types ---

export interface Post {
  id: string;
  author: {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null;
    kycVerified: boolean;
  };
  text: string;
  media: PostMedia[];
  hcsTopicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  transactionId: string;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FollowResponse {
  following: boolean;
  hcsSequenceNumber: number;
  transactionId: string;
}

export interface UserListItem {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  kycVerified: boolean;
  isFollowing?: boolean;        // Relative to the requesting user
}

export interface UserListResponse {
  users: UserListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}
```

### Step 7: Create Notification types

Create `src/types/notification.types.ts`:

```typescript
// =============================================================================
// NOTIFICATION TYPES
// =============================================================================
// Each user has a private HCS topic for notifications.
// The platform submits notification payloads to these topics.
// Notifications are also pushed via WebSocket for real-time delivery.
// Reference: docs/SPECIFICATION.md Section 2.5, DM-NOTIF-001
// =============================================================================

export type NotificationCategory = 'message' | 'payment' | 'social' | 'system';

export type NotificationEvent =
  | 'new_message'
  | 'payment_received'
  | 'payment_request'
  | 'new_follower'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'group_invite'
  | 'split_payment_request'
  | 'split_payment_complete';

/**
 * DM-NOTIF-001: Notification Payload
 *
 * Submitted to the user's private notification HCS topic.
 */
export interface NotificationPayload {
  v: '1.0';
  type: 'notification';
  category: NotificationCategory;
  data: {
    event: NotificationEvent;
    from?: string;              // Sender Account ID
    topicId?: string;           // Relevant conversation topic
    preview?: string;           // Short preview text (max 100 chars)
    amount?: number;            // For payment notifications
    currency?: string;          // For payment notifications
    ts: number;                 // Unix timestamp in milliseconds
  };
}

export interface Notification {
  id: string;
  category: NotificationCategory;
  event: NotificationEvent;
  from?: {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  topicId?: string;
  preview?: string;
  amount?: number;
  currency?: string;
  timestamp: string;
  read: boolean;
}

export interface NotificationListResponse {
  notifications: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}
```

### Step 8: Create Organization & Business types

Create `src/types/organization.types.ts`:

```typescript
// =============================================================================
// ORGANIZATION & BUSINESS TYPES
// =============================================================================
// Types for multi-member business organizations, RBAC, verified badges,
// payment requests, and transaction history.
// Reference: docs/SPECIFICATION.md Section 2.6, Section 4.2 (organizations tables)
// Reference: docs/PRD-BUSINESS-FEATURES.md
// =============================================================================

/** Organization member roles — ordered by permission level */
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

/** Badge tier derived from KYB status — never client-set */
export type BadgeTier = 'basic' | 'verified' | 'certified';

/** KYB status for organizations */
export type KybStatus = 'pending' | 'verified' | 'certified' | 'rejected';

/** Organization invitation status */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** Payment request status lifecycle */
export type PaymentRequestStatusExtended = 'pending' | 'paid' | 'expired' | 'declined';

/** Transaction direction for filtering */
export type TransactionDirection = 'sent' | 'received';

/** Transaction type for categorization */
export type TransactionType = 'send' | 'request_fulfillment' | 'split_payment';

// --- Organization ---

export interface Organization {
  id: string;
  ownerUserId: string;
  companyName: string;
  registrationNumber: string | null;
  businessCategory: string | null;
  website: string | null;
  businessHours: Record<string, string> | null;
  logoIpfsCid: string | null;
  hederaAccountId: string;
  broadcastTopicId: string | null;
  kybStatus: KybStatus;
  kybVerifiedAt: string | null;
  badgeTier: BadgeTier | null;
  hcsAttestationTopic: string | null;
  hcsAttestationSeq: number | null;
  maxMembers: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
  user?: {
    hederaAccountId: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface OrgInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

// --- Verified Badge ---

export interface VerifiedBadgeInfo {
  tier: BadgeTier;
  kybVerifiedAt: string | null;
  hcsAttestationTopic: string;
  hcsAttestationSeq: number | null;
}

// --- Payment Request ---

export interface PaymentRequest {
  id: string;
  requesterId: string;
  recipientId: string;
  conversationId: string;
  amount: number;
  currency: string;
  note: string | null;
  status: PaymentRequestStatusExtended;
  expiresAt: string;
  paidTxHash: string | null;
  paidAt: string | null;
  orgId: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Transaction History ---

export interface Transaction {
  id: string;
  senderId: string;
  recipientId: string;
  amount: number;
  currency: string;
  tokenId: string;
  type: TransactionType;
  htsTxHash: string;
  hcsReceiptSeq: number | null;
  hcsTopicId: string | null;
  custodyTxId: string;
  paymentRequestId: string | null;
  orgId: string | null;
  note: string | null;
  createdAt: string;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

// --- HCS Payloads ---

/**
 * DM-ORG-001: Organization Role Change
 * Submitted to the social graph HCS topic.
 */
export interface OrgRoleChangePayload {
  v: '1.0';
  type: 'org_role_change';
  orgId: string;
  actor: string;
  target: string;
  action: 'grant' | 'revoke' | 'change';
  role: OrgRole;
}

/**
 * DM-ORG-002: Organization Created
 * Submitted to the social graph HCS topic.
 */
export interface OrgCreatedPayload {
  v: '1.0';
  type: 'org_created';
  orgId: string;
  owner: string;
  companyName: string;
  hederaAccountId: string;
}

/**
 * DM-PAY-004: Payment Request Status Update
 * Submitted to the conversation HCS topic.
 */
export interface PaymentRequestStatusPayload {
  v: '1.0';
  type: 'payment_request_status';
  requestId: string;
  status: PaymentRequestStatusExtended;
  paidTxHash?: string;
  paidBy?: string;
}

// --- API Request/Response Types ---

export interface CreateOrgInvitationRequest {
  email: string;
  role: OrgRole;
}

export interface AcceptInvitationResponse {
  accepted: boolean;
  organizationId: string;
  role: OrgRole;
}

export interface UpdateOrgProfileRequest {
  companyName?: string;
  businessCategory?: string;
  website?: string;
  businessHours?: Record<string, string>;
  logo?: string; // Base64 image or IPFS CID
}

export interface UpdateMemberRoleRequest {
  role: OrgRole;
}

export interface CreatePaymentRequestRequest {
  topicId: string;
  recipientAccountId: string;
  amount: number;
  currency: string;
  note?: string;
  expiresInHours?: number; // Default 72
}

export interface CreatePaymentRequestResponse {
  requestId: string;
  status: 'pending';
  expiresAt: string;
  hcsSequenceNumber: number;
  transactionId: string;
}

export interface TransactionQueryParams {
  direction?: TransactionDirection;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  counterparty?: string;
  orgId?: string;
  limit?: number;
  cursor?: string;
}
```

### Step 9: Create API request/response types

Create `src/types/api.types.ts`:

```typescript
// =============================================================================
// API REQUEST / RESPONSE TYPES
// =============================================================================
// DTOs (Data Transfer Objects) for all REST API endpoints.
// Reference: docs/SPECIFICATION.md Section 5.2
// =============================================================================

// --- Auth ---

export interface RegisterRequest {
  method: 'email' | 'phone';
  value: string;                // email address or phone in E.164
}

export interface RegisterResponse {
  registrationId: string;
  otpSent: boolean;
  expiresAt: string;
}

export interface VerifyOtpRequest {
  registrationId: string;
  otp: string;
}

export interface VerifyOtpResponse {
  token: string;
  refreshToken: string;         // Set via httpOnly cookie
  user: {
    id: string;
    hederaAccountId: string;
    status: string;
    accountType: string | null;
  };
}

export interface KycSubmitRequest {
  accountType: 'individual' | 'business';
  fullName: string;
  dateOfBirth?: string;         // Individual only, YYYY-MM-DD
  nationality: string;          // ISO 3166-1 alpha-2
  // Files are sent as multipart/form-data:
  // idDocument: File
  // selfie: File
  // companyName?: string       // Business only
  // registrationNumber?: string
  // businessCategory?: string
  // companyDocument?: File
}

export interface KycStatusResponse {
  status: 'submitted' | 'approved' | 'rejected' | 'pending_review';
  kycLevel: string | null;
  rejectionReason: string | null;
  canResubmit: boolean;
  didNftSerial: number | null;
  didNftMetadataCid: string | null;
}

export interface ProfileUpdateRequest {
  displayName?: string;
  bio?: string;
  avatar?: string;              // Base64 image or IPFS CID
}

export interface ProfileUpdateResponse {
  updated: boolean;
  didNftSerial: number;
  hederaTransactions: HederaTransactionRef[];
}

// --- Messaging ---

export interface CreateConversationRequest {
  type: 'direct' | 'group';
  participants: string[];       // Hedera Account IDs
  groupName?: string;           // Required for group
  groupAvatar?: string;         // Optional, base64 or CID
}

export interface CreateConversationResponse {
  id: string;
  hcsTopicId: string;
  type: 'direct' | 'group';
  participants: Array<{
    accountId: string;
    displayName: string | null;
  }>;
  createdAt: string;
  hederaTransactions: HederaTransactionRef[];
}

export interface SendMessageRequest {
  encryptedPayload: string;     // Base64(AES-256-GCM ciphertext)
  nonce: string;                // Base64(96-bit nonce)
  keyId: string;                // UUID of the symmetric key used
}

export interface SendMessageResponse {
  sequenceNumber: number;
  consensusTimestamp: string;
  transactionId: string;
}

export interface AddMemberRequest {
  accountId: string;
}

export interface AddMemberResponse {
  added: boolean;
  keyRotated: boolean;
  hederaTransactions: HederaTransactionRef[];
}

// --- Social ---

export interface CreatePostRequest {
  text: string;
  media?: Array<{
    ipfsCid: string;
    mimeType: string;
    size: number;
    dimensions?: string;
    alt?: string;
  }>;
}

export interface CreatePostResponse {
  sequenceNumber: number;
  consensusTimestamp: string;
  transactionId: string;
  hcsTopicId: string;
}

// --- Common ---

export interface HederaTransactionRef {
  type: string;                 // "TopicCreate", "SubmitMessage", "TokenMint", etc.
  txId: string;                 // Hedera transaction ID
  note?: string;                // Optional context, e.g., "key_exchange"
}

export interface PaginatedRequest {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
  details?: Record<string, unknown>;
}

// --- WebSocket Events ---

export interface WsSubscribeEvent {
  topics: string[];
}

export interface WsTypingEvent {
  topicId: string;
}

export interface WsReadEvent {
  topicId: string;
  upToSeq: number;
}

export interface WsNewMessageEvent {
  topicId: string;
  data: {
    sequenceNumber: number;
    consensusTimestamp: string;
    senderAccountId: string;
    encryptedPayload: string;
    nonce: string;
    keyId: string;
    transactionId: string;
  };
}

export interface WsTypingIndicator {
  topicId: string;
  accountId: string;
}

export interface WsReadReceipt {
  topicId: string;
  accountId: string;
  upToSeq: number;
}

export interface WsPresenceEvent {
  accountId: string;
  status: 'online' | 'offline';
}

export interface WsPaymentEvent {
  topicId: string;
  data: Record<string, unknown>;                    // Payment receipt payload
}

export interface WsNotificationEvent {
  notification: Record<string, unknown>;            // Notification payload
}
```

### Step 10: Create constants

Create `src/constants/hedera.constants.ts`:

```typescript
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
```

Create `src/constants/errors.ts`:

```typescript
// =============================================================================
// ERROR CODES
// =============================================================================
// Standardized error codes returned by the API.
// Format: CATEGORY_SPECIFIC_ERROR
// =============================================================================

export enum ErrorCode {
  // Auth errors
  AUTH_INVALID_EMAIL = 'AUTH_INVALID_EMAIL',
  AUTH_INVALID_PHONE = 'AUTH_INVALID_PHONE',
  AUTH_DUPLICATE_ACCOUNT = 'AUTH_DUPLICATE_ACCOUNT',
  AUTH_INVALID_OTP = 'AUTH_INVALID_OTP',
  AUTH_OTP_EXPIRED = 'AUTH_OTP_EXPIRED',
  AUTH_OTP_MAX_ATTEMPTS = 'AUTH_OTP_MAX_ATTEMPTS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',

  // Identity errors
  IDENTITY_WALLET_CREATION_FAILED = 'IDENTITY_WALLET_CREATION_FAILED',
  IDENTITY_KYC_ALREADY_SUBMITTED = 'IDENTITY_KYC_ALREADY_SUBMITTED',
  IDENTITY_KYC_NOT_APPROVED = 'IDENTITY_KYC_NOT_APPROVED',
  IDENTITY_PROFILE_NOT_FOUND = 'IDENTITY_PROFILE_NOT_FOUND',
  IDENTITY_NFT_MINT_FAILED = 'IDENTITY_NFT_MINT_FAILED',

  // Messaging errors
  MSG_CONVERSATION_NOT_FOUND = 'MSG_CONVERSATION_NOT_FOUND',
  MSG_NOT_A_MEMBER = 'MSG_NOT_A_MEMBER',
  MSG_PAYLOAD_TOO_LARGE = 'MSG_PAYLOAD_TOO_LARGE',
  MSG_TOPIC_SUBMIT_FAILED = 'MSG_TOPIC_SUBMIT_FAILED',
  MSG_GROUP_MEMBER_LIMIT = 'MSG_GROUP_MEMBER_LIMIT',
  MSG_ALREADY_MEMBER = 'MSG_ALREADY_MEMBER',
  MSG_NOT_ADMIN = 'MSG_NOT_ADMIN',
  MSG_CANNOT_REMOVE_ADMIN = 'MSG_CANNOT_REMOVE_ADMIN',

  // Social errors
  SOCIAL_ALREADY_FOLLOWING = 'SOCIAL_ALREADY_FOLLOWING',
  SOCIAL_NOT_FOLLOWING = 'SOCIAL_NOT_FOLLOWING',
  SOCIAL_CANNOT_FOLLOW_SELF = 'SOCIAL_CANNOT_FOLLOW_SELF',
  SOCIAL_POST_TEXT_TOO_LONG = 'SOCIAL_POST_TEXT_TOO_LONG',
  SOCIAL_TOO_MANY_MEDIA = 'SOCIAL_TOO_MANY_MEDIA',

  // Payment errors
  PAY_INSUFFICIENT_BALANCE = 'PAY_INSUFFICIENT_BALANCE',
  PAY_RECIPIENT_NOT_FOUND = 'PAY_RECIPIENT_NOT_FOUND',
  PAY_TRANSFER_FAILED = 'PAY_TRANSFER_FAILED',
  PAY_REQUEST_NOT_FOUND = 'PAY_REQUEST_NOT_FOUND',
  PAY_REQUEST_EXPIRED = 'PAY_REQUEST_EXPIRED',
  PAY_SPLIT_NOT_FOUND = 'PAY_SPLIT_NOT_FOUND',
  PAY_ALREADY_PAID = 'PAY_ALREADY_PAID',
  PAY_TAMAM_ERROR = 'PAY_TAMAM_ERROR',

  // Organization errors
  ORG_NOT_FOUND = 'ORG_NOT_FOUND',
  ORG_PERMISSION_DENIED = 'ORG_PERMISSION_DENIED',
  ORG_MEMBER_LIMIT_REACHED = 'ORG_MEMBER_LIMIT_REACHED',
  ORG_ALREADY_MEMBER = 'ORG_ALREADY_MEMBER',
  ORG_INVITATION_EXPIRED = 'ORG_INVITATION_EXPIRED',
  ORG_INVITATION_NOT_FOUND = 'ORG_INVITATION_NOT_FOUND',
  ORG_CANNOT_REMOVE_OWNER = 'ORG_CANNOT_REMOVE_OWNER',
  ORG_KYB_NOT_APPROVED = 'ORG_KYB_NOT_APPROVED',

  // Hedera errors
  HEDERA_TOPIC_CREATE_FAILED = 'HEDERA_TOPIC_CREATE_FAILED',
  HEDERA_MESSAGE_SUBMIT_FAILED = 'HEDERA_MESSAGE_SUBMIT_FAILED',
  HEDERA_MIRROR_NODE_ERROR = 'HEDERA_MIRROR_NODE_ERROR',
  HEDERA_TRANSACTION_FAILED = 'HEDERA_TRANSACTION_FAILED',

  // Generic
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
}
```

### Step 11: Create utility functions

Create `src/utils/validation.ts`:

```typescript
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
```

Create `src/utils/format.ts`:

```typescript
// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/** Truncate Account ID for display: "0.0.12345" → "0.0.123...45" */
export function truncateAccountId(accountId: string, maxLength = 12): string {
  if (accountId.length <= maxLength) return accountId;
  const prefix = accountId.slice(0, 8);
  const suffix = accountId.slice(-4);
  return `${prefix}...${suffix}`;
}

/** Format HBAR amount: 100000000 tinybars → "1.00 HBAR" */
export function formatHbar(tinybars: number): string {
  return `${(tinybars / 100_000_000).toFixed(2)} HBAR`;
}

/** Format currency amount: 50.00, "USD" → "$50.00" */
export function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    AED: 'AED ',
    EUR: '€',
    GBP: '£',
    HBAR: 'ℏ',
  };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/** Build HashScan URL for a transaction */
export function hashScanTxUrl(txId: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return `https://hashscan.io/${network}/transaction/${txId}`;
}

/** Build HashScan URL for an account */
export function hashScanAccountUrl(accountId: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return `https://hashscan.io/${network}/account/${accountId}`;
}

/** Build HashScan URL for an NFT */
export function hashScanNftUrl(tokenId: string, serial: number, network: 'testnet' | 'mainnet' = 'testnet'): string {
  return `https://hashscan.io/${network}/token/${tokenId}/${serial}`;
}

/** Build IPFS gateway URL from CID */
export function ipfsUrl(cid: string, gatewayBase = 'https://gateway.pinata.cloud/ipfs'): string {
  // Remove ipfs:// prefix if present
  const cleanCid = cid.replace(/^ipfs:\/\//, '');
  return `${gatewayBase}/${cleanCid}`;
}
```

### Step 12: Create the barrel export

Replace `src/index.ts` with:

```typescript
// Types
export * from './types/user.types';
export * from './types/message.types';
export * from './types/payment.types';
export * from './types/social.types';
export * from './types/notification.types';
export * from './types/organization.types';
export * from './types/api.types';

// Constants
export * from './constants/hedera.constants';
export * from './constants/errors';

// Utils
export * from './utils/validation';
export * from './utils/format';
```

### Step 13: Build and verify

```bash
cd packages/shared
pnpm build
```

Expected: `dist/` folder created with `.js` and `.d.ts` files, no errors.

Check that types are importable:

```bash
# Quick check — this should not produce errors
npx tsc --noEmit
```

---

## Verification Steps

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Package builds | `cd packages/shared && pnpm build` — no errors |
| 2 | Types compile | `npx tsc --noEmit` — no errors |
| 3 | All type files exist | `ls src/types/` — shows 7 files |
| 4 | All constant files exist | `ls src/constants/` — shows 2 files |
| 5 | All util files exist | `ls src/utils/` — shows 2 files |
| 6 | Barrel export works | `index.ts` exports everything |
| 7 | No circular imports | Build succeeds without warnings |

---

## Definition of Done

- [ ] `pnpm build` succeeds in `packages/shared`
- [ ] 7 type files created matching all data models from docs/SPECIFICATION.md Section 4 (including `organization.types.ts`)
- [ ] All API DTOs from Section 5 are typed in `api.types.ts`
- [ ] All HCS payload types match the JSON schemas in the spec exactly
- [ ] Constants file has all Hedera cost values and application limits
- [ ] Error codes cover all error scenarios in the spec
- [ ] Validation utilities cover email, phone, Account ID, Topic ID
- [ ] Format utilities cover currency, HBAR, HashScan URLs, IPFS URLs
- [ ] Barrel export re-exports everything from `src/index.ts`
- [ ] No TypeScript errors

---

## Files Created

```
packages/shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types/
│   │   ├── user.types.ts
│   │   ├── message.types.ts
│   │   ├── payment.types.ts
│   │   ├── social.types.ts
│   │   ├── notification.types.ts
│   │   ├── organization.types.ts
│   │   └── api.types.ts
│   ├── constants/
│   │   ├── hedera.constants.ts
│   │   └── errors.ts
│   └── utils/
│       ├── validation.ts
│       └── format.ts
└── dist/                   (generated by build)
```
