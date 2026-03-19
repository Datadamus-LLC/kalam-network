'use client';

import { useState, useCallback } from 'react';
import { RiLockLine, RiCloseLine, RiEyeLine, RiEyeOffLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';

interface PinModalProps {
  mode: 'set' | 'enter';
  onSubmit: (pin: string) => Promise<void>;
  onCancel?: () => void;
  error?: string | null;
  isLoading?: boolean;
}

export function PinModal({ mode, onSubmit, onCancel, error, isLoading }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setLocalError(null);
    if (pin.length < 4) {
      setLocalError('PIN must be at least 4 characters');
      return;
    }
    if (mode === 'set' && pin !== confirm) {
      setLocalError('PINs do not match');
      return;
    }
    await onSubmit(pin);
  }, [pin, confirm, mode, onSubmit]);

  const displayError = error ?? localError;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] w-full max-w-[380px] mx-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <RiLockLine size={20} className="text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-[16px] font-extrabold text-foreground">
              {mode === 'set' ? 'Set Backup PIN' : 'Enter Backup PIN'}
            </h3>
            <p className="text-[12px] text-muted-foreground">
              {mode === 'set'
                ? 'Protects your encryption key on new devices'
                : 'Enter your PIN to restore messages on this device'}
            </p>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
              <RiCloseLine size={20} />
            </button>
          )}
        </div>

        {/* PIN input */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
              placeholder={mode === 'set' ? 'Create a PIN (min 4 chars)' : 'Enter your backup PIN'}
              autoFocus
              className="w-full h-[46px] rounded-full border border-border bg-white/[0.04] px-4 pr-12 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPin ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
            </button>
          </div>

          {mode === 'set' && (
            <input
              type={showPin ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
              placeholder="Confirm PIN"
              className="w-full h-[46px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
            />
          )}

          {displayError && (
            <p className="text-[13px] text-[#e0245e] px-1">{displayError}</p>
          )}

          {mode === 'set' && (
            <p className="text-[11px] text-muted-foreground px-1">
              Remember this PIN — you&apos;ll need it when logging in on new devices. It cannot be recovered.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-5">
          {onCancel && (
            <Button variant="outline" className="flex-1 rounded-full h-[42px]" onClick={onCancel}>
              {mode === 'set' ? 'Skip for now' : 'Cancel'}
            </Button>
          )}
          <Button
            className="flex-1 rounded-full h-[42px]"
            onClick={() => void handleSubmit()}
            disabled={isLoading || pin.length < 4}
          >
            {isLoading ? 'Processing…' : mode === 'set' ? 'Set PIN' : 'Restore'}
          </Button>
        </div>
      </div>
    </div>
  );
}
