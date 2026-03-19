'use client';

import React, { useEffect, useCallback } from 'react';
import { RiRefreshLine, RiWallet3Line } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { usePaymentStore } from '@/stores/payment.store';
import { useAuthStore } from '@/stores/auth.store';
import { subscribeToNotifications } from '@/lib/socket';

interface BalanceWidgetProps {
  /** Visual variant */
  variant?: 'compact' | 'full';
  /** Additional CSS class names */
  className?: string;
}

/**
 * BalanceWidget displays the user's TMUSD balance.
 * Shown in the sidebar and header areas.
 *
 * - Fetches balance on mount
 * - Subscribes to WebSocket for real-time updates
 * - Supports manual refresh
 */
export function BalanceWidget({
  variant = 'compact',
  className,
}: BalanceWidgetProps) {
  const balance = usePaymentStore((s) => s.balance);
  const isLoading = usePaymentStore((s) => s.isLoading);
  const fetchBalance = usePaymentStore((s) => s.fetchBalance);
  const updateBalance = usePaymentStore((s) => s.updateBalance);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  // Fetch balance on mount when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user?.hederaAccountId) {
      void fetchBalance();
    }
  }, [isAuthenticated, user?.hederaAccountId, fetchBalance]);

  // Subscribe to real-time balance updates via WebSocket
  useEffect(() => {
    if (!isAuthenticated) return;

    const cleanup = subscribeToNotifications((data) => {
      const type = data['type'] as string | undefined;
      if (type === 'balance_update') {
        const newBalance = data['balance'] as number | undefined;
        if (typeof newBalance === 'number') {
          updateBalance(newBalance);
        }
      }
      // Also refresh balance on payment events
      if (
        type === 'payment_sent' ||
        type === 'payment_received' ||
        type === 'payment_request_paid'
      ) {
        void fetchBalance();
      }
    });

    return cleanup;
  }, [isAuthenticated, updateBalance, fetchBalance]);

  const handleRefresh = useCallback(() => {
    void fetchBalance();
  }, [fetchBalance]);

  if (!isAuthenticated || !user?.hederaAccountId) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-white/[0.04]',
          className,
        )}
      >
        <RiWallet3Line size={15} className="text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">
          {isLoading ? '…' : `${balance.toFixed(2)} TMUSD`}
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          className="p-0.5 hover:text-foreground text-muted-foreground transition-colors"
          aria-label="Refresh balance"
          disabled={isLoading}
        >
          <RiRefreshLine
            size={13}
            className={cn({ 'animate-spin': isLoading })}
          />
        </button>
      </div>
    );
  }

  // Full variant
  return (
    <div
      className={cn(
        'border border-border rounded-[14px] p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RiWallet3Line size={16} className="text-muted-foreground" />
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Balance
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center justify-center w-7 h-7 rounded-full border border-border hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh balance"
          disabled={isLoading}
        >
          <RiRefreshLine
            size={14}
            className={cn({ 'animate-spin': isLoading })}
          />
        </button>
      </div>

      <p className="text-[28px] font-extrabold text-foreground leading-none mb-1">
        {isLoading ? '—' : balance.toFixed(2)}
      </p>
      <p className="text-[13px] text-muted-foreground">TMUSD</p>

      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[12px] text-muted-foreground font-mono truncate">
          {/* Truncate: 0.0.8262995 → 0.0.826…995 */}
          {user.hederaAccountId.length > 12
            ? `${user.hederaAccountId.slice(0, 7)}…${user.hederaAccountId.slice(-3)}`
            : user.hederaAccountId}
        </p>
      </div>
    </div>
  );
}
