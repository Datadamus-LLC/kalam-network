/**
 * Shared helpers for Playwright E2E tests.
 * Provides authentication, user creation, and common utilities.
 */
import { type Page, expect } from '@playwright/test';

const API_URL = 'http://localhost:3001/api/v1';
const TEST_OTP = '123123';

/** Load pre-created test users from global setup cache (lazy require to avoid ESM issues) */
function loadCachedUsers(): Array<{
  prefix: string;
  email: string;
  token: string;
  refreshToken: string;
  hederaAccountId: string;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const cacheFile = path.join(__dirname, '.test-users.json');
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as Array<{
        prefix: string; email: string; token: string; refreshToken: string; hederaAccountId: string;
      }>;
    }
  } catch {
    // ignore — cache not available, fall back to live registration
  }
  return [];
}

/** Generate a unique test email for this run */
export function testEmail(prefix: string): string {
  const id = Math.random().toString(36).substring(2, 8);
  return `pw-${prefix}-${id}@test.hedera.social`;
}

/**
 * Register a new user via the UI.
 * Navigates through: /register → enter email → OTP → wallet → KYC → feed
 * Returns the email used.
 */
export async function registerUser(page: Page, email: string): Promise<void> {
  await page.goto('/register');

  // Fill email
  const emailInput = page.getByLabel(/email/i);
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);

  // Submit
  const continueBtn = page.getByRole('button', { name: /continue/i });
  await continueBtn.click();

  // OTP screen
  await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });

  // Find OTP inputs and fill them
  const otpInputs = page.locator('input[maxlength="1"], input[type="tel"]');
  const count = await otpInputs.count();

  if (count >= 6) {
    // Individual digit inputs
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(TEST_OTP[i]);
    }
  } else {
    // Single input field
    const singleInput = page.locator('input').filter({ hasNotText: email });
    const otpField = singleInput.first();
    await otpField.fill(TEST_OTP);
  }

  // Submit OTP — look for verify/submit button
  const verifyBtn = page.getByRole('button', { name: /verify|submit|confirm/i });
  if (await verifyBtn.isVisible()) {
    await verifyBtn.click();
  }

  // Wait for wallet creation page or auto-redirect
  await page.waitForURL(/onboarding\/wallet|onboarding\/kyc|feed/, { timeout: 30_000 });

  // If on wallet page, wait for creation to complete
  if (page.url().includes('onboarding/wallet')) {
    await page.waitForURL(/onboarding\/kyc|feed/, { timeout: 60_000 });
  }

  // If on KYC page, handle it
  if (page.url().includes('onboarding/kyc')) {
    // KYC is disabled (MIRSAD_KYC_ENABLED=false)
    // Either auto-skips or we need to fill form and submit
    // Wait a moment to see if it auto-redirects
    try {
      await page.waitForURL(/onboarding\/success|feed/, { timeout: 10_000 });
    } catch {
      // If it doesn't auto-redirect, there might be a skip button or form
      const skipBtn = page.getByRole('button', { name: /skip|continue|submit/i });
      if (await skipBtn.isVisible()) {
        await skipBtn.click();
        await page.waitForURL(/onboarding\/success|feed/, { timeout: 30_000 });
      }
    }
  }

  // If on success page, proceed
  if (page.url().includes('onboarding/success')) {
    const proceedBtn = page.getByRole('button', { name: /continue|go to feed|get started/i });
    if (await proceedBtn.isVisible()) {
      await proceedBtn.click();
    }
    await page.waitForURL(/feed/, { timeout: 15_000 });
  }
}

/**
 * Log in an existing user via the UI.
 */
export async function loginUser(page: Page, email: string): Promise<void> {
  await page.goto('/login');

  const emailInput = page.getByLabel(/email/i);
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);

  const signInBtn = page.getByRole('button', { name: /sign in/i });
  await signInBtn.click();

  // OTP screen
  await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });

  const otpInputs = page.locator('input[maxlength="1"], input[type="tel"]');
  const count = await otpInputs.count();

  if (count >= 6) {
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(TEST_OTP[i]);
    }
  } else {
    const singleInput = page.locator('input').filter({ hasNotText: email });
    await singleInput.first().fill(TEST_OTP);
  }

  const verifyBtn = page.getByRole('button', { name: /verify|submit|confirm/i });
  if (await verifyBtn.isVisible()) {
    await verifyBtn.click();
  }

  await page.waitForURL(/feed/, { timeout: 30_000 });
}

/**
 * Decode a JWT payload (base64url) to extract claims.
 * Works in both browser and Node environments.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = typeof window !== 'undefined'
      ? JSON.parse(atob(payload))
      : JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    return decoded;
  } catch {
    return {};
  }
}

/**
 * Get or create a test user via API.
 * Returns { email, token, refreshToken, hederaAccountId }.
 *
 * Uses a DETERMINISTIC email (e2e-{prefix}@test.hedera.social) so the same
 * user is reused across test runs — avoids hitting the rate limit on every run.
 *
 * - First run: registers a new account
 * - Subsequent runs: existing account → falls through to login (sends new OTP)
 * - Rate limiting (429): waits with exponential backoff
 */
export async function registerUserViaApi(prefix: string): Promise<{
  email: string;
  token: string;
  refreshToken: string;
  hederaAccountId: string;
}> {
  // Try cache first (populated by globalSetup)
  const cached = loadCachedUsers().find((u) => u.prefix === prefix);
  if (cached) {
    return cached;
  }

  // Deterministic email — same user across test runs
  const email = `e2e-${prefix}@test.hedera.social`;

  // Try register first; if 409 (user exists), fall through to login
  let regRes: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (regRes.status !== 429) break;
    // Rate limited — wait before retrying (15s, 30s, 65s)
    const waitMs = attempt === 0 ? 15_000 : attempt === 1 ? 30_000 : 65_000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // If registration failed (not 409 "already exists"), try login instead
  if (!regRes || (!regRes.ok && regRes.status !== 409)) {
    // Try login as fallback for persistent rate limit failures
    let loginRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (loginRes.status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
    if (!loginRes || !loginRes.ok) {
      throw new Error(`Register/Login failed: register=${regRes?.status}, login=${loginRes?.status}`);
    }
  } else if (regRes.status === 409) {
    // User already exists — send a new OTP via login
    for (let attempt = 0; attempt < 3; attempt++) {
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (loginRes.status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }

  // Verify OTP
  const verifyRes = await fetch(`${API_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: TEST_OTP }),
  });
  if (!verifyRes.ok) throw new Error(`Verify OTP failed: ${verifyRes.status}`);
  const verifyData = await verifyRes.json();
  let token = verifyData.data.accessToken;
  let refreshToken = verifyData.data.refreshToken;
  let hederaAccountId = '';

  // Check if user already has a wallet by decoding the JWT — avoid creating
  // a new Hedera account (and spending HBAR) on every test run.
  const existingClaims = decodeJwtPayload(token);
  const existingAccountId = (existingClaims.hederaAccountId as string) ?? '';

  if (existingAccountId) {
    // User already has a wallet — reuse it, no HBAR spent
    hederaAccountId = existingAccountId;
  } else {
    // First run for this user — create the wallet
    const walletRes = await fetch(`${API_URL}/wallet/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (walletRes.ok) {
      const walletData = await walletRes.json();
      token = walletData.data.accessToken;
      refreshToken = walletData.data.refreshToken;
      hederaAccountId = walletData.data.hederaAccountId ?? '';
    } else if (walletRes.status === 409) {
      // User already has a wallet — extract account ID from the 409 error message
      // e.g. "User X already has Hedera account 0.0.12345"
      const errBody = await walletRes.json().catch(() => ({})) as { error?: { message?: string } };
      const match = errBody?.error?.message?.match(/0\.\d+\.\d+/);
      if (match) {
        hederaAccountId = match[0];
      }
    }
    // Final fallback: decode JWT for hederaAccountId
    if (!hederaAccountId) {
      const claims = decodeJwtPayload(token);
      hederaAccountId = (claims.hederaAccountId as string) ?? '';
    }
  }

  return { email, token, refreshToken, hederaAccountId };
}

/**
 * Inject auth state into localStorage so the page thinks we're logged in.
 * Useful for skipping the UI login flow in non-auth tests.
 * Pass hederaAccountId so BalanceWidget and Settings page work correctly.
 */
export async function injectAuth(
  page: Page,
  token: string,
  refreshToken: string,
  email: string,
  hederaAccountId = '',
): Promise<void> {
  // Decode hederaAccountId from JWT if not provided
  let accountId = hederaAccountId;
  if (!accountId) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(atob(payload)) as Record<string, unknown>;
        accountId = (decoded.hederaAccountId as string) ?? '';
      }
    } catch {
      // ignore
    }
  }

  await page.goto('/');
  await page.evaluate(
    ({ token, refreshToken, email, accountId }) => {
      const state = {
        state: {
          token,
          refreshToken,
          isAuthenticated: true,
          user: {
            id: '',
            status: 'active',
            displayName: email.split('@')[0],
            accountType: 'individual' as const,
            hederaAccountId: accountId || null,
            kycLevel: null,
          },
          onboardingStep: 'success',
          registrationId: null,
          identifierType: 'email',
          identifier: email,
        },
        version: 0,
      };
      localStorage.setItem('hedera-social-auth', JSON.stringify(state));
    },
    { token, refreshToken, email, accountId },
  );
}

/**
 * Create a direct conversation between two users, or retrieve the existing one if it
 * already exists (409). Returns the hcsTopicId or null if creation failed.
 */
export async function getOrCreateConversation(
  token: string,
  participantAccountId: string,
): Promise<{ topicId: string; id: string } | null> {
  const API = 'http://localhost:3001/api/v1';

  const res = await fetch(`${API}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'direct', participantAccountIds: [participantAccountId] }),
  });

  if (res.ok) {
    const d = await res.json() as { data?: { id: string; hcsTopicId: string } };
    return d.data ? { topicId: d.data.hcsTopicId, id: d.data.id } : null;
  }

  // 429 = rate limited — try to find existing conversation in the list
  if (res.status === 429) {
    const listRes = await fetch(`${API}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return null;
    const ld = await listRes.json() as { data?: { data: Array<{ id: string; hcsTopicId: string; participants: Array<{ accountId: string }> }> } };
    const existing = ld.data?.data?.find(c =>
      c.participants.some(p => p.accountId === participantAccountId)
    );
    return existing ? { topicId: existing.hcsTopicId, id: existing.id } : null;
  }

  // 409 = conversation already exists — find it in the list
  if (res.status === 409) {
    const listRes = await fetch(`${API}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return null;
    const ld = await listRes.json() as { data?: { data: Array<{ id: string; hcsTopicId: string; participants: Array<{ accountId: string }> }> } };
    const existing = ld.data?.data?.find(c =>
      c.participants.some(p => p.accountId === participantAccountId)
    );
    return existing ? { topicId: existing.hcsTopicId, id: existing.id } : null;
  }

  return null;
}
