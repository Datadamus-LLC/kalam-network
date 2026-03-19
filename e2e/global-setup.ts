/**
 * Playwright Global Setup — pre-creates all test users ONCE before the test suite.
 *
 * This prevents the /auth/register rate limit (5/minute/IP) from being hit
 * during `beforeAll` hooks when multiple test files each register new users.
 *
 * Created users are written to e2e/.test-users.json and read back by
 * registerUserViaApi() in helpers.ts during the test run.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const API_URL = 'http://localhost:3001/api/v1';
const TEST_OTP = '123123';
const CACHE_FILE = path.join(__dirname, '.test-users.json');
const RATE_LIMIT_DELAY_MS = 13_000; // 13s between registrations (stay under 5/min)

/** Prefixes for all test users needed by beforeAll hooks across test files */
const USER_PREFIXES = [
  'xcut',      // cross-cutting.spec.ts
  'discover',  // discover.spec.ts
  'feed',      // feed.spec.ts
  'msg1',      // messages.spec.ts
  'msg2',      // messages.spec.ts
  'nav',       // navigation.spec.ts
  'notif',     // notifications.spec.ts
  'pay',       // payments.spec.ts
  'profile1',  // profile.spec.ts
  'profile2',  // profile.spec.ts
  'settings',  // settings.spec.ts
];

interface TestUser {
  prefix: string;
  email: string;
  token: string;
  refreshToken: string;
  hederaAccountId: string;
}

async function registerUser(prefix: string): Promise<TestUser> {
  const id = Math.random().toString(36).substring(2, 8);
  const email = `gs-${prefix}-${id}@test.hedera.social`;

  // Register
  const regRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!regRes.ok) throw new Error(`[setup] Register failed for ${prefix}: ${regRes.status}`);

  // Verify OTP
  const verifyRes = await fetch(`${API_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: TEST_OTP }),
  });
  if (!verifyRes.ok) throw new Error(`[setup] OTP failed for ${prefix}: ${verifyRes.status}`);

  const verifyData = await verifyRes.json() as { data: { accessToken: string; refreshToken: string } };
  let token = verifyData.data.accessToken;
  let refreshToken = verifyData.data.refreshToken;
  let hederaAccountId = '';

  // Try wallet creation (non-fatal if it fails)
  try {
    const walletRes = await fetch(`${API_URL}/wallet/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (walletRes.ok) {
      const walletData = await walletRes.json() as {
        data: { accessToken: string; refreshToken: string; hederaAccountId: string };
      };
      token = walletData.data.accessToken;
      refreshToken = walletData.data.refreshToken;
      hederaAccountId = walletData.data.hederaAccountId ?? '';
    }
  } catch {
    // Non-fatal: wallet creation may fail if testnet has low HBAR
  }

  // Fallback: decode hederaAccountId from JWT
  if (!hederaAccountId) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
        const decoded = JSON.parse(payload) as Record<string, unknown>;
        hederaAccountId = (decoded.hederaAccountId as string) ?? '';
      }
    } catch {
      // ignore
    }
  }

  return { prefix, email, token, refreshToken, hederaAccountId };
}

export default async function globalSetup(): Promise<void> {
  console.log('\n[global-setup] Pre-creating test users...');

  // Check if dev servers are up
  try {
    const health = await fetch(`${API_URL.replace('/api/v1', '')}/health`);
    if (!health.ok) {
      console.warn('[global-setup] API health check failed — skipping user pre-creation');
      return;
    }
  } catch {
    console.warn('[global-setup] API unreachable — skipping user pre-creation');
    return;
  }

  const users: TestUser[] = [];

  for (let i = 0; i < USER_PREFIXES.length; i++) {
    const prefix = USER_PREFIXES[i];
    try {
      console.log(`[global-setup] Creating user ${i + 1}/${USER_PREFIXES.length}: ${prefix}`);
      const user = await registerUser(prefix);
      users.push(user);
      console.log(`[global-setup] ✓ ${prefix} → ${user.email} (${user.hederaAccountId || 'no wallet'})`);
    } catch (err) {
      console.error(`[global-setup] ✗ ${prefix}: ${(err as Error).message}`);
      // Non-fatal: tests will fall back to runtime registration
    }

    // Respect rate limit: pause between registrations (except after last)
    if (i < USER_PREFIXES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(users, null, 2));
  console.log(`[global-setup] Saved ${users.length} users to ${CACHE_FILE}`);

  // Wait for the rate limit window to reset so auth/onboarding tests can register freely
  console.log('[global-setup] Waiting 65s for rate limit window to reset...');
  await new Promise((resolve) => setTimeout(resolve, 65_000));
  console.log('[global-setup] Ready.\n');
}
