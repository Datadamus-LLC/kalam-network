import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported currencies for the payment system.
 * Must match PAYMENT_CONSTANTS.SUPPORTED_CURRENCIES in the backend.
 */
export type PaymentCurrency = 'TMUSD';

/**
 * Direction of a transaction relative to the current user.
 */
export type TransactionDirection = 'sent' | 'received';

/**
 * Status of a transaction.
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed';

/**
 * Type of payment.
 */
export type PaymentType = 'send' | 'request_fulfillment' | 'split_payment';

/**
 * A single transaction record from the payment history API.
 */
export interface TransactionRecord {
  id: string;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description: string | null;
  counterpartyId: string;
  counterpartyName?: string | null;
  hederaTxId: string | null;
  paymentType: PaymentType;
  createdAt: string;
  completedAt: string | null;
}

/**
 * A payment request record.
 */
export interface PaymentRequestRecord {
  id: string;
  requesterUserId: string;
  conversationId: string | null;
  hcsTopicId: string;
  amount: number;
  currency: string;
  description: string | null;
  status: 'pending' | 'paid' | 'expired' | 'declined';
  paidTxId: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/**
 * A split payment response from the backend.
 */
export interface SplitPaymentRecord {
  requestIds: string[];
  topicId: string;
  totalAmount: number;
  currency: string;
  splitMethod: 'equal' | 'custom';
  participantCount: number;
  hcsSequenceNumber: string | null;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface PaymentState {
  // Balance
  balance: number;
  balanceTimestamp: string | null;
  accountId: string | null;

  // History
  paymentHistory: TransactionRecord[];
  historyNextCursor: string | null;
  historyHasMore: boolean;

  // Pending requests
  pendingRequests: PaymentRequestRecord[];

  // Loading / error
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  // Actions — balance
  fetchBalance: () => Promise<void>;
  setBalance: (balance: number) => void;
  updateBalance: (newBalance: number) => void;

  // Actions — history
  fetchPaymentHistory: (cursor?: string, limit?: number) => Promise<void>;
  fetchTransactions: (params?: {
    direction?: 'sent' | 'received' | 'all';
    status?: 'completed' | 'pending' | 'failed';
    from?: string;
    to?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }) => Promise<void>;
  addPaymentToHistory: (payment: TransactionRecord) => void;
  updatePaymentStatus: (paymentId: string, status: TransactionStatus) => void;

  // Actions — send/request/split
  sendPayment: (
    recipientAccountId: string,
    amount: number,
    currency: string,
    topicId: string,
    note?: string,
  ) => Promise<TransactionRecord>;
  requestMoney: (
    amount: number,
    currency: string,
    topicId: string,
    description?: string,
  ) => Promise<PaymentRequestRecord>;
  payRequest: (requestId: string, topicId: string) => Promise<void>;
  createSplitPayment: (
    totalAmount: number,
    currency: string,
    splitMethod: 'equal' | 'custom',
    participantAccountIds: string[],
    topicId: string,
    note?: string,
    customAmounts?: Record<string, number>,
  ) => Promise<SplitPaymentRecord>;
  fetchPaymentRequest: (requestId: string) => Promise<PaymentRequestRecord>;

  // Actions — decline
  declineRequest: (requestId: string, reason?: string) => Promise<void>;

  // Actions — list requests
  fetchPaymentRequestsByConversation: (conversationId: string) => Promise<PaymentRequestRecord[]>;

  // Actions — update request in store
  updatePaymentRequestStatus: (
    requestId: string,
    status: PaymentRequestRecord['status'],
    paidTxId?: string | null,
  ) => void;

  // Actions — pending requests
  fetchPendingRequests: () => Promise<void>;

  // Actions — balance staleness
  isBalanceStale: () => boolean;

  // Actions — error
  clearError: () => void;

  // Reset
  reset: () => void;
}

// ---------------------------------------------------------------------------
// API response wrappers (matching backend ApiResponse<T> envelope)
// ---------------------------------------------------------------------------

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  balance: 0,
  balanceTimestamp: null as string | null,
  accountId: null as string | null,
  paymentHistory: [] as TransactionRecord[],
  historyNextCursor: null as string | null,
  historyHasMore: true,
  pendingRequests: [] as PaymentRequestRecord[],
  isLoading: false,
  isSending: false,
  error: null as string | null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePaymentStore = create<PaymentState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ─── Balance ────────────────────────────────────────────────────────

      fetchBalance: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await api.getBalance();
          set({
            balance: data.tmUsdBalance ?? data.hbarBalance,
            balanceTimestamp: data.timestamp,
            accountId: data.accountId,
            isLoading: false,
          });
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to fetch balance';
          set({ error: message, isLoading: false });
        }
      },

      setBalance: (balance: number) => set({ balance }),

      updateBalance: (newBalance: number) => set({ balance: newBalance }),

      // ─── History ────────────────────────────────────────────────────────

      fetchPaymentHistory: async (cursor?: string, limit = 20) => {
        set({ isLoading: true, error: null });
        try {
          const raw = await api.getPaymentHistoryFull(limit, cursor);
          const data = raw as {
            transactions: TransactionRecord[];
            cursor: string | null;
            hasMore: boolean;
          };

          set((state) => ({
            paymentHistory: cursor
              ? [...state.paymentHistory, ...(data.transactions ?? [])]
              : (data.transactions ?? []),
            historyNextCursor: data.cursor,
            historyHasMore: data.hasMore,
            isLoading: false,
          }));
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to fetch payment history';
          set({ error: message, isLoading: false });
        }
      },

      fetchTransactions: async (params?: {
        direction?: 'sent' | 'received' | 'all';
        status?: 'completed' | 'pending' | 'failed';
        from?: string;
        to?: string;
        search?: string;
        cursor?: string;
        limit?: number;
      }) => {
        set({ isLoading: true, error: null });
        try {
          const raw = await api.queryTransactions(params);
          const data = raw as {
            transactions: TransactionRecord[];
            cursor: string | null;
            hasMore: boolean;
          };

          set((state) => ({
            paymentHistory: params?.cursor
              ? [...state.paymentHistory, ...(data.transactions ?? [])]
              : (data.transactions ?? []),
            historyNextCursor: data.cursor,
            historyHasMore: data.hasMore,
            isLoading: false,
          }));
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to fetch transactions';
          set({ error: message, isLoading: false });
        }
      },

      addPaymentToHistory: (payment: TransactionRecord) => {
        set((state) => ({
          paymentHistory: [payment, ...state.paymentHistory],
        }));
      },

      updatePaymentStatus: (
        paymentId: string,
        status: TransactionStatus,
      ) => {
        set((state) => ({
          paymentHistory: state.paymentHistory.map((p) =>
            p.id === paymentId ? { ...p, status } : p,
          ),
        }));
      },

      // ─── Send Payment ──────────────────────────────────────────────────

      sendPayment: async (
        recipientAccountId: string,
        amount: number,
        currency: string,
        topicId: string,
        note?: string,
      ): Promise<TransactionRecord> => {
        set({ isSending: true, error: null });
        try {
          const envelope = await api.sendPaymentFull(
            topicId,
            recipientAccountId,
            amount,
            currency,
            note,
          );
          const data = envelope as {
            id: string;
            senderAccountId: string;
            recipientAccountId: string;
            amount: number;
            currency: string;
            paymentType: PaymentType;
            status: string;
            hederaTxId: string | null;
            createdAt: string;
          };

          const record: TransactionRecord = {
            id: data.id,
            direction: 'sent',
            amount: data.amount,
            currency: data.currency,
            status: 'completed',
            description: note ?? null,
            counterpartyId: data.recipientAccountId,
            hederaTxId: data.hederaTxId,
            paymentType: data.paymentType,
            createdAt: data.createdAt,
            completedAt: data.createdAt,
          };

          set((state) => ({
            paymentHistory: [record, ...state.paymentHistory],
            balance: state.balance - amount,
            isSending: false,
          }));

          return record;
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Payment failed';
          set({ error: `Payment failed: ${message}`, isSending: false });
          throw err;
        }
      },

      // ─── Request Money ─────────────────────────────────────────────────

      requestMoney: async (
        amount: number,
        currency: string,
        topicId: string,
        description?: string,
      ): Promise<PaymentRequestRecord> => {
        set({ isSending: true, error: null });
        try {
          const envelope = await api.requestPaymentFull(
            topicId,
            amount,
            currency,
            description,
          );
          const data = envelope as PaymentRequestRecord;

          set((state) => ({
            pendingRequests: [data, ...state.pendingRequests],
            isSending: false,
          }));

          return data;
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Request failed';
          set({ error: `Request failed: ${message}`, isSending: false });
          throw err;
        }
      },

      // ─── Pay Request ───────────────────────────────────────────────────

      payRequest: async (requestId: string, topicId: string) => {
        set({ isSending: true, error: null });
        try {
          await api.fulfillPaymentRequest(requestId, topicId);

          set((state) => ({
            pendingRequests: state.pendingRequests.filter(
              (r) => r.id !== requestId,
            ),
            isSending: false,
          }));

          // Refresh balance after paying
          void get().fetchBalance();
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to pay request';
          set({ error: `Failed to pay request: ${message}`, isSending: false });
          throw err;
        }
      },

      // ─── Split Payment ─────────────────────────────────────────────────

      createSplitPayment: async (
        totalAmount: number,
        currency: string,
        splitMethod: 'equal' | 'custom',
        participantAccountIds: string[],
        topicId: string,
        note?: string,
        customAmounts?: Record<string, number>,
      ): Promise<SplitPaymentRecord> => {
        set({ isSending: true, error: null });
        try {
          const envelope = await api.createSplitPayment(
            topicId,
            totalAmount,
            currency,
            splitMethod,
            participantAccountIds,
            note,
            customAmounts,
          );
          const data = envelope as SplitPaymentRecord;

          set({ isSending: false });
          return data;
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to create split payment';
          set({
            error: `Failed to create split: ${message}`,
            isSending: false,
          });
          throw err;
        }
      },

      // ─── Fetch Payment Request ─────────────────────────────────────────

      fetchPaymentRequest: async (
        requestId: string,
      ): Promise<PaymentRequestRecord> => {
        return await api.getPaymentRequest(requestId) as PaymentRequestRecord;
      },

      // ─── Decline Request ──────────────────────────────────────────

      declineRequest: async (requestId: string, reason?: string) => {
        set({ isSending: true, error: null });
        try {
          await api.declinePaymentRequest(requestId, reason);

          set((state) => ({
            pendingRequests: state.pendingRequests.map((r) =>
              r.id === requestId ? { ...r, status: 'declined' as const } : r,
            ),
            isSending: false,
          }));
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to decline request';
          set({ error: `Failed to decline request: ${message}`, isSending: false });
          throw err;
        }
      },

      // ─── List Requests by Conversation ──────────────────────────────

      fetchPaymentRequestsByConversation: async (
        conversationId: string,
      ): Promise<PaymentRequestRecord[]> => {
        try {
          const data = await api.getPaymentRequests({ conversationId }) as {
            requests: PaymentRequestRecord[];
            cursor: string | null;
            hasMore: boolean;
          };

          return data.requests ?? [];
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to fetch payment requests';
          set({ error: message });
          return [];
        }
      },

      // ─── Update Payment Request Status ──────────────────────────────

      updatePaymentRequestStatus: (
        requestId: string,
        status: PaymentRequestRecord['status'],
        paidTxId?: string | null,
      ) => {
        set((state) => ({
          pendingRequests: state.pendingRequests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status,
                  paidTxId: paidTxId ?? r.paidTxId,
                  paidAt: status === 'paid' ? new Date().toISOString() : r.paidAt,
                }
              : r,
          ),
        }));
      },

      // ─── Pending Requests ──────────────────────────────────────────────

      fetchPendingRequests: async () => {
        try {
          const data = await api.getPaymentHistoryFull(100) as {
            transactions: TransactionRecord[];
            cursor: string | null;
            hasMore: boolean;
          };

          const pending = (data.transactions ?? []).filter(
            (tx) => tx.status === 'pending',
          );

          set({
            pendingRequests: pending.map((tx) => ({
              id: tx.id,
              requesterUserId: tx.counterpartyId,
              conversationId: null,
              hcsTopicId: '',
              amount: tx.amount,
              currency: tx.currency,
              description: tx.description,
              status: 'pending' as const,
              paidTxId: null,
              paidAt: null,
              expiresAt: '',
              createdAt: tx.createdAt,
            })),
          });
        } catch (err: unknown) {
          // Background fetch — non-critical, only update error state
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to fetch pending requests';
          set({ error: message });
        }
      },

      // ─── Balance Staleness ─────────────────────────────────────────────

      isBalanceStale: () => {
        const { balanceTimestamp } = get();
        if (!balanceTimestamp) return true;
        const ageMs = Date.now() - new Date(balanceTimestamp).getTime();
        return ageMs > 5 * 60 * 1000; // stale after 5 minutes
      },

      // ─── Error ─────────────────────────────────────────────────────────

      clearError: () => set({ error: null }),

      // ─── Reset ─────────────────────────────────────────────────────────

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'hedera-social-payments',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        balance: state.balance,
        balanceTimestamp: state.balanceTimestamp,
        accountId: state.accountId,
      }),
    },
  ),
);
