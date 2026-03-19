'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { RiCloseLine, RiAddLine, RiDeleteBinLine, RiCheckboxCircleLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { usePaymentStore, type PaymentCurrency } from '@/stores/payment.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';

const CURRENCY: PaymentCurrency = 'TMUSD';

interface Participant {
  accountId: string;
  customAmount: string;
}

interface SplitPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationTopicId: string;
  /** Pre-populated participant account IDs (e.g., from a group chat) */
  initialParticipants?: string[];
}

type ModalStep = 'input' | 'confirm';

export function SplitPaymentModal({
  isOpen,
  onClose,
  conversationTopicId,
  initialParticipants = [],
}: SplitPaymentModalProps) {
  const createSplitPayment = usePaymentStore((s) => s.createSplitPayment);
  const isSending = usePaymentStore((s) => s.isSending);
  const user = useAuthStore((s) => s.user);

  const [totalAmount, setTotalAmount] = useState('');
  const currency: PaymentCurrency = CURRENCY;
  const [splitMethod, setSplitMethod] = useState<'equal' | 'custom'>('equal');
  const [participants, setParticipants] = useState<Participant[]>(
    initialParticipants
      .filter((id) => id !== user?.hederaAccountId)
      .map((id) => ({ accountId: id, customAmount: '' })),
  );
  const [newParticipantId, setNewParticipantId] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<ModalStep>('input');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numTotal = parseFloat(totalAmount);
  const isValidTotal = !isNaN(numTotal) && numTotal > 0;
  const hasParticipants = participants.length > 0;

  const equalShare = useMemo(() => {
    if (!isValidTotal || participants.length === 0) return 0;
    return Math.round((numTotal / participants.length) * 100) / 100;
  }, [isValidTotal, numTotal, participants.length]);

  const customAmountsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of participants) {
      const amt = parseFloat(p.customAmount);
      if (!isNaN(amt) && amt > 0) {
        map[p.accountId] = amt;
      }
    }
    return map;
  }, [participants]);

  const customTotal = useMemo(() => {
    return Object.values(customAmountsMap).reduce((sum, amt) => sum + amt, 0);
  }, [customAmountsMap]);

  const handleClose = useCallback(() => {
    setTotalAmount('');
    setNote('');
    setStep('input');
    setError(null);
    setSuccess(false);
    setParticipants(
      initialParticipants
        .filter((id) => id !== user?.hederaAccountId)
        .map((id) => ({ accountId: id, customAmount: '' })),
    );
    onClose();
  }, [onClose, initialParticipants, user?.hederaAccountId]);

  const handleAddParticipant = useCallback(() => {
    const trimmed = newParticipantId.trim();
    if (!trimmed) return;

    if (!/^0\.0\.\d+$/.test(trimmed)) {
      setError('Invalid Hedera account ID format (expected 0.0.XXXXX)');
      return;
    }

    if (trimmed === user?.hederaAccountId) {
      setError('You cannot add yourself as a participant');
      return;
    }

    if (participants.some((p) => p.accountId === trimmed)) {
      setError('This participant is already in the list');
      return;
    }

    setError(null);
    setParticipants((prev) => [
      ...prev,
      { accountId: trimmed, customAmount: '' },
    ]);
    setNewParticipantId('');
  }, [newParticipantId, user?.hederaAccountId, participants]);

  const handleRemoveParticipant = useCallback((accountId: string) => {
    setParticipants((prev) => prev.filter((p) => p.accountId !== accountId));
  }, []);

  const handleCustomAmountChange = useCallback(
    (accountId: string, value: string) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.accountId === accountId ? { ...p, customAmount: value } : p,
        ),
      );
    },
    [],
  );

  const handleReview = useCallback(() => {
    if (!isValidTotal) {
      setError('Please enter a valid total amount');
      return;
    }
    if (!hasParticipants) {
      setError('Please add at least one participant');
      return;
    }
    if (
      splitMethod === 'custom' &&
      Math.abs(customTotal - numTotal) > 0.01
    ) {
      setError(
        `Custom amounts (${customTotal.toFixed(2)}) must equal the total (${numTotal.toFixed(2)})`,
      );
      return;
    }
    setError(null);
    setStep('confirm');
  }, [isValidTotal, hasParticipants, splitMethod, customTotal, numTotal]);

  const handleConfirm = useCallback(async () => {
    if (!user?.hederaAccountId) {
      setError('Wallet not connected. Please complete onboarding first.');
      return;
    }

    try {
      setError(null);
      await createSplitPayment(
        numTotal,
        currency,
        splitMethod,
        participants.map((p) => p.accountId),
        conversationTopicId,
        note || undefined,
        splitMethod === 'custom' ? customAmountsMap : undefined,
      );
      setSuccess(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to create split payment. Please try again.';
      setError(message);
    }
  }, [
    user?.hederaAccountId,
    createSplitPayment,
    numTotal,
    currency,
    splitMethod,
    participants,
    conversationTopicId,
    note,
    customAmountsMap,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] max-w-[480px] w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 py-[18px] flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-[17px] font-extrabold text-foreground">Split Payment</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Divide a payment among multiple people
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
        <div className="px-5 py-5 overflow-y-auto flex-1">
          {success ? (
            <div className="text-center py-6">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(0,186,124,0.1)] mx-auto mb-4">
                <RiCheckboxCircleLine size={28} className="text-[#00ba7c]" />
              </div>
              <h3 className="text-[17px] font-bold text-foreground mb-2">
                Split Created
              </h3>
              <p className="text-[14px] text-muted-foreground">
                Payment requests for {numTotal.toFixed(2)} {currency} have been
                sent to {participants.length} participant
                {participants.length !== 1 ? 's' : ''}.
              </p>
            </div>
          ) : step === 'input' ? (
            <div className="space-y-4">
              {/* Total Amount */}
              <div className="flex flex-col items-center py-6 border border-border rounded-[14px] gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  {currency}
                </span>
                <input
                  id="split-total"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0"
                  className="text-[26px] font-extrabold text-foreground bg-transparent border-none outline-none text-center w-full caret-primary placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label="Total amount"
                  autoFocus
                />
              </div>

              {/* Currency & Split Method */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between h-[42px] rounded-full border border-border bg-white/[0.04] px-4">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Currency</span>
                  <span className="text-[14px] font-semibold text-foreground">TMUSD</span>
                </div>
                <select
                  id="split-method"
                  value={splitMethod}
                  onChange={(e) => setSplitMethod(e.target.value as 'equal' | 'custom')}
                  className="h-[42px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground focus:outline-none focus:border-white/20 appearance-none"
                >
                  <option value="equal">Equal Split</option>
                  <option value="custom">Custom Amounts</option>
                </select>
              </div>

              {/* Participants */}
              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Participants ({participants.length})
                </p>

                <div className="space-y-2 mb-3">
                  {participants.map((p) => (
                    <div
                      key={p.accountId}
                      className="flex items-center gap-2 border border-border rounded-[10px] px-3 py-2"
                    >
                      <span className="font-mono text-[12px] text-muted-foreground flex-1 truncate">
                        {p.accountId}
                      </span>
                      {splitMethod === 'custom' && (
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={p.customAmount}
                          onChange={(e) =>
                            handleCustomAmountChange(p.accountId, e.target.value)
                          }
                          placeholder="0.00"
                          className="w-20 h-8 rounded-full border border-border bg-white/[0.04] px-3 text-[13px] text-foreground focus:outline-none focus:border-white/20"
                        />
                      )}
                      {splitMethod === 'equal' && isValidTotal && (
                        <span className="text-[12px] text-muted-foreground w-24 text-right">
                          {equalShare.toFixed(2)} {currency}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(p.accountId)}
                        className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-[#e0245e] hover:bg-[rgba(224,36,94,0.1)] transition-colors"
                        aria-label={`Remove ${p.accountId}`}
                      >
                        <RiDeleteBinLine size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add participant */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newParticipantId}
                    onChange={(e) => setNewParticipantId(e.target.value)}
                    placeholder="0.0.12345"
                    className="flex-1 h-[38px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddParticipant();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddParticipant}
                    className="flex items-center justify-center w-[38px] h-[38px] rounded-full border border-border hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Add participant"
                  >
                    <RiAddLine size={16} />
                  </button>
                </div>

                {splitMethod === 'custom' && isValidTotal && (
                  <p
                    className={cn('text-[12px] mt-2', {
                      'text-[#00ba7c]': Math.abs(customTotal - numTotal) <= 0.01,
                      'text-[#e0245e]': Math.abs(customTotal - numTotal) > 0.01,
                    })}
                  >
                    Sum: {customTotal.toFixed(2)} / {numTotal.toFixed(2)} {currency}
                  </p>
                )}
              </div>

              {/* Note */}
              <input
                id="split-note"
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
          ) : (
            /* Confirm step */
            <div className="space-y-4">
              <div className="border border-border rounded-[14px] p-4 space-y-3 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-bold text-foreground">{numTotal.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Split Method</span>
                  <span className="font-semibold text-foreground capitalize">{splitMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Participants</span>
                  <span className="font-semibold text-foreground">{participants.length}</span>
                </div>
                {splitMethod === 'equal' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Each Pays</span>
                    <span className="font-semibold text-foreground">{equalShare.toFixed(2)} {currency}</span>
                  </div>
                )}
                {note && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Note</span>
                    <span className="text-foreground text-right max-w-[60%] truncate">{note}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Breakdown
                </p>
                {participants.map((p) => (
                  <div
                    key={p.accountId}
                    className="flex justify-between items-center text-[13px] border border-border px-3 py-2 rounded-[10px]"
                  >
                    <span className="font-mono text-[12px] text-muted-foreground truncate max-w-[60%]">
                      {p.accountId}
                    </span>
                    <span className="font-semibold text-foreground">
                      {splitMethod === 'equal'
                        ? equalShare.toFixed(2)
                        : (customAmountsMap[p.accountId] ?? 0).toFixed(2)}{' '}
                      {currency}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <p className="text-[13px] text-[#e0245e]">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-[14px] flex gap-2 flex-shrink-0">
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
                  { 'opacity-40 pointer-events-none': !isValidTotal || !hasParticipants || isSending },
                )}
                disabled={!isValidTotal || !hasParticipants || isSending}
                onClick={step === 'input' ? handleReview : handleConfirm}
              >
                {isSending
                  ? 'Creating…'
                  : step === 'input'
                    ? 'Review'
                    : 'Create Split'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
