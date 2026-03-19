'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  RiTimeLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiAlertLine,
  RiExternalLinkLine,
  RiBankCardLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { usePaymentStore, type PaymentRequestRecord } from '@/stores/payment.store';
import { createInterval } from '@/lib/timers';
import { env } from '@/lib/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentRequestCardProps {
  /** The full payment request record */
  request: PaymentRequestRecord;
  /** Whether the current user is the requester */
  isSentByCurrentUser: boolean;
  /** Current user's account ID (to determine if they can pay) */
  currentAccountId: string;
  /** HCS topic ID of the conversation (for pay action) */
  topicId: string;
  /** Organization name if request was sent from org context */
  organizationName?: string;
  /** Whether the org is verified */
  organizationVerified?: boolean;
}

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

/**
 * Compute a human-readable countdown string from now to the target date.
 * Returns null if the target is in the past.
 */
function computeCountdown(expiresAt: string): string | null {
  const now = Date.now();
  const target = new Date(expiresAt).getTime();

  if (isNaN(target)) return null;

  const diff = target - now;
  if (diff <= 0) return null;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

function useCountdown(expiresAt: string, isActive: boolean): string | null {
  const [countdown, setCountdown] = useState<string | null>(() =>
    isActive ? computeCountdown(expiresAt) : null,
  );

  useEffect(() => {
    if (!isActive) {
      setCountdown(null);
      return;
    }

    // Update immediately
    setCountdown(computeCountdown(expiresAt));

    // Update every second, auto-stop when expired
    let cleanup: (() => void) | null = null;

    cleanup = createInterval(() => {
      const newCountdown = computeCountdown(expiresAt);
      setCountdown(newCountdown);

      if (newCountdown === null && cleanup) {
        cleanup();
      }
    }, 1000);

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [expiresAt, isActive]);

  return countdown;
}

// ---------------------------------------------------------------------------
// Status configuration — remixicon icons
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: {
    icon: RiTimeLine,
    label: 'Pending',
    badgeCls: 'bg-primary/12 text-primary',
  },
  paid: {
    icon: RiCheckboxCircleLine,
    label: 'Paid',
    badgeCls: 'bg-[rgba(0,186,124,0.1)] text-[#00ba7c]',
  },
  expired: {
    icon: RiAlertLine,
    label: 'Expired',
    badgeCls: 'bg-white/[0.06] text-muted-foreground',
  },
  declined: {
    icon: RiCloseCircleLine,
    label: 'Declined',
    badgeCls: 'bg-[rgba(224,36,94,0.1)] text-[#e0245e]',
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentRequestCard({
  request,
  isSentByCurrentUser,
  currentAccountId: _currentAccountId,
  topicId,
  organizationName,
  organizationVerified: _organizationVerified,
}: PaymentRequestCardProps) {
  const payRequest = usePaymentStore((s) => s.payRequest);
  const isSending = usePaymentStore((s) => s.isSending);
  const [payError, setPayError] = useState<string | null>(null);
  const [isProcessingDecline, setIsProcessingDecline] = useState(false);

  const { status, amount, currency, description, paidTxId, expiresAt } = request;

  // Determine effective status (handle client-side expiry detection)
  const isExpiredByTime =
    status === 'pending' && new Date(expiresAt).getTime() <= Date.now();
  const effectiveStatus = isExpiredByTime ? 'expired' : status;

  const config = STATUS_CONFIG[effectiveStatus];
  const StatusIcon = config.icon;

  // Live countdown for pending requests
  const countdown = useCountdown(expiresAt, effectiveStatus === 'pending');

  // Can the current user pay this request?
  const canPay =
    effectiveStatus === 'pending' && !isSentByCurrentUser && countdown !== null;

  // Can the current user decline this request?
  const canDecline =
    effectiveStatus === 'pending' && !isSentByCurrentUser;

  const handlePay = useCallback(async () => {
    try {
      setPayError(null);
      await payRequest(request.id, topicId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to pay request';
      setPayError(message);
    }
  }, [request.id, topicId, payRequest]);

  const handleDecline = useCallback(async () => {
    try {
      setPayError(null);
      setIsProcessingDecline(true);
      await api_declinePaymentRequest(request.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to decline request';
      setPayError(message);
    } finally {
      setIsProcessingDecline(false);
    }
  }, [request.id]);

  return (
    <div
      className={cn(
        'rounded-[12px] p-[14px] my-2 max-w-[85%] border border-border',
        isSentByCurrentUser ? 'ml-auto' : 'mr-auto',
      )}
      data-testid="payment-request-card"
      data-request-id={request.id}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.06] flex-shrink-0">
          <RiBankCardLine size={16} className="text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] font-semibold text-foreground">
              Payment Request
            </p>
            {organizationName && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                {organizationName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isSentByCurrentUser ? 'You requested' : 'Requested from you'}
          </p>
        </div>
      </div>

      {/* Amount — white per spec */}
      <div className="mb-2">
        <p className="text-[22px] font-[500] text-foreground leading-none">
          {amount.toFixed(2)}{' '}
          <span className="text-[13px] text-muted-foreground">{currency}</span>
        </p>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[13px] text-muted-foreground mb-2 line-clamp-2">
          {description}
        </p>
      )}

      {/* Details row */}
      <div className="space-y-1 text-[12px]">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Status</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 px-[8px] py-[2px] rounded-full text-[11px] font-semibold',
              config.badgeCls,
            )}
          >
            <StatusIcon size={12} />
            {config.label}
          </span>
        </div>

        {/* Countdown for pending */}
        {effectiveStatus === 'pending' && countdown !== null && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Expires in</span>
            <span className="font-mono text-primary font-semibold text-[11px]">
              {countdown}
            </span>
          </div>
        )}

        {/* Paid transaction link */}
        {effectiveStatus === 'paid' && paidTxId && (
          <div className="pt-1">
            <a
              href={`${env.NEXT_PUBLIC_HASHSCAN_URL}/${env.NEXT_PUBLIC_HEDERA_NETWORK}/transaction/${paidTxId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RiExternalLinkLine size={12} />
              View on HashScan
            </a>
          </div>
        )}
      </div>

      {/* Action buttons — lemon Pay, outline Decline per spec */}
      {canPay && (
        <div className="mt-3 flex gap-2 flex-nowrap">
          <Button
            className="flex-1 rounded-full h-[36px] bg-primary text-black font-semibold text-[13px] hover:opacity-90 transition-opacity border-0 whitespace-nowrap"
            disabled={isSending || isProcessingDecline}
            onClick={handlePay}
          >
            {isSending ? 'Processing…' : `Pay ${amount.toFixed(2)} ${currency}`}
          </Button>
          {canDecline && (
            <Button
              variant="outline"
              className="rounded-full h-[36px] px-4 text-[13px] font-semibold whitespace-nowrap"
              disabled={isSending || isProcessingDecline}
              onClick={handleDecline}
            >
              {isProcessingDecline ? 'Declining…' : 'Decline'}
            </Button>
          )}
        </div>
      )}

      {/* Error display */}
      {payError && (
        <p className="text-[11px] text-[#e0245e] mt-1">{payError}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper — calls decline API endpoint
// ---------------------------------------------------------------------------

async function api_declinePaymentRequest(requestId: string): Promise<void> {
  const { api } = await import('@/lib/api');
  await api.declinePaymentRequest(requestId);
}
