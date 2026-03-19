'use client';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { KalamLogo } from '@/components/ui/KalamLogo';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { api, ApiError } from '@/lib/api';
import { OtpVerification } from '@/components/onboarding/otp-verification';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, setRegistrationInfo } = useAuthStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) router.push('/feed');
  }, [isAuthenticated, router]);

  const handleOtpSuccess = useCallback(() => {
    router.push('/feed');
  }, [router]);

  const handleResend = useCallback(async () => {
    const response = await api.login({ method: 'email', value: email.trim() });
    setRegistrationId(response.registrationId);
    setRegistrationInfo(response.registrationId, 'email', email.trim());
  }, [email, setRegistrationInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.login({ method: 'email', value: email.trim() });
      setRegistrationId(response.registrationId);
      setRegistrationInfo(response.registrationId, 'email', email.trim());
      setOtpSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('No account found with this email. Please register first.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to send code');
      }
    } finally {
      setLoading(false);
    }
  };

  if (otpSent && registrationId) {
    return (
      <OtpVerification
        registrationId={registrationId}
        identifier={email}
        identifierType="email"
        onSuccess={handleOtpSuccess}
        onResend={handleResend}
      />
    );
  }

  return (
    <div className="w-full max-w-[400px] mx-4">
      <div className="flex justify-center mb-8">
        <Link href="/">
          <KalamLogo className="h-[40px] w-auto" />
        </Link>
      </div>
      <h1 className="text-[22px] font-extrabold text-foreground text-center mb-1">Welcome back</h1>
      <p className="text-[14px] text-muted-foreground text-center mb-8">Sign in to your account</p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label className="block text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="your@example.com"
            className="w-full h-[48px] rounded-full border border-border bg-white/[0.04] px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/25 transition-colors"
            autoComplete="email"
          />
        </div>
        {error && <p className="text-[13px] text-[#e0245e] mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full h-[48px] rounded-full bg-primary text-primary-foreground font-semibold text-[15px] disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {loading ? 'Sending code…' : 'Sign In'}
        </button>
      </form>

      <p className="text-[13px] text-muted-foreground text-center mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-semibold text-foreground hover:opacity-80">Register</Link>
      </p>
    </div>
  );
}
