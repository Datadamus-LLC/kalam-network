'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  RiSearchLine,
  RiBankCardLine,
  RiRefreshLine,
  RiSplitCellsHorizontal,
  RiFilter3Line as RiSlidersLine,
  RiArrowDownSLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { usePaymentStore, type TransactionRecord } from '@/stores/payment.store';
import { useAuthStore } from '@/stores/auth.store';
import { BalanceWidget } from '@/components/payments/BalanceWidget';
import { TransactionItem } from '@/components/payments/TransactionItem';
import { SplitPaymentModal } from '@/components/payments/SplitPaymentModal';
import { SendPaymentModal } from '@/components/payments/SendPaymentModal';
import { RequestPaymentModal } from '@/components/payments/RequestPaymentModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DirectionFilter = 'all' | 'sent' | 'received';
type StatusFilter = 'all' | 'completed' | 'pending' | 'failed';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PaymentsPage() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const paymentHistory = usePaymentStore((s) => s.paymentHistory);
  const pendingRequests = usePaymentStore((s) => s.pendingRequests);
  const isLoading = usePaymentStore((s) => s.isLoading);
  const historyHasMore = usePaymentStore((s) => s.historyHasMore);
  const historyNextCursor = usePaymentStore((s) => s.historyNextCursor);
  const fetchTransactions = usePaymentStore((s) => s.fetchTransactions);
  const fetchPendingRequests = usePaymentStore((s) => s.fetchPendingRequests);
  const payRequest = usePaymentStore((s) => s.payRequest);
  const isSending = usePaymentStore((s) => s.isSending);
  const error = usePaymentStore((s) => s.error);
  const clearError = usePaymentStore((s) => s.clearError);

  // Filter state
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal state — Split always available; Send/Request need a topicId context
  // On the standalone payments page we use a platform-wide topic placeholder.
  // The actual topic is required by the API; we use an empty string here and
  // guard so the modals are only opened when appropriate.
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Selected recipient for Send modal (from Recent Contacts)
  const [sendRecipient, setSendRecipient] = useState<{ accountId: string; name: string; topicId: string } | null>(null);

  // Selected transaction for detail view (future enhancement hook)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);

  // Fetch conversations for Recent Contacts
  const { data: conversationsData } = useQuery({
    queryKey: ['recent-contacts'],
    queryFn: () => api.getConversations(),
    enabled: isAuthenticated,
  });

  // ---------------------------------------------------------------------------
  // Initial data fetch
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isAuthenticated) return;

    void fetchTransactions({ direction: 'all' });
    void fetchPendingRequests();
  }, [isAuthenticated, fetchTransactions, fetchPendingRequests]);

  // Re-fetch when filters change (debounce search)
  useEffect(() => {
    if (!isAuthenticated) return;

    const params: Parameters<typeof fetchTransactions>[0] = {};

    if (directionFilter !== 'all') {
      params.direction = directionFilter;
    } else {
      params.direction = 'all';
    }

    if (statusFilter !== 'all') {
      params.status = statusFilter;
    }

    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    const timeout = setTimeout(() => {
      void fetchTransactions(params);
    }, searchQuery.trim() ? 400 : 0);

    return () => clearTimeout(timeout);
  }, [
    isAuthenticated,
    directionFilter,
    statusFilter,
    dateFrom,
    dateTo,
    searchQuery,
    fetchTransactions,
  ]);

  // ---------------------------------------------------------------------------
  // Load more
  // ---------------------------------------------------------------------------

  const handleLoadMore = useCallback(() => {
    if (!historyHasMore || isLoading || !historyNextCursor) return;

    const params: Parameters<typeof fetchTransactions>[0] = {
      cursor: historyNextCursor,
    };

    if (directionFilter !== 'all') params.direction = directionFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    void fetchTransactions(params);
  }, [
    historyHasMore,
    isLoading,
    historyNextCursor,
    directionFilter,
    statusFilter,
    dateFrom,
    dateTo,
    searchQuery,
    fetchTransactions,
  ]);

  // ---------------------------------------------------------------------------
  // Refresh
  // ---------------------------------------------------------------------------

  const handleRefresh = useCallback(() => {
    clearError();
    void fetchTransactions({ direction: 'all' });
    void fetchPendingRequests();
  }, [clearError, fetchTransactions, fetchPendingRequests]);

  // ---------------------------------------------------------------------------
  // Pending request actions
  // ---------------------------------------------------------------------------

  const handlePayRequest = useCallback(async (requestId: string, topicId: string) => {
    await payRequest(requestId, topicId);
    void fetchPendingRequests();
  }, [payRequest, fetchPendingRequests]);

  // ---------------------------------------------------------------------------
  // Derived: active filter count for badge
  // ---------------------------------------------------------------------------

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    return count;
  }, [statusFilter, dateFrom, dateTo]);

  // ---------------------------------------------------------------------------
  // Pending requests that are truly pending (filter out declined/paid)
  // ---------------------------------------------------------------------------

  const activePendingRequests = useMemo(
    () => pendingRequests.filter((r) => r.status === 'pending'),
    [pendingRequests],
  );

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  const showEmpty = !isLoading && paymentHistory.length === 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Page header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
            <h1 className="text-[20px] font-extrabold text-foreground">Payments</h1>
            <div className="flex items-center gap-2">
              {/* Send button (opens modal; no specific recipient on this page) */}
              <button
                type="button"
                onClick={() => setShowSendModal(true)}
                className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                aria-label="Send payment"
              >
                <RiBankCardLine size={14} />
                Send
              </button>

              {/* Request button */}
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                aria-label="Request payment"
              >
                Request
              </button>

              {/* Split button */}
              <button
                type="button"
                onClick={() => setShowSplitModal(true)}
                className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                aria-label="Split payment"
              >
                <RiSplitCellsHorizontal size={14} />
                Split
              </button>

              {/* Refresh */}
              <button
                type="button"
                onClick={handleRefresh}
                className="flex items-center justify-center w-[34px] h-[34px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                aria-label="Refresh transactions"
                disabled={isLoading}
              >
                <RiRefreshLine
                  size={15}
                  className={cn({ 'animate-spin': isLoading })}
                />
              </button>
            </div>
          </div>

          {/* Balance widget */}
          <div className="px-6 mb-4 flex-shrink-0">
            <BalanceWidget variant="full" />
          </div>

          {/* Search bar */}
          <div className="px-6 mb-3 flex-shrink-0">
            <div className="relative">
              <RiSearchLine
                size={15}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or transaction ID..."
                className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] pl-[38px] pr-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
                aria-label="Search transactions"
              />
            </div>
          </div>

          {/* Direction filter tabs + Advanced Filters toggle */}
          <div className="px-6 mb-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1">
              {(['all', 'sent', 'received'] as DirectionFilter[]).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirectionFilter(dir)}
                  className={cn(
                    'h-[34px] px-4 rounded-full text-[13px] font-semibold transition-colors capitalize',
                    directionFilter === dir
                      ? 'bg-white/[0.12] text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                  )}
                >
                  {dir === 'all' ? 'All' : dir.charAt(0).toUpperCase() + dir.slice(1)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 h-[34px] px-4 rounded-full border text-[13px] font-semibold transition-colors',
                showAdvancedFilters
                  ? 'border-white/20 bg-white/[0.08] text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
              )}
              aria-expanded={showAdvancedFilters}
              aria-label="Toggle advanced filters"
            >
              <RiSlidersLine size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-black text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
              <RiArrowDownSLine
                size={14}
                className={cn('transition-transform', {
                  'rotate-180': showAdvancedFilters,
                })}
              />
            </button>
          </div>

          {/* Advanced filters panel */}
          {showAdvancedFilters && (
            <div className="mx-6 mb-3 border border-border rounded-[14px] p-4 flex-shrink-0">
              {/* Status filter */}
              <div className="mb-4">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Status
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  {(['all', 'completed', 'pending', 'failed'] as StatusFilter[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        'h-[30px] px-3 rounded-full text-[12px] font-semibold transition-colors capitalize',
                        statusFilter === s
                          ? 'bg-white/[0.12] text-foreground'
                          : 'text-muted-foreground border border-border hover:text-foreground hover:bg-white/[0.06]',
                      )}
                    >
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="filter-date-from"
                    className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
                  >
                    From
                  </label>
                  <input
                    id="filter-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full h-[38px] rounded-[10px] border border-border bg-white/[0.04] px-3 text-[13px] text-foreground focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="filter-date-to"
                    className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5"
                  >
                    To
                  </label>
                  <input
                    id="filter-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full h-[38px] rounded-[10px] border border-border bg-white/[0.04] px-3 text-[13px] text-foreground focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
              </div>

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="mt-3 text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mx-6 mb-3 px-4 py-3 rounded-[10px] bg-[rgba(224,36,94,0.1)] border border-[rgba(224,36,94,0.2)] flex items-center justify-between flex-shrink-0">
              <p className="text-[13px] text-[#e0245e]">{error}</p>
              <button
                type="button"
                onClick={clearError}
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors ml-3 flex-shrink-0"
                aria-label="Dismiss error"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Transaction history section */}
          <div className="px-6 mb-2 flex-shrink-0">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Transaction History
            </p>
          </div>

          {/* Transaction list */}
          <div className="flex-1 border-t border-border">
            {isLoading && paymentHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RiRefreshLine size={24} className="text-muted-foreground animate-spin" />
                <p className="text-[14px] text-muted-foreground">Loading transactions…</p>
              </div>
            ) : showEmpty ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <RiBankCardLine size={32} className="text-muted-foreground opacity-40" />
                <p className="text-[15px] font-semibold text-foreground">
                  No transactions found
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {searchQuery || activeFilterCount > 0
                    ? 'Try adjusting your search or filters'
                    : 'Your payment history will appear here'}
                </p>
              </div>
            ) : (
              <>
                {paymentHistory.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    onClick={setSelectedTransaction}
                  />
                ))}

                {/* Load more */}
                {historyHasMore && (
                  <div className="flex justify-center py-4">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={isLoading}
                      className="flex items-center gap-2 h-[36px] px-5 rounded-full border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <RiRefreshLine size={13} className="animate-spin" />
                          Loading…
                        </>
                      ) : (
                        'Load more'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right panel (hidden on mobile) ──────────────────────── */}
        <div className="hidden lg:flex flex-col w-[280px] flex-shrink-0 border-l border-border overflow-y-auto sticky top-0 h-screen">
          {/* Pending Requests */}
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-extrabold text-foreground mb-3">
              Pending Requests
            </h2>

            {activePendingRequests.length === 0 ? (
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Payment requests appear here when someone requests money from you.
              </p>
            ) : (
              <div className="space-y-3">
                {activePendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="border border-border rounded-[12px] p-3"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[13px] font-semibold text-foreground">
                        {req.amount.toFixed(2)}{' '}
                        <span className="text-muted-foreground font-normal">
                          {req.currency}
                        </span>
                      </p>
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-primary/12 text-primary text-[11px] font-semibold">
                        pending
                      </span>
                    </div>

                    {req.description && (
                      <p className="text-[12px] text-muted-foreground mb-2 line-clamp-2">
                        {req.description}
                      </p>
                    )}

                    <p className="text-[11px] font-mono text-muted-foreground mb-2 truncate">
                      From: {req.requesterUserId}
                    </p>

                    <button
                      type="button"
                      onClick={() => void handlePayRequest(req.id, req.hcsTopicId)}
                      disabled={isSending}
                      className={cn(
                        'w-full h-[32px] rounded-full bg-primary text-black text-[12px] font-semibold hover:opacity-90 transition-opacity',
                        { 'opacity-50 pointer-events-none': isSending },
                      )}
                    >
                      {isSending ? 'Processing…' : `Pay ${req.amount.toFixed(2)} ${req.currency}`}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Contacts */}
          <div className="p-5">
            <h2 className="text-[15px] font-extrabold text-foreground mb-3">
              Recent Contacts
            </h2>
            {conversationsData?.conversations && conversationsData.conversations.length > 0 ? (
              <div className="space-y-2">
                {conversationsData.conversations
                  .filter((c) => c.type === 'direct')
                  .map((c) => {
                    const other = c.participants.find(
                      (p) => p.accountId !== user?.hederaAccountId,
                    );
                    if (!other) return null;
                    const name = other.displayName ?? other.accountId;
                    return (
                      <button
                        key={c.hcsTopicId}
                        type="button"
                        onClick={() => {
                          setSendRecipient({
                            accountId: other.accountId,
                            name,
                            topicId: c.hcsTopicId,
                          });
                          setShowSendModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-white/[0.06] transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                          <span className="text-[13px] font-bold text-foreground">
                            {name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">{other.accountId}</p>
                        </div>
                        <span className="text-[12px] text-primary font-semibold flex-shrink-0">Send</span>
                      </button>
                    );
                  })
                  .filter(Boolean)}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Start a conversation to see contacts here.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transaction detail panel (slide-in on click) */}
      {selectedTransaction && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex justify-end"
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="w-full max-w-[360px] h-full bg-background border-l border-border overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-extrabold text-foreground">
                Transaction Details
              </h2>
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close detail panel"
              >
                ×
              </button>
            </div>

            <div className="border border-border rounded-[14px] p-4 space-y-3 text-[14px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Direction</span>
                <span className="font-semibold text-foreground capitalize">
                  {selectedTransaction.direction}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-foreground">
                  {selectedTransaction.amount.toFixed(2)} {selectedTransaction.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span
                  className={cn(
                    'inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    selectedTransaction.status === 'completed'
                      ? 'bg-[rgba(0,186,124,0.1)] text-[#00ba7c]'
                      : selectedTransaction.status === 'pending'
                        ? 'bg-primary/12 text-primary'
                        : 'bg-[rgba(224,36,94,0.1)] text-[#e0245e]',
                  )}
                >
                  {selectedTransaction.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-semibold text-foreground capitalize">
                  {selectedTransaction.paymentType.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">
                  {selectedTransaction.direction === 'sent' ? 'To' : 'From'}
                </span>
                <span className="font-mono text-[12px] text-muted-foreground max-w-[60%] text-right truncate">
                  {selectedTransaction.counterpartyName ?? selectedTransaction.counterpartyId}
                </span>
              </div>
              {selectedTransaction.description && (
                <div className="flex justify-between items-start">
                  <span className="text-muted-foreground">Note</span>
                  <span className="text-foreground text-right max-w-[60%]">
                    {selectedTransaction.description}
                  </span>
                </div>
              )}
              {selectedTransaction.hederaTxId && (
                <div className="border-t border-border pt-3 flex justify-between items-center">
                  <span className="text-muted-foreground">Hedera TX</span>
                  <span className="font-mono text-[11px] text-[#00ba7c] truncate max-w-[55%]">
                    {selectedTransaction.hederaTxId}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────── */}

      {/*
       * Send payment — requires a recipientAccountId and conversationTopicId.
       * On the standalone page we open the modal but the user needs to have
       * a known recipient. We pass an empty string; the modal guards against
       * sending without a wallet being connected. A future enhancement could
       * add a recipient lookup field before opening the modal.
       */}
      <SendPaymentModal
        isOpen={showSendModal}
        onClose={() => { setShowSendModal(false); setSendRecipient(null); }}
        recipientAccountId={sendRecipient?.accountId ?? ""}
        conversationTopicId={sendRecipient?.topicId ?? ""}
        recipientName={sendRecipient?.name ?? "Recipient"}
      />

      <RequestPaymentModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        conversationTopicId=""
      />

      <SplitPaymentModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        conversationTopicId=""
        initialParticipants={[]}
      />
    </>
  );
}
