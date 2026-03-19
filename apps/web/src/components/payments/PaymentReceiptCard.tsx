'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  RiArrowRightUpLine,
  RiArrowLeftDownLine,
  RiExternalLinkLine,
} from '@remixicon/react';
import { format, isToday, isYesterday } from 'date-fns';
import { usePaymentStore } from '@/stores/payment.store';
import { Button } from '@/components/ui/button';
import { env } from '@/lib/env';

interface PaymentReceiptCardProps {
  /** Payment ID */
  paymentId: string;
  /** Type of payment message */
  type: 'payment' | 'payment_request' | 'payment_split';
  /** Sender's Hedera account ID */
  senderAccountId: string;
  /** Recipient's Hedera account ID (if applicable) */
  recipientAccountId?: string;
  /** Payment amount */
  amount: number;
  /** Currency code */
  currency: string;
  /** Hedera transaction ID (if completed) */
  hederaTxId?: string;
  /** Optional note/description */
  note?: string;
  /** Whether the current user is the sender */
  isSentByCurrentUser: boolean;
  /** Timestamp of the payment */
  timestamp: string;
  /** Payment request ID (for request types) */
  requestId?: string;
  /** Conversation topic ID (for pay request action) */
  topicId?: string;
  /** Number of split participants */
  participantCount?: number;
  /** Status of payment or request */
  status?: 'pending' | 'confirmed' | 'paid' | 'expired' | 'completed' | 'failed';
}

function formatPaymentTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) return '';

  if (isToday(date)) {
    return format(date, 'h:mm a');
  }

  if (isYesterday(date)) {
    return `Yesterday ${format(date, 'h:mm a')}`;
  }

  return format(date, 'MMM d, h:mm a');
}

function getStatusBadge(
  status: string,
): { cls: string; label: string } {
  switch (status) {
    case 'confirmed':
    case 'completed':
    case 'paid':
      return { cls: 'bg-[rgba(0,186,124,0.1)] text-[#00ba7c]', label: status };
    case 'pending':
      return { cls: 'bg-primary/12 text-primary', label: 'pending' };
    case 'failed':
    case 'expired':
      return { cls: 'bg-[rgba(224,36,94,0.1)] text-[#e0245e]', label: status };
    default:
      return { cls: 'bg-white/[0.06] text-muted-foreground', label: status };
  }
}

export function PaymentReceiptCard({
  paymentId,
  type,
  senderAccountId,
  recipientAccountId,
  amount,
  currency,
  hederaTxId,
  note,
  isSentByCurrentUser,
  timestamp,
  requestId,
  topicId,
  participantCount,
  status = 'confirmed',
}: PaymentReceiptCardProps) {
  const payRequest = usePaymentStore((s) => s.payRequest);
  const isSending = usePaymentStore((s) => s.isSending);
  const [payError, setPayError] = useState<string | null>(null);

  const handlePayRequest = useCallback(async () => {
    if (!requestId || !topicId) return;

    try {
      setPayError(null);
      await payRequest(requestId, topicId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to pay request';
      setPayError(message);
    }
  }, [requestId, topicId, payRequest]);

  const isPayment = type === 'payment';
  const isRequest = type === 'payment_request';
  const isSplit = type === 'payment_split';
  const isPending = status === 'pending';
  const canPayRequest = isRequest && !isSentByCurrentUser && isPending && requestId && topicId;

  const statusBadge = getStatusBadge(status);

  return (
    <div
      className={cn(
        'rounded-[12px] p-[14px] my-2 max-w-[85%] border border-border',
        isSentByCurrentUser ? 'ml-auto' : 'mr-auto',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.06] flex-shrink-0">
          {isSentByCurrentUser ? (
            <RiArrowRightUpLine size={16} className="text-muted-foreground" />
          ) : (
            <RiArrowLeftDownLine size={16} className="text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-[12px] font-semibold text-foreground">
            {isPayment && 'Payment'}
            {isRequest && 'Payment Request'}
            {isSplit && 'Split Payment'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatPaymentTime(timestamp)}
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

      {/* Details */}
      <div className="space-y-1 text-[12px]">
        {isPayment && recipientAccountId && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {isSentByCurrentUser ? 'To' : 'From'}
            </span>
            <span className="font-mono text-foreground">
              {isSentByCurrentUser ? recipientAccountId : senderAccountId}
            </span>
          </div>
        )}

        {isRequest && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Requested by</span>
            <span className="font-mono text-foreground">{senderAccountId}</span>
          </div>
        )}

        {isSplit && participantCount !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Participants</span>
            <span className="text-foreground">{participantCount}</span>
          </div>
        )}

        {note && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Note</span>
            <span className="text-foreground text-right max-w-[60%] truncate">
              {note}
            </span>
          </div>
        )}

        {/* Status badge */}
        <div className="flex justify-between items-center pt-0.5">
          <span className="text-muted-foreground">Status</span>
          <span
            className={cn(
              'inline-flex items-center px-[8px] py-[2px] rounded-full text-[11px] font-semibold',
              statusBadge.cls,
            )}
          >
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Hedera TX link */}
      {hederaTxId && (
        <a
          href={`${env.NEXT_PUBLIC_HASHSCAN_URL}/${env.NEXT_PUBLIC_HEDERA_NETWORK}/transaction/${hederaTxId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 mt-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RiExternalLinkLine size={12} />
          View on HashScan
        </a>
      )}

      {/* Pay request action — lemon per spec */}
      {canPayRequest && (
        <div className="mt-3">
          <Button
            className="w-full rounded-full h-[36px] bg-primary text-black font-semibold text-[13px] hover:opacity-90 transition-opacity border-0"
            disabled={isSending}
            onClick={handlePayRequest}
          >
            {isSending ? 'Processing…' : `Pay ${amount.toFixed(2)} ${currency}`}
          </Button>
          {payError && (
            <p className="text-[11px] text-[#e0245e] mt-1">{payError}</p>
          )}
        </div>
      )}

      {/* Hidden data attribute for programmatic access */}
      <input type="hidden" data-payment-id={paymentId} />
    </div>
  );
}
