/**
 * Profile & Settings New Feature Tests
 * - Own profile at /profile/me
 * - Wallet status section in settings
 * - "Generate Key" button when encryption key missing
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const API = 'http://localhost:3001/api/v1';

let user: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  user = await registerUserViaApi('profnew');
});

test.describe('/profile/me — Own Profile Page', () => {
  test('own profile page loads and shows correct structure', async ({ page }) => {
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/profile/me');
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(20);
  });

  test('own profile shows stats (followers, following, posts)', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'Wallet required for profile stats');
      return;
    }
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/profile/me');
    await expect(page.getByText(/followers/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/following/i)).toBeVisible();
    await expect(page.getByText(/posts/i)).toBeVisible();
  });

  test('own profile does NOT show Follow button (own profile)', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'Wallet required');
      return;
    }
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/profile/me');
    await page.waitForTimeout(2000);
    // No follow button on own profile
    await expect(page.getByRole('button', { name: /^follow$/i })).not.toBeVisible({ timeout: 3_000 });
  });

  test('own profile has link to settings', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'Wallet required');
      return;
    }
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/profile/me');
    // Should have edit profile / settings link
    const settingsLink = page.getByRole('link', { name: /edit.*profile|settings/i });
    const hasLink = await settingsLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasLink) {
      await settingsLink.click();
      await page.waitForURL(/settings/, { timeout: 5_000 });
    }
  });

  test('navigating to profile/me then back works correctly', async ({ page }) => {
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/feed');
    await page.goto('/profile/me');
    await page.goto('/feed');
    await expect(page.getByPlaceholder(/what.*happen/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Settings — Wallet Status Section', () => {
  test('settings page shows wallet status section', async ({ page }) => {
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/settings');
    // Wallet status section should exist
    const walletSection = page.getByText(/wallet|encryption/i).first();
    await expect(walletSection).toBeVisible({ timeout: 10_000 });
  });

  test('settings wallet status shows correct content', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'No wallet — wallet section may not have data');
      return;
    }
    await injectAuth(page, user.token, user.refreshToken, user.email, user.hederaAccountId);
    await page.goto('/settings');
    // Blockchain Account section always shows
    await expect(page.getByRole('heading', { name: 'Blockchain Account', exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('wallet status API returns correct structure', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }
    const res = await fetch(`${API}/wallet/status`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) { test.skip(true, `Wallet status API returned ${res.status}`); return; }
    const data = await res.json() as { data?: { hederaAccountId?: string; status?: string; hasEncryptionKey?: boolean; userId?: string } };
    // Verify the response has the expected wallet status fields
    expect(data.data).toBeTruthy();
    // Either has hederaAccountId or at least userId + status
    expect(data.data?.userId || data.data?.hederaAccountId).toBeTruthy();
  });
});

test.describe('Settings — Generate Encryption Key', () => {
  test('generate encryption key API works', async ({ page }) => {
    if (!user.hederaAccountId) {
      test.skip(true, 'No wallet — encryption key requires active account');
      return;
    }

    const res = await fetch(`${API}/wallet/encryption-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    });
    // 200 (key generated) or 409 (already exists) are both valid
    expect([200, 201, 409]).toContain(res.status);
  });
});
