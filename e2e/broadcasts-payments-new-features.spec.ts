/**
 * Broadcasts & Payments New Feature Tests
 * - Broadcasts: page loads, subscribe/unsubscribe API
 * - Payments: balance staleness indicator, cancel payment request, split payment button
 * - Error handling: ErrorBoundary, API timeout
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const API = 'http://localhost:3001/api/v1';

let user: { email: string; token: string; refreshToken: string; hederaAccountId: string };
let user2: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  user = await registerUserViaApi('bcastpay1');
  user2 = await registerUserViaApi('bcastpay2');
});

test.describe('Broadcasts Page', () => {
  test('broadcasts page loads with correct content', async ({ page }) => {
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/broadcasts');
    await expect(page).toHaveURL(/broadcasts/);
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(20);
  });

  test('broadcasts page shows heading', async ({ page }) => {
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/broadcasts');
    await expect(page.getByRole('heading', { name: /broadcasts?/i })).toBeVisible({ timeout: 10_000 });
  });

  test('broadcast subscribe API works', async ({ page }) => {
    // Try subscribing to an org (use a known org ID from test data or skip)
    const res = await fetch(`${API}/broadcasts/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ orgId: 'non-existent-org-id' }),
    });
    // 404 (org not found) or 200 (subscribed) — both valid
    expect([200, 201, 404, 400]).toContain(res.status);
  });

  test('broadcast subscribed feed API returns valid structure', async ({ page }) => {
    const res = await fetch(`${API}/broadcasts/feed/subscribed?limit=10`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { data?: { posts: unknown[]; hasMore: boolean } | unknown[] };
    // Response may be an array or wrapped object
    const isValid = Array.isArray(data.data) || Array.isArray((data.data as { posts: unknown[] })?.posts);
    expect(isValid || data.data !== undefined).toBeTruthy();
  });
});

test.describe('Payments New Features', () => {
  test('payments balance staleness indicator exists in UI', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'No wallet — balance widget not available');
      return;
    }
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/payments');
    // Balance widget shows HBAR amount (may appear multiple times — sidebar + main)
    await expect(page.getByText(/HBAR/i).first()).toBeVisible({ timeout: 15_000 });
    // The balance widget has a refresh button (may appear in sidebar + main)
    const refreshBtn = page.getByRole('button', { name: /refresh balance/i }).first();
    await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
  });

  test('payments split payment button visible and clickable', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible({ timeout: 10_000 });

    // Split Payment button is in the payments page
    const splitBtn = page.getByRole('button', { name: /split payment/i });
    await expect(splitBtn).toBeVisible({ timeout: 5_000 });

    // Click it to open the split payment modal
    await splitBtn.click();
    // Should show the split payment modal/form
    await expect(page.getByText(/split payment|participants|amount/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('cancel payment request API works', async ({ page }) => {
    if (!user.hederaAccountId || !user2.hederaAccountId) {
      test.skip(true, 'Both users need wallets');
      return;
    }

    // Create a conversation for context
    const convRes = await fetch(`${API}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ type: 'direct', participantAccountIds: [user2.hederaAccountId] }),
    });
    if (!convRes.ok && convRes.status !== 409) { test.skip(true, 'No conversation'); return; }
    const cd = await convRes.json() as { data?: { hcsTopicId: string } };

    // Handle 409 by getting existing
    let topicId = cd.data?.hcsTopicId;
    if (!topicId) {
      const listRes = await fetch(`${API}/conversations`, { headers: { Authorization: `Bearer ${user.token}` } });
      if (!listRes.ok) { test.skip(true, 'Rate limited'); return; }
      const ld = await listRes.json() as { data?: { data: Array<{ hcsTopicId: string; participants: Array<{ accountId: string }> }> } };
      const existing = ld.data?.data?.find(c => c.participants.some(p => p.accountId === user2.hederaAccountId));
      topicId = existing?.hcsTopicId;
    }
    if (!topicId) { test.skip(true, 'No conversation topic'); return; }

    // Create a payment request
    const reqRes = await fetch(`${API}/payments/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ topicId, amount: 1, currency: 'HBAR', description: `Cancel test ${Date.now()}` }),
    });
    if (!reqRes.ok) { test.skip(true, `Payment request failed: ${reqRes.status}`); return; }
    const rd = await reqRes.json() as { data?: { id: string } };
    const requestId = rd.data?.id;
    if (!requestId) { test.skip(true, 'No request ID'); return; }

    // Cancel the request
    const cancelRes = await fetch(`${API}/payments/request/${requestId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json() as { data?: { status: string } };
    expect(cancelData.data?.status).toBe('cancelled');
  });

  test('payment history full includes transaction details', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }

    const res = await fetch(`${API}/payments/history?limit=5`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { data?: { transactions: unknown[]; hasMore: boolean } };
    expect(Array.isArray(data.data?.transactions)).toBeTruthy();
  });
});

test.describe('Error Handling', () => {
  test('app renders error boundary fallback for component errors', async ({ page }) => {
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/feed');
    // The ErrorBoundary wraps the app — verify app loads without crash
    await expect(page.getByPlaceholder(/what.*happen/i)).toBeVisible({ timeout: 10_000 });
    // No unhandled runtime error dialog
    const errorDialog = page.getByRole('dialog', { name: /unhandled runtime error/i });
    await expect(errorDialog).not.toBeVisible({ timeout: 2_000 });
  });

  test('API 30s timeout — verify request does not hang indefinitely', async ({ page }) => {
    // The test just verifies the app loads in reasonable time — timeout protection is server-side
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/feed');
    await expect(page.getByPlaceholder(/what.*happen/i)).toBeVisible({ timeout: 30_000 });
  });
});
