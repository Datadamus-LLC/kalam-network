/**
 * Payment Store — Unit Tests
 *
 * Tests the Zustand payment store's pure state management methods.
 * Methods that call `api.*` (fetchBalance, sendPayment, etc.) CANNOT be
 * tested without mocking, so they are excluded per project rules.
 *
 * Tested: setBalance, updateBalance, addPaymentToHistory, updatePaymentStatus,
 *         updatePaymentRequestStatus, clearError, reset.
 */
import {
  usePaymentStore,
  type TransactionRecord,
  type PaymentRequestRecord,
} from '../src/stores/payment.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(): string {
  idCounter++;
  return `pay-id-${idCounter}`;
}

function makeTransaction(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: overrides.id ?? nextId(),
    direction: overrides.direction ?? 'sent',
    amount: overrides.amount ?? 100,
    currency: overrides.currency ?? 'HBAR',
    status: overrides.status ?? 'completed',
    description: overrides.description ?? null,
    counterpartyId: overrides.counterpartyId ?? '0.0.99999',
    hederaTxId: overrides.hederaTxId ?? null,
    paymentType: overrides.paymentType ?? 'send',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt ?? null,
  };
}

function makePaymentRequest(
  overrides: Partial<PaymentRequestRecord> = {},
): PaymentRequestRecord {
  return {
    id: overrides.id ?? nextId(),
    requesterUserId: overrides.requesterUserId ?? 'user-123',
    conversationId: overrides.conversationId ?? null,
    hcsTopicId: overrides.hcsTopicId ?? '0.0.55555',
    amount: overrides.amount ?? 50,
    currency: overrides.currency ?? 'HBAR',
    description: overrides.description ?? null,
    status: overrides.status ?? 'pending',
    paidTxId: overrides.paidTxId ?? null,
    paidAt: overrides.paidAt ?? null,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86400000).toISOString(),
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Payment Store (Zustand)', () => {
  beforeEach(() => {
    usePaymentStore.getState().reset();
  });

  describe('initial state', () => {
    it('should start with balance 0', () => {
      expect(usePaymentStore.getState().balance).toBe(0);
    });

    it('should start with isLoading false', () => {
      expect(usePaymentStore.getState().isLoading).toBe(false);
    });

    it('should start with isSending false', () => {
      expect(usePaymentStore.getState().isSending).toBe(false);
    });

    it('should start with error null', () => {
      expect(usePaymentStore.getState().error).toBeNull();
    });

    it('should start with empty paymentHistory', () => {
      expect(usePaymentStore.getState().paymentHistory).toEqual([]);
    });

    it('should start with empty pendingRequests', () => {
      expect(usePaymentStore.getState().pendingRequests).toEqual([]);
    });

    it('should start with balanceTimestamp null', () => {
      expect(usePaymentStore.getState().balanceTimestamp).toBeNull();
    });

    it('should start with accountId null', () => {
      expect(usePaymentStore.getState().accountId).toBeNull();
    });

    it('should start with historyHasMore true', () => {
      expect(usePaymentStore.getState().historyHasMore).toBe(true);
    });

    it('should start with historyNextCursor null', () => {
      expect(usePaymentStore.getState().historyNextCursor).toBeNull();
    });
  });

  describe('setBalance', () => {
    it('should set balance to a positive value', () => {
      usePaymentStore.getState().setBalance(1500);
      expect(usePaymentStore.getState().balance).toBe(1500);
    });

    it('should set balance to zero', () => {
      usePaymentStore.getState().setBalance(1500);
      usePaymentStore.getState().setBalance(0);
      expect(usePaymentStore.getState().balance).toBe(0);
    });

    it('should set balance to a decimal value', () => {
      usePaymentStore.getState().setBalance(99.75);
      expect(usePaymentStore.getState().balance).toBe(99.75);
    });
  });

  describe('updateBalance', () => {
    it('should update balance to a new value', () => {
      usePaymentStore.getState().setBalance(500);
      usePaymentStore.getState().updateBalance(750);
      expect(usePaymentStore.getState().balance).toBe(750);
    });

    it('should allow updating from zero', () => {
      usePaymentStore.getState().updateBalance(200);
      expect(usePaymentStore.getState().balance).toBe(200);
    });
  });

  describe('addPaymentToHistory', () => {
    it('should prepend a transaction to paymentHistory', () => {
      const tx1 = makeTransaction({ id: 'tx-1', amount: 100 });
      const tx2 = makeTransaction({ id: 'tx-2', amount: 200 });

      usePaymentStore.getState().addPaymentToHistory(tx1);
      usePaymentStore.getState().addPaymentToHistory(tx2);

      const history = usePaymentStore.getState().paymentHistory;
      expect(history).toHaveLength(2);
      // tx2 prepended (most recent first)
      expect(history[0].id).toBe('tx-2');
      expect(history[1].id).toBe('tx-1');
    });

    it('should preserve existing transaction records', () => {
      const existing = makeTransaction({ id: 'old', amount: 50 });
      usePaymentStore.getState().addPaymentToHistory(existing);

      const newTx = makeTransaction({ id: 'new', amount: 150 });
      usePaymentStore.getState().addPaymentToHistory(newTx);

      const history = usePaymentStore.getState().paymentHistory;
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('new');
      expect(history[1].id).toBe('old');
      expect(history[1].amount).toBe(50);
    });

    it('should preserve all transaction fields', () => {
      const tx = makeTransaction({
        id: 'detailed-tx',
        direction: 'received',
        amount: 999,
        currency: 'USDC',
        status: 'completed',
        description: 'Dinner split',
        counterpartyId: '0.0.11111',
        hederaTxId: '0.0.5678@1234567890.123456789',
        paymentType: 'split_payment',
        createdAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:00:05Z',
      });

      usePaymentStore.getState().addPaymentToHistory(tx);

      const stored = usePaymentStore.getState().paymentHistory[0];
      expect(stored.direction).toBe('received');
      expect(stored.amount).toBe(999);
      expect(stored.currency).toBe('USDC');
      expect(stored.status).toBe('completed');
      expect(stored.description).toBe('Dinner split');
      expect(stored.counterpartyId).toBe('0.0.11111');
      expect(stored.hederaTxId).toBe('0.0.5678@1234567890.123456789');
      expect(stored.paymentType).toBe('split_payment');
      expect(stored.completedAt).toBe('2026-01-15T10:00:05Z');
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update the status of a specific transaction', () => {
      const tx = makeTransaction({ id: 'tx-pending', status: 'pending' });
      usePaymentStore.getState().addPaymentToHistory(tx);

      usePaymentStore.getState().updatePaymentStatus('tx-pending', 'completed');

      const updated = usePaymentStore.getState().paymentHistory[0];
      expect(updated.id).toBe('tx-pending');
      expect(updated.status).toBe('completed');
    });

    it('should update status to failed', () => {
      const tx = makeTransaction({ id: 'tx-1', status: 'pending' });
      usePaymentStore.getState().addPaymentToHistory(tx);

      usePaymentStore.getState().updatePaymentStatus('tx-1', 'failed');

      expect(usePaymentStore.getState().paymentHistory[0].status).toBe('failed');
    });

    it('should not modify other transactions', () => {
      const tx1 = makeTransaction({ id: 'tx-1', status: 'pending', amount: 100 });
      const tx2 = makeTransaction({ id: 'tx-2', status: 'pending', amount: 200 });
      usePaymentStore.getState().addPaymentToHistory(tx1);
      usePaymentStore.getState().addPaymentToHistory(tx2);

      usePaymentStore.getState().updatePaymentStatus('tx-1', 'completed');

      const history = usePaymentStore.getState().paymentHistory;
      // tx2 is at index 0 (prepended last), tx1 at index 1
      expect(history[1].id).toBe('tx-1');
      expect(history[1].status).toBe('completed');
      expect(history[0].id).toBe('tx-2');
      expect(history[0].status).toBe('pending');
    });

    it('should be a no-op when paymentId does not exist', () => {
      const tx = makeTransaction({ id: 'tx-1', status: 'pending' });
      usePaymentStore.getState().addPaymentToHistory(tx);

      usePaymentStore.getState().updatePaymentStatus('nonexistent', 'completed');

      // Original unchanged
      expect(usePaymentStore.getState().paymentHistory[0].status).toBe('pending');
    });
  });

  describe('updatePaymentRequestStatus', () => {
    it('should update the status of a specific payment request', () => {
      const req = makePaymentRequest({ id: 'req-1', status: 'pending' });
      usePaymentStore.setState({ pendingRequests: [req] });

      usePaymentStore.getState().updatePaymentRequestStatus('req-1', 'declined');

      const updated = usePaymentStore.getState().pendingRequests[0];
      expect(updated.status).toBe('declined');
    });

    it('should set paidTxId when provided', () => {
      const req = makePaymentRequest({ id: 'req-1', status: 'pending' });
      usePaymentStore.setState({ pendingRequests: [req] });

      usePaymentStore.getState().updatePaymentRequestStatus(
        'req-1',
        'paid',
        '0.0.1234@9876543210.000000000',
      );

      const updated = usePaymentStore.getState().pendingRequests[0];
      expect(updated.status).toBe('paid');
      expect(updated.paidTxId).toBe('0.0.1234@9876543210.000000000');
    });

    it('should set paidAt when status is "paid"', () => {
      const req = makePaymentRequest({ id: 'req-1', status: 'pending' });
      usePaymentStore.setState({ pendingRequests: [req] });

      const beforeUpdate = new Date();
      usePaymentStore.getState().updatePaymentRequestStatus('req-1', 'paid', 'tx-id');
      const afterUpdate = new Date();

      const updated = usePaymentStore.getState().pendingRequests[0];
      expect(updated.paidAt).not.toBeNull();

      // Verify paidAt is a valid ISO date within the test window
      const paidAtDate = new Date(updated.paidAt as string);
      expect(paidAtDate.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(paidAtDate.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    it('should NOT set paidAt for non-paid statuses', () => {
      const req = makePaymentRequest({ id: 'req-1', status: 'pending', paidAt: null });
      usePaymentStore.setState({ pendingRequests: [req] });

      usePaymentStore.getState().updatePaymentRequestStatus('req-1', 'expired');

      const updated = usePaymentStore.getState().pendingRequests[0];
      expect(updated.paidAt).toBeNull();
    });

    it('should preserve paidTxId when not provided in update', () => {
      const req = makePaymentRequest({
        id: 'req-1',
        status: 'pending',
        paidTxId: 'existing-tx',
      });
      usePaymentStore.setState({ pendingRequests: [req] });

      usePaymentStore.getState().updatePaymentRequestStatus('req-1', 'declined');

      const updated = usePaymentStore.getState().pendingRequests[0];
      expect(updated.paidTxId).toBe('existing-tx');
    });

    it('should not modify other payment requests', () => {
      const req1 = makePaymentRequest({ id: 'req-1', status: 'pending', amount: 100 });
      const req2 = makePaymentRequest({ id: 'req-2', status: 'pending', amount: 200 });
      usePaymentStore.setState({ pendingRequests: [req1, req2] });

      usePaymentStore.getState().updatePaymentRequestStatus('req-1', 'paid', 'tx-1');

      const requests = usePaymentStore.getState().pendingRequests;
      expect(requests[0].status).toBe('paid');
      expect(requests[1].status).toBe('pending');
      expect(requests[1].amount).toBe(200);
    });

    it('should be a no-op when requestId does not exist', () => {
      const req = makePaymentRequest({ id: 'req-1', status: 'pending' });
      usePaymentStore.setState({ pendingRequests: [req] });

      usePaymentStore.getState().updatePaymentRequestStatus('nonexistent', 'paid');

      expect(usePaymentStore.getState().pendingRequests[0].status).toBe('pending');
    });
  });

  describe('clearError', () => {
    it('should clear the error state', () => {
      usePaymentStore.setState({ error: 'Payment failed: insufficient balance' });
      expect(usePaymentStore.getState().error).toBe('Payment failed: insufficient balance');

      usePaymentStore.getState().clearError();
      expect(usePaymentStore.getState().error).toBeNull();
    });

    it('should be a no-op when error is already null', () => {
      expect(usePaymentStore.getState().error).toBeNull();
      usePaymentStore.getState().clearError();
      expect(usePaymentStore.getState().error).toBeNull();
    });
  });

  describe('reset', () => {
    it('should return to initial state', () => {
      // Mutate all fields
      usePaymentStore.setState({
        balance: 5000,
        balanceTimestamp: '2026-01-15T10:00:00Z',
        accountId: '0.0.12345',
        paymentHistory: [makeTransaction()],
        historyNextCursor: 'cursor-abc',
        historyHasMore: false,
        pendingRequests: [makePaymentRequest()],
        isLoading: true,
        isSending: true,
        error: 'some error',
      });

      usePaymentStore.getState().reset();

      const state = usePaymentStore.getState();
      expect(state.balance).toBe(0);
      expect(state.balanceTimestamp).toBeNull();
      expect(state.accountId).toBeNull();
      expect(state.paymentHistory).toEqual([]);
      expect(state.historyNextCursor).toBeNull();
      expect(state.historyHasMore).toBe(true);
      expect(state.pendingRequests).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.isSending).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('sequential operations', () => {
    it('should maintain correct state across balance and history operations', () => {
      // Set initial balance
      usePaymentStore.getState().setBalance(1000);
      expect(usePaymentStore.getState().balance).toBe(1000);

      // Add transactions
      const tx1 = makeTransaction({ id: 'tx-1', amount: 200, direction: 'sent' });
      const tx2 = makeTransaction({ id: 'tx-2', amount: 50, direction: 'received' });
      usePaymentStore.getState().addPaymentToHistory(tx1);
      usePaymentStore.getState().addPaymentToHistory(tx2);
      expect(usePaymentStore.getState().paymentHistory).toHaveLength(2);

      // Update a transaction status
      usePaymentStore.getState().updatePaymentStatus('tx-1', 'completed');
      expect(usePaymentStore.getState().paymentHistory[1].status).toBe('completed');

      // Update balance
      usePaymentStore.getState().updateBalance(800);
      expect(usePaymentStore.getState().balance).toBe(800);

      // Add payment request
      const req = makePaymentRequest({ id: 'req-1' });
      usePaymentStore.setState({
        pendingRequests: [...usePaymentStore.getState().pendingRequests, req],
      });
      expect(usePaymentStore.getState().pendingRequests).toHaveLength(1);

      // Update request status
      usePaymentStore.getState().updatePaymentRequestStatus('req-1', 'paid', 'tx-3');
      expect(usePaymentStore.getState().pendingRequests[0].status).toBe('paid');

      // Error and clear
      usePaymentStore.setState({ error: 'Temporary error' });
      usePaymentStore.getState().clearError();
      expect(usePaymentStore.getState().error).toBeNull();

      // Verify final state coherence
      const finalState = usePaymentStore.getState();
      expect(finalState.balance).toBe(800);
      expect(finalState.paymentHistory).toHaveLength(2);
      expect(finalState.pendingRequests).toHaveLength(1);
    });
  });
});
