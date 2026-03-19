/**
 * Authentication store — persisted to localStorage via Zustand persist.
 *
 * Tracks the full onboarding journey (register → OTP → wallet → KYC → success)
 * and keeps the JWT token pair so the API client can read them without
 * importing React hooks.
 *
 * SSR guard: all localStorage access is wrapped in typeof-window checks
 * so the store is safe to construct during Next.js server-side rendering.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Steps in the user-facing onboarding wizard.
 * 'kyc_polling' is a transient UI state (not a named step) used to show the
 * polling screen after KYC form submission.
 */
export type OnboardingStep =
  | 'idle'
  | 'register'
  | 'create_wallet'
  | 'submit_kyc'
  | 'kyc_polling'
  | 'success';

export interface AuthUser {
  id: string;
  hederaAccountId: string | null;
  status: string;
  accountType: 'individual' | 'business' | null;
  displayName: string | null;
  username: string | null;
  kycLevel: 'basic' | 'enhanced' | 'institutional' | null;
}

interface AuthState {
  // ── Persisted ──────────────────────────────────────────────────────────
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  onboardingStep: OnboardingStep;

  /** Opaque registration ID returned by POST /auth/register or /auth/login. */
  registrationId: string | null;
  registrationMethod: 'email' | 'phone' | null;
  registrationValue: string | null;

  /** Mirsad AI screening / request ID from KYC submission. */
  screeningId: string | null;

  // ── Ephemeral (not persisted) ──────────────────────────────────────────
  isLoading: boolean;
  error: string | null;

  // ── Actions ────────────────────────────────────────────────────────────
  setUser: (user: AuthUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setRegistrationInfo: (
    registrationId: string,
    method: 'email' | 'phone',
    value: string,
  ) => void;
  setScreeningId: (screeningId: string) => void;
  logout: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state snapshot (reused by logout / reset)
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  user: null as AuthUser | null,
  token: null as string | null,
  refreshToken: null as string | null,
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  onboardingStep: 'idle' as OnboardingStep,
  registrationId: null as string | null,
  registrationMethod: null as 'email' | 'phone' | null,
  registrationValue: null as string | null,
  screeningId: null as string | null,
};


// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({
          token: accessToken,
          refreshToken,
          isAuthenticated: true,
        }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      setOnboardingStep: (onboardingStep) => set({ onboardingStep }),

      setRegistrationInfo: (registrationId, registrationMethod, registrationValue) =>
        set({ registrationId, registrationMethod, registrationValue }),

      setScreeningId: (screeningId) => set({ screeningId }),

      logout: () => set({ ...INITIAL_STATE }),

      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'hedera-social-auth',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return localStorage;
      }),

      /**
       * Only persist the fields that must survive a page reload.
       * Ephemeral UI state (isLoading, error) is intentionally excluded.
       */
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        onboardingStep: state.onboardingStep,
        registrationId: state.registrationId,
        registrationMethod: state.registrationMethod,
        registrationValue: state.registrationValue,
        screeningId: state.screeningId,
      }),
    },
  ),
);
