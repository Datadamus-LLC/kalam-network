'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  RiCheckboxCircleLine,
  RiMessage3Line,
  RiBankCardLine,
  RiArticleLine,
  RiTeamLine,
  RiArrowRightLine,
} from '@remixicon/react';
import { useAuthStore } from '@/stores/auth.store';
import { api, ApiError } from '@/lib/api';

/**
 * Onboarding Success Page — Step 5 of onboarding.
 * Spec: All steps lemon, checkmark in lemon-dim circle + account ID + DID NFT pills + Get Started (lemon)
 */
export default function SuccessPage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, setOnboardingStep } = useAuthStore();

  const [profile, setProfile] = useState<Awaited<ReturnType<typeof api.getProfile>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/register');
      return;
    }

    const fetchProfile = async () => {
      try {
        const data = await api.getProfile('me');
        setProfile(data);

        // Update user state with latest data
        setUser({
          id: user?.id ?? '',
          hederaAccountId: data.hederaAccountId,
          status: 'active',
          accountType: data.accountType as 'individual' | 'business',
          displayName: data.displayName,
          username: (data as Record<string, unknown>).username as string | null ?? null,
          kycLevel: data.kycLevel as 'basic' | 'enhanced' | 'institutional' | null,
        });
        setOnboardingStep('success');
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load profile. You can still enter the app.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isAuthenticated, router, user?.id, setUser, setOnboardingStep]);

  const handleContinue = () => {
    router.push('/feed');
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="w-full max-w-[400px] mx-4">
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={cn('h-[4px] flex-1 rounded-full bg-primary')} />
          ))}
        </div>
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-white/[0.08] border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-[14px] text-muted-foreground">Loading your profile…</p>
        </div>
      </div>
    );
  }

  const FEATURES = [
    { icon: RiMessage3Line, title: 'Messaging', description: 'E2E encrypted chats' },
    { icon: RiBankCardLine, title: 'Payments', description: 'Send TMUSD instantly' },
    { icon: RiArticleLine, title: 'Posts', description: 'Share with followers' },
    { icon: RiTeamLine, title: 'Network', description: 'Build your community' },
  ];

  return (
    <div className="w-full max-w-[440px] mx-4">
      {/* Progress bar: all steps lemon per spec */}
      <div className="flex gap-1.5 mb-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[4px] flex-1 rounded-full bg-primary" />
        ))}
      </div>

      {/* Checkmark in lemon-dim circle per spec */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/12 mx-auto mb-4">
          <RiCheckboxCircleLine size={32} className="text-primary" />
        </div>
        <h1 className="text-[24px] font-extrabold text-foreground mb-1">
          You're all set
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Your blockchain identity is ready
        </p>
      </div>

      {/* Warning for non-critical errors */}
      {error && (
        <div
          role="alert"
          className="mb-4 border border-primary/20 bg-primary/6 text-primary px-4 py-2.5 rounded-full text-[13px]"
        >
          {error}
        </div>
      )}

      {profile && (
        <>
          {/* Account ID + DID NFT info pills per spec */}
          <div className="border border-border rounded-[14px] p-4 mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center text-foreground font-bold text-[16px] flex-shrink-0">
                {profile.displayName?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className="text-[15px] font-bold text-foreground">{profile.displayName ?? 'New User'}</p>
                <p className="text-[12px] text-muted-foreground capitalize">{profile.accountType} Account</p>
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Account ID</p>
                <span className="text-[12px] font-mono bg-primary/12 text-primary px-[10px] py-[3px] rounded-full">
                  {profile.hederaAccountId}
                </span>
              </div>

              {profile.didNft && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">DID NFT</p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[11px] bg-[rgba(0,186,124,0.1)] text-[#00ba7c] px-[8px] py-[3px] rounded-full font-semibold">
                      {profile.didNft.serialNumber ? `#${profile.didNft.serialNumber}` : profile.didNft.tokenId ? `Token ${profile.didNft.tokenId}` : 'DID NFT Minted'}
                    </span>
                    {profile.kycLevel && (
                      <span className="text-[11px] bg-[rgba(0,186,124,0.1)] text-[#00ba7c] px-[8px] py-[3px] rounded-full font-semibold capitalize">
                        KYC: {profile.kycLevel}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Feature cards with remixicon icons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="border border-border rounded-[12px] p-3">
                <Icon size={20} className="text-muted-foreground mb-1.5" />
                <p className="text-[13px] font-semibold text-foreground">{title}</p>
                <p className="text-[12px] text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Get Started — lemon per spec */}
      <button
        type="button"
        onClick={handleContinue}
        className="w-full h-[48px] rounded-full bg-primary text-black font-semibold text-[16px] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        Get Started
        <RiArrowRightLine size={18} />
      </button>

      <p className="text-center text-[12px] text-muted-foreground mt-4">
        Your blockchain identity is permanent and verifiable on Hedera
      </p>
    </div>
  );
}
