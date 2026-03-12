# P1-T13: Frontend Registration & Onboarding UI

| Field | Value |
|-------|-------|
| Task ID | P1-T13 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 6 hours |
| Depends On | P0-T07 (Next.js Setup), P1-T09/T10/T11/T12 (All backend endpoints) |
| Phase | 1 — Identity & Onboarding |
| Assignee | Frontend Developer (React/Next.js) |
| Module | Identity & Onboarding (UI/UX) |
| Tech Stack | Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand, SWR |

---

## Objective

Build the complete user-facing registration and onboarding flow: email/phone input → OTP verification → wallet creation → KYC form → success screen. Include loading states, error handling, form validation, and state management using Zustand. Wire all frontend components to backend APIs created in P1-T09 through P1-T12.

---

## Background

**User Journey:**
1. Registration Page: Enter email or phone
2. OTP Page: Enter 6-digit code with auto-advance, countdown timer, resend button
3. Wallet Waiting Screen: Show loading, poll for wallet creation
4. KYC Page: Select account type (individual/business), fill forms, upload documents
5. KYC Polling: Poll backend for screening status, show progress
6. Success Page: Show DID NFT details, Hedera Account ID, onboarding complete
7. App Layout: Sidebar navigation once onboarded

**State Management:**
- Zustand store for auth state (JWT, user status, onboarding progress)
- SWR for API data fetching with caching
- Local React state for form data and loading states

**Styling:**
- Tailwind CSS for responsive design
- Mobile-first approach (works on phone/tablet)
- Dark mode support (optional, nice to have)

**Form Validation:**
- Email format validation (regex or library)
- Phone format validation (E.164)
- 6-digit OTP validation
- Required field validation

**Error Handling:**
- Display API error messages to user
- Retry buttons for failed operations
- Clear error state when user retries

---

## Pre-requisites

Before you start, make sure:

1. **P0-T07 Complete** — Next.js app structure exists at `apps/web`
2. **Backend Running** — All P1-T09/T10/T11/T12 endpoints deployed and accessible
3. **Dependencies Installed**:
   ```bash
   cd apps/web
   pnpm add zustand swr axios react-hook-form zod next-themes
   pnpm add -D tailwindcss postcss autoprefixer @types/node
   ```
4. **Environment Variables** (`.env.local`):
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_APP_NAME=Hedera Social
   ```
5. **Tailwind CSS** — Configured with `tailwind.config.ts` and `globals.css`

---

## Step-by-Step Instructions

### Step 1: Create Zustand Auth Store

Create file `apps/web/src/stores/auth.store.ts`:

```typescript
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

/**
 * Zustand Auth Store
 * Manages: JWT tokens, user status, onboarding progress
 * Persists to localStorage automatically
 */

export interface AuthState {
  // Tokens
  accessToken: string | null;
  refreshToken: string | null;

  // User Info
  userId: string | null;
  hederaAccountId: string | null;
  status: 'pending_wallet' | 'pending_kyc' | 'active' | null;
  email?: string;
  phone?: string;

  // Onboarding Progress
  registrationStep: 'idle' | 'register' | 'verify_otp' | 'create_wallet' | 'submit_kyc' | 'success';
  screeningId?: string;
  kycStatus?: 'pending' | 'approved' | 'rejected';

  // Actions
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (userId: string, hederaAccountId: string | null, status: AuthState['registrationStep'], email?: string, phone?: string) => void;
  setRegistrationStep: (step: AuthState['registrationStep']) => void;
  setKycStatus: (status: 'pending' | 'approved' | 'rejected', screeningId?: string) => void;
  logout: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        accessToken: null,
        refreshToken: null,
        userId: null,
        hederaAccountId: null,
        status: null,
        registrationStep: 'idle',
        kycStatus: undefined,

        // Actions
        setTokens: (accessToken, refreshToken) =>
          set({
            accessToken,
            refreshToken,
            registrationStep: 'register',
          }),

        setUser: (userId, hederaAccountId, status, email, phone) =>
          set({
            userId,
            hederaAccountId,
            status,
            email,
            phone,
          }),

        setRegistrationStep: (step) =>
          set({ registrationStep: step }),

        setKycStatus: (status, screeningId) =>
          set({
            kycStatus: status,
            screeningId,
          }),

        logout: () =>
          set({
            accessToken: null,
            refreshToken: null,
            userId: null,
            hederaAccountId: null,
            status: null,
            registrationStep: 'idle',
          }),

        reset: () =>
          set({
            accessToken: null,
            refreshToken: null,
            userId: null,
            hederaAccountId: null,
            status: null,
            email: undefined,
            phone: undefined,
            registrationStep: 'idle',
            screeningId: undefined,
            kycStatus: undefined,
          }),
      }),
      {
        name: 'auth-store',
        // Persist to localStorage
        storage: typeof window !== 'undefined' ? localStorage : undefined,
      },
    ),
  ),
);
```

### Step 2: Create API Client

Create file `apps/web/src/lib/api.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

/**
 * API Client with automatic JWT injection
 * Attaches accessToken to all requests
 * Handles token refresh on 401 response
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: add JWT token
  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response interceptor: handle 401, refresh token
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const refreshToken = useAuthStore.getState().refreshToken;
          if (refreshToken) {
            const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
              refreshToken,
            });

            const { accessToken } = response.data;
            useAuthStore.getState().setTokens(accessToken, refreshToken);

            // Retry original request with new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return client(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed, logout user
          useAuthStore.getState().logout();
          throw refreshError;
        }
      }

      return Promise.reject(error);
    },
  );

  return client;
};

export const apiClient = createApiClient();

/**
 * API endpoints
 */

export const authApi = {
  register: (email: string | null, phone: string | null) =>
    apiClient.post('/api/v1/auth/register', { email, phone }),

  verifyOtp: (email: string | null, phone: string | null, otp: string) =>
    apiClient.post('/api/v1/auth/verify-otp', {
      email,
      phone,
      otp,
    }),

  refresh: (refreshToken: string) =>
    apiClient.post('/api/v1/auth/refresh', { refreshToken }),
};

export const walletApi = {
  create: () => apiClient.post('/api/v1/wallet/create', {}),

  getInfo: (accountId: string) =>
    apiClient.get(`/api/v1/wallet/info/${accountId}`),

  getMirrorNode: (accountId: string) =>
    apiClient.get(`/api/v1/wallet/mirror/${accountId}`),
};

export const kycApi = {
  submitIndividual: (formData: FormData) =>
    apiClient.post('/api/v1/kyc/individual', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  submitBusiness: (formData: FormData) =>
    apiClient.post('/api/v1/kyc/business', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getStatus: (screeningId: string) =>
    apiClient.post('/api/v1/kyc/status/:screeningId', { screeningId }),
};

export const profileApi = {
  getPublic: (accountId: string) =>
    apiClient.get(`/api/v1/profile/${accountId}`),

  getOwn: () => apiClient.get('/api/v1/profile/me'),

  update: (formData: FormData) =>
    apiClient.put('/api/v1/profile/me', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  search: (query: string, limit: number = 20) =>
    apiClient.get('/api/v1/users/search', { params: { q: query, limit } }),
};
```

### Step 3: Create Registration Page

Create file `apps/web/src/app/register/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/lib/api';
import OtpPage from './otp';

/**
 * Registration Page
 * Step 1: User enters email or phone
 * Then redirected to OTP verification
 */

export default function RegisterPage() {
  const router = useRouter();
  const authStore = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState<'email' | 'phone'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);

  // If already registered, redirect to onboarding
  if (authStore.accessToken && authStore.status === 'pending_wallet') {
    router.push('/onboarding/wallet');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate input
      if (!identifier) {
        throw new Error('Please enter email or phone number');
      }

      if (identifierType === 'email' && !identifier.includes('@')) {
        throw new Error('Invalid email address');
      }

      if (identifierType === 'phone' && !identifier.startsWith('+')) {
        throw new Error('Phone must start with +');
      }

      // Send registration request
      const response = await authApi.register(
        identifierType === 'email' ? identifier : null,
        identifierType === 'phone' ? identifier : null,
      );

      setIsOtpSent(true);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const message = apiErr.response?.data?.message || apiErr.message || 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // If OTP sent, show OTP page
  if (isOtpSent) {
    return (
      <OtpPage
        identifier={identifier}
        identifierType={identifierType}
        onSuccess={() => {
          // Redirect to wallet creation
          router.push('/onboarding/wallet');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Hedera Social</h1>
          <p className="text-gray-400">Your blockchain identity starts here</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          <h2 className="text-2xl font-bold text-white mb-6">Register</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identifier Type Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setIdentifierType('email')}
                className={`flex-1 py-2 px-4 rounded font-medium transition ${
                  identifierType === 'email'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setIdentifierType('phone')}
                className={`flex-1 py-2 px-4 rounded font-medium transition ${
                  identifierType === 'phone'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                }`}
              >
                Phone
              </button>
            </div>

            {/* Input Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {identifierType === 'email' ? 'Email Address' : 'Phone Number'}
              </label>
              <input
                type={identifierType === 'email' ? 'email' : 'tel'}
                placeholder={
                  identifierType === 'email'
                    ? 'your@example.com'
                    : '+1-555-555-5555'
                }
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">
                {identifierType === 'phone' && 'Use E.164 format (e.g., +1-555-555-5555)'}
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !identifier}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition"
            >
              {loading ? 'Sending OTP...' : 'Continue'}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-gray-400 text-sm">
            Already have an account?{' '}
            <a href="/login" className="text-blue-400 hover:text-blue-300">
              Log in
            </a>
          </p>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-slate-700/50 rounded-lg p-4 border border-slate-600">
          <p className="text-gray-300 text-sm">
            <strong>Hackathon Demo:</strong> OTP will be printed in browser console. This is normal for testing.
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Create OTP Verification Page

Create file `apps/web/src/app/register/otp.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/lib/api';

interface OtpPageProps {
  identifier: string;
  identifierType: 'email' | 'phone';
  onSuccess: () => void;
}

/**
 * OTP Verification Page
 * Step 2: User enters 6-digit code
 * Features: Auto-advance on 6 digits, countdown timer, resend button
 */

export default function OtpPage({ identifier, identifierType, onSuccess }: OtpPageProps) {
  const authStore = useAuthStore();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((t) => t - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCanResend(true);
    }
  }, [timer]);

  // Auto-submit when OTP reaches 6 digits
  useEffect(() => {
    if (otp.length === 6 && /^\d{6}$/.test(otp)) {
      handleSubmit();
    }
  }, [otp]);

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
    setError('');
  };

  const handleSubmit = async () => {
    if (otp.length !== 6) {
      setError('OTP must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authApi.verifyOtp(
        identifierType === 'email' ? identifier : null,
        identifierType === 'phone' ? identifier : null,
        otp,
      );

      const { accessToken, refreshToken, hederaAccountId, status } = response.data;

      // Store tokens and user info
      authStore.setTokens(accessToken, refreshToken);
      authStore.setUser('', hederaAccountId, status, identifier);
      authStore.setRegistrationStep('verify_otp');

      // VIOLATION: setTimeout used as state-update workaround — call onSuccess immediately (use callback pattern or useEffect if state sync needed)
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const message = apiErr.response?.data?.message || 'OTP verification failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await authApi.register(
        identifierType === 'email' ? identifier : null,
        identifierType === 'phone' ? identifier : null,
      );
      setTimer(300);
      setCanResend(false);
      setOtp('');
      setError('');
    } catch (_err: unknown) {
      setError('Failed to resend OTP');
    } finally {
      setResendLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md mx-4">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          <h2 className="text-2xl font-bold text-white mb-2">Verify OTP</h2>
          <p className="text-gray-400 mb-6">Enter the code sent to {identifier}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* OTP Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              6-Digit Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={otp}
              onChange={handleOtpChange}
              maxLength={6}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded text-white text-2xl tracking-widest text-center placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
            <p className="mt-2 text-xs text-gray-500">
              Auto-submits when you enter 6 digits
            </p>
          </div>

          {/* Timer */}
          <div className="text-center mb-6">
            <p className="text-sm text-gray-400">
              {timer > 0 ? (
                <>
                  Code expires in <span className="text-blue-400 font-mono">{formatTime(timer)}</span>
                </>
              ) : (
                <span className="text-red-400">Code expired</span>
              )}
            </p>
          </div>

          {/* Resend Button */}
          <div className="text-center mb-6">
            {canResend ? (
              <button
                onClick={handleResend}
                disabled={resendLoading}
                className="text-blue-400 hover:text-blue-300 disabled:text-gray-500 text-sm font-medium"
              >
                {resendLoading ? 'Sending...' : 'Resend Code'}
              </button>
            ) : (
              <p className="text-gray-500 text-sm">
                Resend available in {formatTime(timer)}
              </p>
            )}
          </div>

          {/* Hidden Submit (triggered by auto-advance or Enter key) */}
          <button
            onClick={handleSubmit}
            disabled={loading || otp.length !== 6}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </div>

        {/* Info */}
        <div className="mt-6 bg-slate-700/50 rounded-lg p-4 border border-slate-600">
          <p className="text-gray-300 text-sm">
            <strong>Hackathon:</strong> Check browser console for the OTP code
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Step 5: Create Wallet Creation Page

Create file `apps/web/src/app/onboarding/wallet/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { walletApi } from '@/lib/api';

/**
 * Wallet Creation Page
 * Step 3: Create Hedera wallet (auto-triggered)
 * Shows: Loading state, transaction details, account ID
 */

export default function WalletPage() {
  const router = useRouter();
  const authStore = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [walletData, setWalletData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!authStore.accessToken) {
      router.push('/register');
      return;
    }

    createWallet();
  }, [authStore.accessToken]);

  const createWallet = async () => {
    try {
      const response = await walletApi.create();
      setWalletData(response.data);

      // Update auth store with account ID
      authStore.setUser(
        authStore.userId || '',
        response.data.hederaAccountId,
        'pending_kyc',
      );
      authStore.setRegistrationStep('create_wallet');

      // VIOLATION: setTimeout used as state-update workaround — navigate immediately (use useEffect if state sync needed)
      router.push('/onboarding/kyc');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const message = apiErr.response?.data?.message || 'Wallet creation failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md mx-4">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          {loading && !error ? (
            <>
              <div className="flex justify-center mb-6">
                <div className="w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                Creating Wallet
              </h2>
              <p className="text-gray-400 text-center">
                Generating your Hedera account...
              </p>
            </>
          ) : error ? (
            <>
              <div className="text-center">
                <div className="mb-4 text-4xl">❌</div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Creation Failed
                </h2>
                <p className="text-red-400 mb-6">{error}</p>
                <button
                  onClick={createWallet}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition"
                >
                  Try Again
                </button>
              </div>
            </>
          ) : walletData ? (
            <>
              <div className="text-center">
                <div className="mb-4 text-4xl">✅</div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Wallet Created!
                </h2>

                <div className="bg-slate-700/50 rounded-lg p-4 mb-4 border border-slate-600">
                  <p className="text-gray-400 text-xs mb-2">Hedera Account ID</p>
                  <p className="text-blue-400 font-mono text-lg break-all">
                    {walletData.hederaAccountId}
                  </p>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 mb-4 border border-slate-600">
                  <p className="text-gray-400 text-xs mb-2">Transaction ID</p>
                  <p className="text-green-400 font-mono text-sm break-all">
                    {walletData.transactionId}
                  </p>
                </div>

                <p className="text-gray-400 text-sm">
                  Proceeding to identity verification...
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

### Step 6: Create KYC Form Page

Create file `apps/web/src/app/onboarding/kyc/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { kycApi } from '@/lib/api';
import KycStatusPolling from '@/components/kyc-status-polling';

/**
 * KYC Page
 * Step 4: Submit KYC/KYB form
 * Features: Account type selection, form validation, document upload, progress polling
 */

export default function KycPage() {
  const router = useRouter();
  const authStore = useAuthStore();
  const [accountType, setAccountType] = useState<'individual' | 'business'>('individual');
  const [submitted, setSubmitted] = useState(false);
  const [screeningId, setScreeningId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form data
  const [formData, setFormData] = useState({
    // Individual
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    nationality: 'US',
    documentType: 'passport',
    documentNumber: '',
    documentImage: null as File | null,

    // Business
    companyName: '',
    registrationNumber: '',
    businessCategory: '',
    authorizedRepName: '',
    businessDocument: null as File | null,
  });

  if (!authStore.accessToken || authStore.status !== 'pending_kyc') {
    router.push('/register');
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    if (e.target.files?.[0]) {
      setFormData((prev) => ({
        ...prev,
        [fieldName]: e.target.files![0],
      }));
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const form = new FormData();

      if (accountType === 'individual') {
        if (!formData.firstName || !formData.lastName || !formData.documentImage) {
          throw new Error('Please fill all required fields');
        }

        form.append('firstName', formData.firstName);
        form.append('lastName', formData.lastName);
        form.append('dateOfBirth', formData.dateOfBirth);
        form.append('nationality', formData.nationality);
        form.append('documentType', formData.documentType);
        form.append('documentNumber', formData.documentNumber);
        form.append('documentImage', formData.documentImage);

        const response = await kycApi.submitIndividual(form);
        setScreeningId(response.data.screeningId);
        authStore.setKycStatus('pending', response.data.screeningId);
      } else {
        if (!formData.companyName || !formData.registrationNumber || !formData.businessDocument) {
          throw new Error('Please fill all required fields');
        }

        form.append('companyName', formData.companyName);
        form.append('registrationNumber', formData.registrationNumber);
        form.append('businessCategory', formData.businessCategory);
        form.append('authorizedRepName', formData.authorizedRepName);
        form.append('businessDocument', formData.businessDocument);

        const response = await kycApi.submitBusiness(form);
        setScreeningId(response.data.screeningId);
        authStore.setKycStatus('pending', response.data.screeningId);
      }

      setSubmitted(true);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const message = apiErr.response?.data?.message || apiErr.message || 'KYC submission failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // If submitted, show polling screen
  if (submitted && screeningId) {
    return (
      <KycStatusPolling
        screeningId={screeningId}
        onApproved={() => {
          router.push('/onboarding/success');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8">
      <div className="w-full max-w-2xl mx-4">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          <h2 className="text-2xl font-bold text-white mb-2">Identity Verification</h2>
          <p className="text-gray-400 mb-6">
            Complete KYC/KYB to activate your account
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Account Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Account Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccountType('individual')}
                className={`py-3 px-4 rounded font-medium transition ${
                  accountType === 'individual'
                    ? 'bg-blue-600 text-white border-2 border-blue-400'
                    : 'bg-slate-700 text-gray-300 border-2 border-slate-600 hover:border-slate-500'
                }`}
              >
                👤 Individual
              </button>
              <button
                type="button"
                onClick={() => setAccountType('business')}
                className={`py-3 px-4 rounded font-medium transition ${
                  accountType === 'business'
                    ? 'bg-blue-600 text-white border-2 border-blue-400'
                    : 'bg-slate-700 text-gray-300 border-2 border-slate-600 hover:border-slate-500'
                }`}
              >
                🏢 Business
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmitKyc}>
            {accountType === 'individual' ? (
              <>
                {/* Individual Form */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      placeholder="John"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      placeholder="Doe"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Nationality
                    </label>
                    <select
                      name="nationality"
                      value={formData.nationality}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                    >
                      <option>US</option>
                      <option>GB</option>
                      <option>CA</option>
                      <option>AU</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Document Type
                    </label>
                    <select
                      name="documentType"
                      value={formData.documentType}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="passport">Passport</option>
                      <option value="driver_license">Driver License</option>
                      <option value="national_id">National ID</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Document Number
                    </label>
                    <input
                      type="text"
                      name="documentNumber"
                      value={formData.documentNumber}
                      onChange={handleInputChange}
                      placeholder="ABC123456"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Document Image *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, 'documentImage')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-gray-400 focus:outline-none focus:border-blue-500"
                    required
                  />
                  {formData.documentImage && (
                    <p className="mt-2 text-sm text-green-400">
                      ✓ {formData.documentImage.name}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Business Form */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    placeholder="Acme Inc."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Registration Number *
                    </label>
                    <input
                      type="text"
                      name="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={handleInputChange}
                      placeholder="REG123456"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Business Category
                    </label>
                    <input
                      type="text"
                      name="businessCategory"
                      value={formData.businessCategory}
                      onChange={handleInputChange}
                      placeholder="Technology"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Authorized Representative
                  </label>
                  <input
                    type="text"
                    name="authorizedRepName"
                    value={formData.authorizedRepName}
                    onChange={handleInputChange}
                    placeholder="John Smith"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Business Document *
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => handleFileChange(e, 'businessDocument')}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-gray-400 focus:outline-none focus:border-blue-500"
                    required
                  />
                  {formData.businessDocument && (
                    <p className="mt-2 text-sm text-green-400">
                      ✓ {formData.businessDocument.name}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition"
            >
              {loading ? 'Submitting...' : 'Submit for Verification'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

### Step 7: Create KYC Status Polling Component

Create file `apps/web/src/components/kyc-status-polling.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { kycApi } from '@/lib/api';

interface KycStatusPollingProps {
  screeningId: string;
  onApproved: () => void;
}

/**
 * KYC Status Polling Component
 * Polls backend for KYC status every 2 seconds
 * Shows: pending, approved, or rejected status with animations
 */

export default function KycStatusPolling({ screeningId, onApproved }: KycStatusPollingProps) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'unknown'>('pending');
  const [pollingCount, setPollingCount] = useState(0);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await kycApi.getStatus(screeningId);
        const newStatus = response.data.status;
        setStatus(newStatus);
        setPollingCount((c) => c + 1);

        if (newStatus === 'approved') {
          clearInterval(pollInterval);
          // VIOLATION: setTimeout used as state-update workaround — call onApproved immediately
          onApproved();
        } else if (newStatus === 'rejected') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        // Error silently handled — polling continues on next interval
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [screeningId, onApproved]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md mx-4">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700 text-center">
          {status === 'pending' && (
            <>
              <div className="mb-4">
                <div className="inline-block">
                  <div className="w-16 h-16 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Verifying Identity</h2>
              <p className="text-gray-400">
                Please wait while we verify your information...
              </p>
              <p className="text-gray-500 text-xs mt-4">
                Checks completed: {pollingCount}
              </p>
            </>
          )}

          {status === 'approved' && (
            <>
              <div className="mb-4 text-5xl">🎉</div>
              <h2 className="text-2xl font-bold text-green-400 mb-2">
                Verification Complete!
              </h2>
              <p className="text-gray-400 mb-4">
                Your identity has been verified. Minting DID NFT...
              </p>
              <div className="animate-pulse text-gray-500">
                Finalizing onboarding...
              </div>
            </>
          )}

          {status === 'rejected' && (
            <>
              <div className="mb-4 text-5xl">❌</div>
              <h2 className="text-2xl font-bold text-red-400 mb-2">
                Verification Failed
              </h2>
              <p className="text-gray-400">
                Your application was not approved. Please try again with different documents.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 8: Create Success Page

Create file `apps/web/src/app/onboarding/success/page.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { profileApi } from '@/lib/api';
import { useState } from 'react';

/**
 * Onboarding Success Page
 * Step 5: User fully onboarded
 * Shows: DID NFT details, Hedera Account ID, ready to use platform
 */

export default function SuccessPage() {
  const router = useRouter();
  const authStore = useAuthStore();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authStore.accessToken || authStore.status !== 'active') {
      router.push('/register');
      return;
    }

    // Fetch user's profile
    profileApi
      .getOwn()
      .then((response) => {
        setProfile(response.data);
      })
      .catch(() => {
        // Error silently handled via error boundary and initial empty state
      })
      .finally(() => setLoading(false));
  }, [authStore.accessToken, authStore.status]);

  const handleContinue = () => {
    router.push('/app');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8">
      <div className="w-full max-w-2xl mx-4">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 border border-slate-700">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎊</div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Welcome to Hedera Social!
            </h1>
            <p className="text-gray-400">Your blockchain identity is ready</p>
          </div>

          {profile && (
            <>
              {/* Profile Card */}
              <div className="bg-slate-700/50 rounded-lg p-6 mb-6 border border-slate-600">
                <div className="flex items-center gap-4 mb-6">
                  {profile.avatarUrl && (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {profile.displayName}
                    </h2>
                    <p className="text-gray-400 text-sm">
                      {profile.accountType === 'individual' ? '👤 Individual' : '🏢 Business'}
                    </p>
                  </div>
                </div>

                {/* Account Details */}
                <div className="space-y-4">
                  <div className="bg-slate-800 rounded p-4">
                    <p className="text-gray-400 text-xs mb-1">Hedera Account ID</p>
                    <p className="text-blue-400 font-mono break-all">
                      {profile.hederaAccountId}
                    </p>
                  </div>

                  <div className="bg-slate-800 rounded p-4">
                    <p className="text-gray-400 text-xs mb-1">DID NFT Serial</p>
                    <p className="text-green-400 font-bold">#{profile.didNft.serial}</p>
                  </div>

                  <div className="bg-slate-800 rounded p-4">
                    <p className="text-gray-400 text-xs mb-1">KYC Level</p>
                    <p className="text-purple-400 font-semibold capitalize">
                      {profile.kycLevel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                  <div className="text-2xl mb-2">💬</div>
                  <p className="text-sm font-medium text-white">Messaging</p>
                  <p className="text-xs text-gray-400">E2E encrypted chats</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                  <div className="text-2xl mb-2">🔄</div>
                  <p className="text-sm font-medium text-white">Payments</p>
                  <p className="text-xs text-gray-400">Send HBAR instantly</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                  <div className="text-2xl mb-2">📢</div>
                  <p className="text-sm font-medium text-white">Posts</p>
                  <p className="text-xs text-gray-400">Share with followers</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                  <div className="text-2xl mb-2">👥</div>
                  <p className="text-sm font-medium text-white">Network</p>
                  <p className="text-xs text-gray-400">Build your community</p>
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                <p className="text-blue-300 text-sm">
                  <strong>Next:</strong> Complete your profile, follow users, and start messaging!
                </p>
              </div>
            </>
          )}

          {/* Button */}
          <button
            onClick={handleContinue}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            Enter App
            <span>→</span>
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-6">
          Your blockchain identity is permanent and verifiable on Hedera
        </p>
      </div>
    </div>
  );
}
```

### Step 9: Create App Layout with Sidebar

Create file `apps/web/src/app/app/layout.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import Sidebar from '@/components/sidebar';

/**
 * Main App Layout
 * Authenticated pages use this layout
 * Includes sidebar navigation
 */

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const authStore = useAuthStore();

  useEffect(() => {
    if (!authStore.accessToken) {
      router.push('/register');
    }
  }, [authStore.accessToken]);

  if (!authStore.accessToken) {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

Create file `apps/web/src/components/sidebar.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Sidebar Navigation
 * Links to: Chat, Feed, Profile, Settings
 */

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const authStore = useAuthStore();

  const links = [
    { label: 'Chat', href: '/app/chat', icon: '💬' },
    { label: 'Feed', href: '/app/feed', icon: '📢' },
    { label: 'Profile', href: '/app/profile', icon: '👤' },
    { label: 'Settings', href: '/app/settings', icon: '⚙️' },
  ];

  const handleLogout = () => {
    authStore.logout();
    router.push('/');
  };

  return (
    <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-white">Hedera</h1>
        <p className="text-xs text-gray-400 mt-1">Social</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-4 py-3 rounded-lg font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-slate-700'
              }`}
            >
              <span className="mr-2">{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-slate-700 space-y-3">
        <div className="px-4 py-2">
          <p className="text-xs text-gray-400">Account</p>
          <p className="text-sm text-white font-mono truncate">
            {authStore.hederaAccountId}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg text-sm font-medium transition"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
```

### Step 10: Create Placeholder App Pages

Create file `apps/web/src/app/app/chat/page.tsx`:

```typescript
'use client';

export default function ChatPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-4">Messages</h1>
      <p className="text-gray-400">Coming soon...</p>
    </div>
  );
}
```

Create file `apps/web/src/app/app/feed/page.tsx`:

```typescript
'use client';

export default function FeedPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-4">Feed</h1>
      <p className="text-gray-400">Coming soon...</p>
    </div>
  );
}
```

Create file `apps/web/src/app/app/profile/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { profileApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

export default function ProfilePage() {
  const authStore = useAuthStore();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    profileApi
      .getOwn()
      .then((res) => setProfile(res.data))
      .catch(() => {
        // Error silently handled via error boundary and initial empty state
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8"><p className="text-gray-400">Loading...</p></div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-4">Your Profile</h1>
      {profile && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 max-w-2xl">
          <div className="flex items-center gap-4 mb-6">
            {profile.avatarUrl && (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="w-20 h-20 rounded-full object-cover"
              />
            )}
            <div>
              <h2 className="text-2xl font-bold text-white">{profile.displayName}</h2>
              <p className="text-gray-400">{profile.bio}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-700/50 rounded p-4">
              <p className="text-gray-400 text-sm">Followers</p>
              <p className="text-2xl font-bold text-white">{profile.stats.followers}</p>
            </div>
            <div className="bg-slate-700/50 rounded p-4">
              <p className="text-gray-400 text-sm">Following</p>
              <p className="text-2xl font-bold text-white">{profile.stats.following}</p>
            </div>
            <div className="bg-slate-700/50 rounded p-4">
              <p className="text-gray-400 text-sm">Posts</p>
              <p className="text-2xl font-bold text-white">{profile.stats.posts}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Verification Steps

| # | Command | Expected Output |
|---|---------|-----------------|
| 1 | `cd apps/web && pnpm dev` | Next.js server starts on http://localhost:3000 |
| 2 | Navigate to `http://localhost:3000/register` | Registration page loads with email/phone tabs |
| 3 | Enter email, click Continue | Request sent to backend, OTP page loads |
| 4 | **Check backend logs** for OTP | Shows: `HACKATHON OTP for your@email.com: OTP CODE: XXXXXX` |
| 5 | Enter 6-digit OTP | Auto-advances, shows wallet creation loading |
| 6 | **Watch progress** | Shows: wallet creation → KYC form → success page |
| 7 | **On KYC page** | Can select individual/business, fill forms, upload documents |
| 8 | Submit KYC | Shows polling screen with "Verifying Identity..." |
| 9 | **After approval** | Success page shows DID NFT serial, Account ID, features |
| 10 | Click "Enter App" | Sidebar appears, can navigate to Chat/Feed/Profile/Settings |

---

## Definition of Done

- [ ] Zustand auth store created with state management
- [ ] API client created with axios, JWT injection, token refresh
- [ ] Registration page: email/phone input, validation, OTP request
- [ ] OTP page: 6-digit input, auto-advance, countdown timer, resend button
- [ ] Wallet page: auto-creation, loading state, transaction details display
- [ ] KYC page:
  - [ ] Account type selector (individual/business)
  - [ ] Individual form: name, DOB, nationality, document
  - [ ] Business form: company name, registration, category
  - [ ] File upload for documents
  - [ ] Form validation
- [ ] KYC polling component: polls backend, shows pending/approved/rejected
- [ ] Success page: displays DID NFT serial, Account ID, features
- [ ] App layout: sidebar navigation with Chat/Feed/Profile/Settings
- [ ] All pages styled with Tailwind CSS, mobile-responsive
- [ ] All forms include:
  - [ ] Input validation
  - [ ] Error display
  - [ ] Loading states
  - [ ] Disabled buttons while loading
- [ ] Complete user flow works end-to-end:
  - [ ] Register → OTP → Wallet → KYC → Success → App
- [ ] Git commit: `"feat(P1-T13): implement frontend registration and onboarding UI"`

---

## Troubleshooting

**Problem:** OTP doesn't auto-advance at 6 digits
**Fix:** Check useEffect dependency array in OtpPage component, make sure handleSubmit is properly memoized

**Problem:** API calls fail with 401 Unauthorized
**Fix:** Make sure JWT tokens are being stored in Zustand store after OTP verification

**Problem:** Sidebar doesn't appear after login
**Fix:** Check that `/app/layout.tsx` is requiring authentication check

**Problem:** Forms don't submit
**Fix:** Make sure FormData is constructed correctly for multipart requests. Check API client header handling.

---

## Files Created in This Task

```
apps/web/src/
├── stores/
│   └── auth.store.ts
├── lib/
│   └── api.ts
├── components/
│   ├── sidebar.tsx
│   └── kyc-status-polling.tsx
└── app/
    ├── register/
    │   ├── page.tsx
    │   └── otp.tsx
    ├── onboarding/
    │   ├── wallet/
    │   │   └── page.tsx
    │   ├── kyc/
    │   │   └── page.tsx
    │   └── success/
    │       └── page.tsx
    └── app/
        ├── layout.tsx
        ├── chat/
        │   └── page.tsx
        ├── feed/
        │   └── page.tsx
        ├── profile/
        │   └── page.tsx
        └── settings/
            └── page.tsx
```

---

## What Happens Next

After this task is complete:
- **Phase 1 Complete** — Identity & Onboarding fully implemented
- **P2-T14** — Payments (can send HBAR between users)
- **P2-T15** — Messaging (can create conversations and send encrypted messages)
- **P2-T16** — Social Feed (can post, follow, like)

The platform is now ready for full user interaction with verified on-chain identities!
