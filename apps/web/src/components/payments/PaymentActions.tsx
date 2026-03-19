'use client';

import React, { useState } from 'react';
import {
  RiBankCardLine,
  RiArrowLeftDownLine,
  RiSplitCellsHorizontal,
} from '@remixicon/react';
import { SendPaymentModal } from './SendPaymentModal';
import { RequestPaymentModal } from './RequestPaymentModal';
import { SplitPaymentModal } from './SplitPaymentModal';

interface PaymentActionsProps {
  /** The conversation topic ID for the payment context */
  conversationTopicId: string;
  /** Recipient account ID (for direct send) */
  recipientAccountId?: string;
  /** Recipient display name */
  recipientName?: string;
  /** Participant account IDs for split payments (group chat members) */
  participants?: string[];
  /** Whether to show the split payment option */
  showSplit?: boolean;
}

/**
 * PaymentActions provides a set of buttons for initiating payment actions
 * within a conversation (send, request, split). Manages modal visibility.
 */
export function PaymentActions({
  conversationTopicId,
  recipientAccountId,
  recipientName,
  participants = [],
  showSplit = false,
}: PaymentActionsProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {recipientAccountId && (
          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="Send payment"
          >
            <RiBankCardLine size={14} />
            Send
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowRequestModal(true)}
          className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
          aria-label="Request payment"
        >
          <RiArrowLeftDownLine size={14} />
          Request
        </button>

        {showSplit && (
          <button
            type="button"
            onClick={() => setShowSplitModal(true)}
            className="flex items-center gap-1.5 h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="Split payment"
          >
            <RiSplitCellsHorizontal size={14} />
            Split
          </button>
        )}
      </div>

      {/* Modals */}
      {recipientAccountId && (
        <SendPaymentModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          recipientAccountId={recipientAccountId}
          conversationTopicId={conversationTopicId}
          recipientName={recipientName}
        />
      )}

      <RequestPaymentModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        conversationTopicId={conversationTopicId}
      />

      {showSplit && (
        <SplitPaymentModal
          isOpen={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          conversationTopicId={conversationTopicId}
          initialParticipants={participants}
        />
      )}
    </>
  );
}
