'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { RiArrowRightUpLine, RiArrowLeftDownLine } from '@remixicon/react';
import { format, isToday, isYesterday } from 'date-fns';
import type { TransactionRecord } from '@/stores/payment.store';

interface TransactionItemProps {
  transaction: TransactionRecord;
  onClick?: (transaction: TransactionRecord) => void;
}

function formatTxTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, yyyy');
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-[rgba(0,186,124,0.1)] text-[#00ba7c]';
    case 'pending':
      return 'bg-primary/12 text-primary';
    case 'failed':
      return 'bg-[rgba(224,36,94,0.1)] text-[#e0245e]';
    default:
      return 'bg-white/[0.06] text-muted-foreground';
  }
}

function getPaymentTypeLabel(paymentType: string): string {
  switch (paymentType) {
    case 'send':
      return 'Payment';
    case 'request_fulfillment':
      return 'Request Fulfilled';
    case 'split_payment':
      return 'Split Payment';
    default:
      return 'Transaction';
  }
}

export function TransactionItem({ transaction, onClick }: TransactionItemProps) {
  const isSent = transaction.direction === 'sent';

  return (
    <button
      type="button"
      className="w-full flex items-center gap-4 px-[18px] py-[14px] hover:bg-white/[0.025] border-b border-border transition-colors text-left"
      onClick={() => onClick?.(transaction)}
    >
      {/* Direction icon — gray circle, neutral per spec */}
      <div className="w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 bg-white/[0.06]">
        {isSent ? (
          <RiArrowRightUpLine size={18} className="text-muted-foreground" />
        ) : (
          <RiArrowLeftDownLine size={18} className="text-muted-foreground" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-foreground">
            {isSent ? 'Sent' : 'Received'}
          </p>
          {/* Amount — always white per spec */}
          <p className="text-[14px] font-[500] text-foreground">
            {isSent ? '−' : '+'}
            {transaction.amount.toFixed(2)} {transaction.currency}
          </p>
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">
              {getPaymentTypeLabel(transaction.paymentType)}
            </span>
            <span
              className={cn(
                'inline-flex px-[8px] py-[2px] rounded-full text-[11px] font-semibold',
                getStatusBadge(transaction.status),
              )}
            >
              {transaction.status}
            </span>
          </div>
          <span className="text-[12px] text-muted-foreground">
            {formatTxTime(transaction.createdAt)}
          </span>
        </div>

        {transaction.description && (
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
            {transaction.description}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {isSent ? 'To: ' : 'From: '}
          <span className={transaction.counterpartyName ? '' : 'font-mono'}>
            {transaction.counterpartyName ?? transaction.counterpartyId}
          </span>
        </p>
      </div>
    </button>
  );
}
