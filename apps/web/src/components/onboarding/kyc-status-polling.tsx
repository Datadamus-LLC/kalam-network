'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { RiCheckLine, RiCloseCircleLine } from '@remixicon/react';
import { api, ApiError } from '@/lib/api';
import { delay } from '@/lib/timers';

interface KycStatusPollingProps {
  onApproved: () => void;
  onRejected: () => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes max polling

type PollingStatus = 'pending' | 'approved' | 'rejected' | 'error';

/**
 * KYC Status Polling Component.
 * Spec: Spinner (lemon border-top) + progress steps + success/failure states.
 */
export function KycStatusPolling({
  onApproved,
  onRejected,
}: KycStatusPollingProps) {
  const [status, setStatus] = useState<PollingStatus>('pending');
  const [pollCount, setPollCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function pollLoop() {
      let attempts = 0;

      while (!cancelled && attempts < MAX_POLL_ATTEMPTS) {
        attempts += 1;

        try {
          const response = await api.getKycStatus();

          if (cancelled) return;

          setPollCount(attempts);

          if (response.status === 'approved' || response.status === 'active') {
            setStatus('approved');
            onApproved();
            return;
          } else if (response.status === 'rejected') {
            setStatus('rejected');
            onRejected();
            return;
          }
          // 'submitted' and 'pending_review' continue polling
        } catch (err: unknown) {
          if (cancelled) return;

          // Don't stop polling on transient errors
          if (err instanceof ApiError && err.status >= 500) {
            setErrorMessage('Server error. Retrying…');
          }
          // Silently retry on other errors
        }

        if (!cancelled) {
          await delay(POLL_INTERVAL_MS);
        }
      }
    }

    pollLoop();

    return () => {
      cancelled = true;
    };
  }, [onApproved, onRejected]);

  return (
    <div className="w-full max-w-[400px] mx-4">
      {/* Progress bar: step 4 active */}
      <div className="flex gap-1.5 mb-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-[4px] flex-1 rounded-full', i <= 3 ? 'bg-primary' : 'bg-white/[0.12]')} />
        ))}
      </div>

      <div className="text-center">
        {status === 'pending' && (
          <>
            {/* Lemon spinner per spec */}
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 border-4 border-white/[0.08] border-t-primary rounded-full animate-spin" />
            </div>
            <h2 className="text-[22px] font-extrabold text-foreground mb-2">
              Verifying Identity
            </h2>
            <p className="text-[14px] text-muted-foreground mb-6">
              Please wait while we verify your information…
            </p>

            {/* Progress steps */}
            <div className="space-y-3 text-left max-w-[280px] mx-auto">
              <ProgressStep label="Documents received" completed={pollCount > 0} />
              <ProgressStep label="Identity check" completed={pollCount > 3} active={pollCount <= 3} />
              <ProgressStep label="Compliance screening" completed={pollCount > 6} active={pollCount > 3 && pollCount <= 6} />
              <ProgressStep label="Final review" completed={false} active={pollCount > 6} />
            </div>

            {errorMessage && (
              <p className="text-primary text-[12px] mt-4">{errorMessage}</p>
            )}
            <p className="text-muted-foreground text-[12px] mt-3">
              Checks completed: {pollCount}
            </p>
          </>
        )}

        {status === 'approved' && (
          <>
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/12 mx-auto mb-4">
              <RiCheckLine size={28} className="text-primary" />
            </div>
            <h2 className="text-[22px] font-extrabold text-primary mb-2">
              Verification Complete
            </h2>
            <p className="text-[14px] text-muted-foreground mb-4">
              Your identity has been verified. Minting DID NFT…
            </p>
            <div className="text-[13px] text-muted-foreground animate-pulse">
              Finalizing onboarding…
            </div>
          </>
        )}

        {status === 'rejected' && (
          <>
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[rgba(224,36,94,0.1)] mx-auto mb-4">
              <RiCloseCircleLine size={28} className="text-[#e0245e]" />
            </div>
            <h2 className="text-[22px] font-extrabold text-[#e0245e] mb-2">
              Verification Failed
            </h2>
            <p className="text-[14px] text-muted-foreground">
              Your application was not approved. Please try again with different documents.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ProgressStep({
  label,
  completed,
  active = false,
}: {
  label: string;
  completed: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
          completed
            ? 'bg-primary'
            : active
              ? 'bg-primary/30 animate-pulse'
              : 'bg-white/[0.08]',
        )}
      >
        {completed && <RiCheckLine size={12} className="text-black" />}
      </div>
      <span className={cn(
        'text-[13px]',
        completed ? 'text-primary' : active ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {label}
      </span>
    </div>
  );
}
