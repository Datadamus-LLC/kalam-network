'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { PaymentRequestCard } from '@/components/payments/PaymentRequestCard';
import { PaymentReceiptCard } from '@/components/payments/PaymentReceiptCard';
import type { PaymentRequestRecord } from '@/stores/payment.store';

interface DecryptedMessage {
  id: string;
  topicId: string;
  senderAccountId: string;
  content: string;
  timestamp: string;
  decryptionFailed: boolean;
  /** Message type for special rendering (payment_request, payment, etc.) */
  messageType?: string;
  /** Embedded payment request data (for payment_request messages) */
  paymentRequest?: PaymentRequestRecord;
  /** Embedded payment data (for payment messages) */
  paymentData?: {
    paymentId: string;
    recipientAccountId?: string;
    amount: number;
    currency: string;
    hederaTxId?: string;
    note?: string;
    status?: 'pending' | 'confirmed' | 'paid' | 'expired' | 'completed' | 'failed';
    participantCount?: number;
  };
}

interface MessageListProps {
  messages: DecryptedMessage[];
  currentAccountId: string;
  isGroupChat: boolean;
  typingUsers: string[];
  isLoading: boolean;
  error: string | null;
  participantNames: Map<string, string>;
}

export type { DecryptedMessage };

export function MessageList({
  messages,
  currentAccountId,
  isGroupChat,
  typingUsers,
  isLoading,
  error,
  participantNames,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
          <p className="text-[13px] text-muted-foreground">Loading messages…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#e0245e] font-semibold text-[14px]">Failed to load messages</p>
          <p className="text-[13px] text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[15px] text-foreground font-semibold">No messages yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            Send a message to start the conversation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {messages.filter((message) => {
        // Hide pure internal system message types
        const alwaysHidden = ['key_exchange', 'system', 'group_meta'];
        if (message.messageType && alwaysHidden.includes(message.messageType)) return false;
        // Hide messages with no content, no payment data, and no special handling
        if (!message.content && !message.messageType && !message.paymentData && !message.paymentRequest) return false;
        return true;
      }).map((message) => {
        const senderName =
          participantNames.get(message.senderAccountId) ||
          message.senderAccountId;
        const isSentByCurrentUser = message.senderAccountId === currentAccountId;

        // Render PaymentRequestCard for payment_request messages
        if (message.messageType === 'payment_request' && message.paymentRequest) {
          return (
            <PaymentRequestCard
              key={message.id}
              request={message.paymentRequest}
              isSentByCurrentUser={isSentByCurrentUser}
              currentAccountId={currentAccountId}
              topicId={message.topicId}
            />
          );
        }

        // Render PaymentReceiptCard for payment messages
        if (
          (message.messageType === 'payment' ||
            message.messageType === 'payment_split') &&
          message.paymentData
        ) {
          return (
            <PaymentReceiptCard
              key={message.id}
              paymentId={message.paymentData.paymentId}
              type={message.messageType as 'payment' | 'payment_request' | 'payment_split'}
              senderAccountId={message.senderAccountId}
              recipientAccountId={message.paymentData.recipientAccountId}
              amount={message.paymentData.amount}
              currency={message.paymentData.currency}
              hederaTxId={message.paymentData.hederaTxId}
              note={message.paymentData.note}
              isSentByCurrentUser={isSentByCurrentUser}
              timestamp={message.timestamp}
              status={message.paymentData.status}
              participantCount={message.paymentData.participantCount}
            />
          );
        }

        // Payment/request messages without card data — show a simple system notice
        const paymentTypes = ['payment', 'payment_request', 'payment_request_update', 'split_payment'];
        if (message.messageType && paymentTypes.includes(message.messageType) && !message.content && !message.paymentData && !message.paymentRequest) {
          const label = message.messageType === 'payment' ? '💸 Payment sent' : message.messageType === 'payment_request' ? '📋 Payment request' : '💸 Payment event';
          return (
            <div key={message.id} className="flex justify-center my-2">
              <span className="text-[12px] text-muted-foreground bg-white/[0.04] px-3 py-1 rounded-full border border-border">
                {label}
              </span>
            </div>
          );
        }

        // Default: render regular message bubble
        return (
          <MessageBubble
            key={message.id}
            content={message.content}
            senderName={senderName}
            timestamp={message.timestamp}
            isSentByCurrentUser={isSentByCurrentUser}
            isGroupChat={isGroupChat}
            decryptionFailed={message.decryptionFailed}
          />
        );
      })}

      <TypingIndicator typingUsers={typingUsers} />
      <div ref={bottomRef} />
    </div>
  );
}
