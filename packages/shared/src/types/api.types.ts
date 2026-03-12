// =============================================================================
// API REQUEST / RESPONSE TYPES
// =============================================================================
// DTOs (Data Transfer Objects) for all REST API endpoints.
// Reference: docs/SPECIFICATION.md Section 5.2
// =============================================================================

import type { UserStatus } from './user.types';
import type { AccountType, KycLevel } from './user.types';

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
    status: UserStatus;
    accountType: AccountType | null;
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
  kycLevel: KycLevel | null;
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
