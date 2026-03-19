export type PaymentStatus = 'confirmed' | 'failed';
export type PaymentRequestStatus = 'pending' | 'paid' | 'expired' | 'declined';
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
        currency: string;
        tokenId: string;
        recipient: string;
        note?: string;
        txHash: string;
        status: PaymentStatus;
        custodyTxId: string;
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
    sender: string;
    content: {
        action: 'request';
        amount: number;
        currency: string;
        note?: string;
        requestId: string;
        status: PaymentRequestStatus;
        paidTxHash?: string | null;
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
    sender: string;
    content: {
        action: 'split';
        totalAmount: number;
        currency: string;
        note?: string;
        splitId: string;
        splitMethod: SplitMethod;
        participants: Record<string, SplitParticipant>;
    };
}
export interface SplitParticipant {
    amount: number;
    status: PaymentRequestStatus;
    txHash?: string | null;
}
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
    participants: string[];
}
export interface CreateSplitResponse {
    splitId: string;
    status: 'pending';
    shares: Record<string, {
        amount: number;
        status: PaymentRequestStatus;
    }>;
    hcsSequenceNumber: number;
    transactionId: string;
}
export interface PaySplitResponse {
    paid: boolean;
    htsTransactionId: string;
    hcsSequenceNumber: number;
    remainingUnpaid: number;
}
/**
 * DM-PAY-004: Payment Request Status Update
 *
 * Submitted to the conversation HCS topic when a payment request
 * status changes (paid, declined, expired).
 */
export interface PaymentRequestUpdatePayload {
    v: '1.0';
    type: 'payment_request_update';
    requestId: string;
    status: PaymentRequestStatus;
    paidTxId?: string | null;
    paidAt?: string | null;
    declineReason?: string | null;
    updatedBy: string;
}
/**
 * Full payment request record as returned by the enhanced payments API.
 * Named EnhancedPaymentRequest to avoid collision with the simpler
 * PaymentRequest interface in organization.types.ts.
 */
export interface EnhancedPaymentRequest {
    id: string;
    requesterUserId: string;
    organizationId: string | null;
    conversationId: string | null;
    hcsTopicId: string;
    hcsSequenceNumber: number | null;
    amount: number;
    currency: string;
    description: string | null;
    status: PaymentRequestStatus;
    paidTxId: string | null;
    paidAt: string | null;
    expiresAt: string;
    createdAt: string;
}
/**
 * Payload for creating a payment request via the API.
 */
export interface CreatePaymentRequestPayload {
    topicId: string;
    amount: number;
    currency: string;
    description?: string;
    expiresAt?: string;
}
/**
 * Payload for declining a payment request via the API.
 */
export interface DeclinePaymentRequestPayload {
    reason?: string;
}
/**
 * Query parameters for listing payment requests.
 */
export interface PaymentRequestQueryParams {
    conversationId?: string;
    status?: PaymentRequestStatus;
    limit?: number;
    cursor?: string;
}
/**
 * Response for a paginated list of payment requests.
 */
export interface PaginatedPaymentRequestsResponse {
    requests: PaymentRequest[];
    cursor: string | null;
    hasMore: boolean;
}
//# sourceMappingURL=payment.types.d.ts.map