/**
 * Response shape for a payment transaction returned from the API.
 */
export interface PaymentResponse {
  id: string;
  senderAccountId: string;
  recipientAccountId: string;
  amount: number;
  currency: string;
  paymentType: "send" | "request_fulfillment" | "split_payment";
  status: "confirmed" | "failed";
  hederaTxId: string | null;
  hcsTopicId: string | null;
  hcsSequenceNumber: number | null;
  tamamReference: string | null;
  createdAt: string; // ISO 8601
}

/**
 * Response shape for a payment request.
 */
export interface PaymentRequestResponse {
  id: string;
  requesterUserId: string;
  organizationId: string | null;
  conversationId: string | null;
  hcsTopicId: string;
  hcsSequenceNumber: number | null;
  amount: number;
  currency: string;
  description: string | null;
  status: "pending" | "paid" | "expired" | "declined" | "cancelled";
  paidTxId: string | null;
  paidAt: string | null; // ISO 8601
  expiresAt: string; // ISO 8601
  createdAt: string; // ISO 8601
}

/**
 * Response shape for a transaction record.
 */
export interface TransactionResponse {
  id: string;
  direction: "sent" | "received";
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed";
  description: string | null;
  counterpartyId: string;
  counterpartyName: string | null;
  hederaTxId: string | null;
  paymentType: "send" | "request_fulfillment" | "split_payment";
  createdAt: string; // ISO 8601
  completedAt: string | null; // ISO 8601
}

/**
 * Response shape for paginated payment history.
 */
export interface PaginatedPaymentHistoryResponse {
  transactions: TransactionResponse[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Response shape for account balance.
 */
export interface BalanceResponse {
  accountId: string;
  hbarBalance: number;
  tmUsdBalance: number;
  timestamp: string; // ISO 8601
}

/**
 * Detailed transaction response including on-chain proof links.
 */
export interface TransactionDetailResponse extends TransactionResponse {
  conversationId: string | null;
  organizationId: string | null;
  paymentRequestId: string | null;
  hcsMessageSeq: number | null;
  tamamTxRef: string | null;
  onChainProof: {
    hcsExplorerUrl: string | null;
    htsExplorerUrl: string | null;
  };
  counterpartyProfile: {
    displayName: string | null;
    avatarUrl: string | null;
    hederaAccountId: string;
  } | null;
}

/**
 * Response shape for a split payment request.
 */
export interface SplitPaymentResponse {
  requestIds: string[];
  topicId: string | null;
  totalAmount: number;
  currency: string;
  splitMethod: "equal" | "custom";
  participantCount: number;
  hcsSequenceNumber: string | null;
}
