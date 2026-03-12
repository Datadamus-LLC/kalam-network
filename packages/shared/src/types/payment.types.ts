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
