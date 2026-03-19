'use client';

import React, { useState, useCallback } from 'react';
import { RiCloseLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { usePaymentStore, type PaymentCurrency } from '@/stores/payment.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';

const CURRENCY: PaymentCurrency = 'TMUSD';

interface SendPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientAccountId: string;
  conversationTopicId: string;
  recipientName?: string;
}

type ModalStep = 'input' | 'confirm';

export function SendPaymentModal({
  isOpen,
  onClose,
  recipientAccountId,
  conversationTopicId,
  recipientName = 'Recipient',
}: SendPaymentModalProps) {
  const sendPayment = usePaymentStore((s) => s.sendPayment);
  const isSending = usePaymentStore((s) => s.isSending);
  const user = useAuthStore((s) => s.user);

  const [amount, setAmount] = useState('');
  const currency: PaymentCurrency = CURRENCY;
  const [note, setNote] = useState('');
  const [step, setStep] = useState<ModalStep>('input');
  const [error, setError] = useState<string | null>(null);
  // Allow recipient to be entered inline when not pre-filled (standalone payments page)
  const [recipientInput, setRecipientInput] = useState('');
  const effectiveRecipient = recipientAccountId || recipientInput.trim();
  const effectiveName = recipientName !== 'Recipient' ? recipientName : (recipientInput.trim() || 'Recipient');

  const numAmount = parseFloat(amount);
  const isValidAmount = !isNaN(numAmount) && numAmount > 0 && !!effectiveRecipient;

  const handleClose = useCallback(() => {
    setAmount('');
    setNote('');
    setStep('input');
    setError(null);
    setRecipientInput('');
    onClose();
  }, [onClose]);

  const handleReview = useCallback(() => {
    if (!isValidAmount) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    if (numAmount > 1_000_000) {
      setError('Amount exceeds maximum limit of 1,000,000');
      return;
    }
    setError(null);
    setStep('confirm');
  }, [isValidAmount, numAmount]);

  const handleConfirm = useCallback(async () => {
    if (!user?.hederaAccountId) {
      setError('Wallet not connected. Please complete onboarding first.');
      return;
    }

    if (!effectiveRecipient) {
      setError('Please enter a recipient account ID');
      return;
    }
    try {
      setError(null);
      await sendPayment(
        effectiveRecipient,
        numAmount,
        currency,
        conversationTopicId,
        note || undefined,
      );
      handleClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Payment failed. Please try again.';
      setError(message);
    }
  }, [
    user?.hederaAccountId,
    sendPayment,
    recipientAccountId,
    numAmount,
    currency,
    conversationTopicId,
    note,
    handleClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] max-w-[400px] w-full mx-4">
        {/* Header */}
        <div className="border-b border-border px-5 py-[18px] flex justify-between items-center">
          <div>
            <h2 className="text-[17px] font-extrabold text-foreground">
              Send {currency}
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              To {recipientName}
            </p>
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
        {step === 'input' ? (
          <>
            {/* Recipient input — only shown when no recipient pre-filled */}
            {!recipientAccountId && (
              <div className="px-5 pt-5">
                <label htmlFor="recipient-id" className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Recipient Account ID
                </label>
                <input
                  id="recipient-id"
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="0.0.12345"
                  className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            )}
            {/* Amount — bare centered number per spec */}
            <div className="flex flex-col items-center py-8 px-5 border-b border-border gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {currency}
              </span>
              <input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max="1000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="text-[26px] font-extrabold text-foreground bg-transparent border-none outline-none text-center w-full caret-primary placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                aria-label="Payment amount"
                autoFocus
              />
            </div>

            <div className="px-5 py-5 space-y-3">
              {/* Currency — fixed TMUSD */}
              <div className="flex items-center justify-between h-[42px] rounded-full border border-border bg-white/[0.04] px-4">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Currency</span>
                <span className="text-[14px] font-semibold text-foreground">TMUSD</span>
              </div>

              {/* Note pill input */}
              <input
                id="payment-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                maxLength={500}
                className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
              />

              {error && (
                <p className="text-[13px] text-[#e0245e]">{error}</p>
              )}
            </div>
          </>
        ) : (
          <div className="px-5 py-5 space-y-3">
            <div className="border border-border rounded-[14px] p-4 space-y-3 text-[14px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient</span>
                <span className="font-semibold text-foreground">{effectiveName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account</span>
                <span className="font-mono text-muted-foreground text-[12px]">{effectiveRecipient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-foreground">
                  {numAmount.toFixed(2)} {currency}
                </span>
              </div>
              {note && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Note</span>
                  <span className="text-foreground text-right max-w-[60%] truncate">{note}</span>
                </div>
              )}
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="text-[#00ba7c] font-semibold text-[12px]">Hedera Testnet</span>
              </div>
            </div>

            {error && (
              <p className="text-[13px] text-[#e0245e]">{error}</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border px-5 py-[14px] flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full h-[40px]"
            onClick={() => {
              if (step === 'confirm') {
                setStep('input');
                setError(null);
              } else {
                handleClose();
              }
            }}
          >
            {step === 'confirm' ? 'Back' : 'Cancel'}
          </Button>
          <Button
            className={cn(
              'flex-1 rounded-full h-[40px] bg-primary text-black font-semibold hover:opacity-90 transition-opacity border-0',
              { 'opacity-40 pointer-events-none': !isValidAmount || isSending },
            )}
            disabled={!isValidAmount || isSending}
            onClick={step === 'input' ? handleReview : handleConfirm}
          >
            {isSending
              ? 'Processing…'
              : step === 'input'
                ? 'Review'
                : `Send ${numAmount.toFixed(2)} ${currency}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
