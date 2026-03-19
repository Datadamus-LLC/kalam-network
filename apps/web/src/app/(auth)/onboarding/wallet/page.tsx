'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { KalamLogo } from '@/components/ui/KalamLogo';
import { RiCheckboxCircleLine, RiAlertLine } from '@remixicon/react';
import { useAuthStore } from '@/stores/auth.store';
import { api, ApiError } from '@/lib/api';

/**
 * Wallet Creation Page — Step 3 of onboarding.
 * Spec: Spinner (lemon border-top, rotates) + Tamam explanation + account ID pill on success.
 */
export default function WalletPage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, setTokens, setOnboardingStep } = useAuthStore();

  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const createWallet = async () => {
    setCreating(true);
    setError(null);
    setCreated(false);

    try {
      const result = await api.createWallet();

      // Store fresh tokens that include hederaAccountId in the JWT
      setTokens(result.accessToken, result.refreshToken);
      setUser({
        id: user?.id ?? '',
        hederaAccountId: result.hederaAccountId,
        status: 'pending_kyc',
        accountType: user?.accountType ?? null,
        displayName: user?.displayName ?? null,
        username: user?.username ?? null,
        kycLevel: user?.kycLevel ?? null,
      });
      setOnboardingStep('submit_kyc');
      setCreated(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Wallet creation failed. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/register');
      return;
    }

    // Already has a wallet — skip
    if (user?.hederaAccountId) {
      router.push('/onboarding/kyc');
      return;
    }

    createWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated) return null;

  return (
    <div className="w-full max-w-[400px] mx-4">
      {/* Progress bar: step 3 active */}
      <div className="flex gap-1.5 mb-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-[4px] flex-1 rounded-full', i <= 2 ? 'bg-primary' : 'bg-white/[0.12]')} />
        ))}
      </div>

      {/* Logo */}
      <div className="flex justify-center mb-8">
        <KalamLogo className="h-[40px] w-auto" />
      </div>

      {/* Creating state — lemon spinner per spec */}
      {creating && (
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 border-4 border-white/[0.08] border-t-primary rounded-full animate-spin" />
          </div>
          <h2 className="text-[22px] font-extrabold text-foreground mb-2">Creating Wallet</h2>
          <p className="text-[14px] text-muted-foreground">Generating your Hedera account…</p>
          <p className="text-[12px] text-muted-foreground mt-3">
            Powered by Tamam MPC custody — this may take a moment
          </p>
        </div>
      )}

      {/* Error state — only shown when the wallet was NOT created.
          If the Hedera account exists (created && hederaAccountId), the Tamam
          custody step may have partially failed but the wallet is usable;
          in that case the success state below takes exclusive priority. */}
      {error && !(created && user?.hederaAccountId) && (
        <div className="text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(224,36,94,0.1)] mx-auto mb-4">
            <RiAlertLine size={26} className="text-[#e0245e]" />
          </div>
          <h2 className="text-[22px] font-extrabold text-foreground mb-2">Creation Failed</h2>
          <p className="text-[13px] text-[#e0245e] mb-6">{error}</p>
          <button
            type="button"
            onClick={createWallet}
            className="w-full h-[46px] rounded-full bg-primary text-black font-semibold text-[15px] hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Created state — shown whenever the wallet exists, regardless of any
          secondary errors (e.g. Tamam custody registration). Success takes
          exclusive priority: if hederaAccountId is set, the user can proceed. */}
      {created && user?.hederaAccountId && (
        <div className="text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/12 mx-auto mb-4">
            <RiCheckboxCircleLine size={26} className="text-primary" />
          </div>
          <h2 className="text-[22px] font-extrabold text-foreground mb-4">Wallet Created</h2>

          {/* Account ID pill */}
          <div className="border border-border rounded-[14px] p-4 mb-4 text-left">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Hedera Account ID
            </p>
            <p className="text-[14px] font-mono text-primary break-all">
              {user.hederaAccountId}
            </p>
          </div>

          <p className="text-[13px] text-muted-foreground mb-6">
            Your Hedera account is ready. Next: verify your identity.
          </p>
          <button
            type="button"
            onClick={() => router.push('/onboarding/kyc')}
            className="w-full h-[46px] rounded-full bg-primary text-black font-semibold text-[15px] hover:opacity-90 transition-opacity"
          >
            Continue to Verification
          </button>
        </div>
      )}
    </div>
  );
}
