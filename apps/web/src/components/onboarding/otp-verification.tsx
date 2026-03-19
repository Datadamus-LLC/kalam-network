'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { KalamLogo } from '@/components/ui/KalamLogo';
import { useAuthStore } from '@/stores/auth.store';
import { api, ApiError } from '@/lib/api';
import { createInterval } from '@/lib/timers';

interface OtpVerificationProps {
  registrationId: string;
  identifier: string;
  identifierType: 'email' | 'phone';
  onSuccess: () => void;
  onResend: () => Promise<void>;
}

const OTP_LENGTH = 6;
const COUNTDOWN_SECONDS = 300; // 5 minutes

/**
 * OTP Verification Component — Step 2 of onboarding.
 * Features: 6-digit input with auto-advance, countdown timer, resend button.
 */
export function OtpVerification({
  registrationId,
  identifier,
  identifierType,
  onSuccess,
  onResend,
}: OtpVerificationProps) {
  const { setTokens } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(COUNTDOWN_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  // Track whether auto-submit has been triggered for current OTP value
  const submittedRef = useRef(false);

  // Countdown timer
  useEffect(() => {
    if (timer <= 0) {
      setCanResend(true);
      return;
    }

    const cleanup = createInterval(() => {
      setTimer((t) => t - 1);
    }, 1000);

    return cleanup;
  }, [timer]);

  const handleSubmit = useCallback(async (otpValue: string) => {
    if (otpValue.length !== OTP_LENGTH || submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await api.verifyOtp({
        identifier,
        identifierType,
        otp: otpValue,
      });

      // Store tokens
      setTokens(response.accessToken, response.refreshToken);

      onSuccess();
    } catch (err: unknown) {
      submittedRef.current = false;
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('OTP verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [identifier, identifierType, setTokens, onSuccess]);

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(value);
    setError(null);
    submittedRef.current = false;

    // Auto-submit when 6 digits entered
    if (value.length === OTP_LENGTH && /^\d{6}$/.test(value)) {
      handleSubmit(value);
    }
  };

  const handleManualSubmit = () => {
    if (otp.length === OTP_LENGTH) {
      submittedRef.current = false;
      handleSubmit(otp);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError(null);
    try {
      await onResend();
      setTimer(COUNTDOWN_SECONDS);
      setCanResend(false);
      setOtp('');
      submittedRef.current = false;
    } catch {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const maskedIdentifier =
    `${identifier.slice(0, 3)}***${identifier.slice(identifier.indexOf('@'))}`;

  const isComplete = otp.length === OTP_LENGTH;

  return (
    <div className="w-full max-w-[360px] mx-4">
      {/* Progress bar: step 2 active */}
      <div className="flex gap-1.5 mb-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-[4px] flex-1 rounded-full', i <= 1 ? 'bg-primary' : 'bg-white/[0.12]')} />
        ))}
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <KalamLogo className="h-[40px] w-auto mb-3" />
        <h1 className="text-[22px] font-extrabold text-foreground">Check your email</h1>
        <p className="text-[14px] text-muted-foreground mt-1 text-center">
          Code sent to <span className="text-foreground font-semibold">{maskedIdentifier}</span>
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-4 border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-2.5 rounded-full text-[13px]"
        >
          {error}
        </div>
      )}

      {/* OTP input */}
      <div className="mb-4">
        <label htmlFor="otp-input" className="block text-[13px] font-semibold text-foreground mb-1.5">
          6-Digit Code
        </label>
        <input
          id="otp-input"
          type="text"
          inputMode="numeric"
          placeholder="000000"
          value={otp}
          onChange={handleOtpChange}
          maxLength={OTP_LENGTH}
          className="w-full h-[56px] rounded-full border border-border bg-white/[0.04] px-[18px] text-[24px] font-mono tracking-[0.3em] text-foreground text-center placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
          disabled={loading}
          autoFocus
          autoComplete="one-time-code"
        />
        <p className="mt-1.5 text-[12px] text-muted-foreground text-center">
          Auto-submits when you enter 6 digits
        </p>
      </div>

      {/* Timer */}
      <div className="text-center mb-4 text-[13px]">
        {timer > 0 ? (
          <span className="text-muted-foreground">
            Expires in{' '}
            <span className="text-primary font-mono">{formatTime(timer)}</span>
          </span>
        ) : (
          <span className="text-[#e0245e]">Code expired</span>
        )}
      </div>

      {/* Verify — lemon per spec */}
      <button
        type="button"
        onClick={handleManualSubmit}
        disabled={loading || !isComplete}
        className="w-full h-[46px] rounded-full bg-primary text-black font-semibold text-[15px] hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
      >
        {loading ? 'Verifying…' : 'Verify'}
      </button>

      {/* Resend + Back */}
      <div className="flex items-center justify-between mt-4">
        <Link href="/" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </Link>
        {canResend ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="text-[13px] text-foreground hover:underline disabled:opacity-50"
          >
            {resendLoading ? 'Sending…' : 'Resend Code'}
          </button>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            Resend in {formatTime(timer)}
          </span>
        )}
      </div>
    </div>
  );
}
