'use client';

import React, { useState, useCallback } from 'react';
import { RiCloseLine, RiCheckboxCircleLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { usePaymentStore, type PaymentCurrency } from '@/stores/payment.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';

const CURRENCY: PaymentCurrency = 'TMUSD';

interface RequestPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationTopicId: string;
}

export function RequestPaymentModal({
  isOpen,
  onClose,
  conversationTopicId,
}: RequestPaymentModalProps) {
  const requestMoney = usePaymentStore((s) => s.requestMoney);
  const isSending = usePaymentStore((s) => s.isSending);
  const user = useAuthStore((s) => s.user);

  const [amount, setAmount] = useState('');
  const currency: PaymentCurrency = CURRENCY;
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numAmount = parseFloat(amount);
  const isValidAmount = !isNaN(numAmount) && numAmount > 0;

  const handleClose = useCallback(() => {
    setAmount('');
    setDescription('');
    setError(null);
    setSuccess(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!user?.hederaAccountId) {
      setError('Wallet not connected. Please complete onboarding first.');
      return;
    }

    if (!isValidAmount) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    if (numAmount > 1_000_000) {
      setError('Amount exceeds maximum limit of 1,000,000');
      return;
    }

    try {
      setError(null);
      await requestMoney(
        numAmount,
        currency,
        conversationTopicId,
        description || undefined,
      );
      setSuccess(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to create payment request. Please try again.';
      setError(message);
    }
  }, [
    user?.hederaAccountId,
    isValidAmount,
    numAmount,
    currency,
    conversationTopicId,
    description,
    requestMoney,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] max-w-[400px] w-full mx-4">
        {/* Header */}
        <div className="border-b border-border px-5 py-[18px] flex justify-between items-center">
          <div>
            <h2 className="text-[17px] font-extrabold text-foreground">Request Payment</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Send a payment request</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close modal"
          >
            <RiCloseLine size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          {success ? (
            <div className="text-center py-6">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(0,186,124,0.1)] mx-auto mb-4">
                <RiCheckboxCircleLine size={28} className="text-[#00ba7c]" />
              </div>
              <h3 className="text-[17px] font-bold text-foreground mb-2">
                Request Sent
              </h3>
              <p className="text-[14px] text-muted-foreground">
                Your payment request for {numAmount.toFixed(2)} {currency} has
                been sent to the conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Amount — centered bare number */}
              <div className="flex flex-col items-center py-6 border border-border rounded-[14px] gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  {currency}
                </span>
                <input
                  id="request-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="text-[26px] font-extrabold text-foreground bg-transparent border-none outline-none text-center w-full caret-primary placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label="Request amount"
                  autoFocus
                />
              </div>

              {/* Currency — fixed TMUSD */}
              <div className="flex items-center justify-between h-[42px] rounded-full border border-border bg-white/[0.04] px-4">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Currency</span>
                <span className="text-[14px] font-semibold text-foreground">TMUSD</span>
              </div>

              {/* Description */}
              <input
                id="request-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                maxLength={500}
                className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
              />

              {error && (
                <p className="text-[13px] text-[#e0245e]">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-[14px] flex gap-2">
          {success ? (
            <Button
              className="flex-1 rounded-full h-[40px] bg-primary text-black font-semibold hover:opacity-90 transition-opacity border-0"
              onClick={handleClose}
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="flex-1 rounded-full h-[40px]"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                className={cn(
                  'flex-1 rounded-full h-[40px] bg-primary text-black font-semibold hover:opacity-90 transition-opacity border-0',
                  { 'opacity-40 pointer-events-none': !isValidAmount || isSending },
                )}
                disabled={!isValidAmount || isSending}
                onClick={handleSubmit}
              >
                {isSending ? 'Sending…' : 'Send Request'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
