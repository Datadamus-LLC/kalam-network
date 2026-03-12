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
