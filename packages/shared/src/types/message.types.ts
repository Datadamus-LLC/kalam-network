import type { BadgeTier } from './organization.types';

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
  /** Verified business badge tier — null for individual accounts */
  badgeTier: BadgeTier | null;
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
