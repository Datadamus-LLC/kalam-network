/**
 * Notifications E2E Tests — List, mark read, categories, bell badge
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Notifications', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('notif');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/notifications');
  });

  test('shows notifications heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible({ timeout: 15_000 });
  });

  test('shows empty state when no notifications', async ({ page }) => {
    await expect(
      page.getByText('No notifications yet'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows category filter tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /messages/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /payments/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /social/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /system/i })).toBeVisible();
  });

  test('category filter tabs are clickable', async ({ page }) => {
    const paymentsTab = page.getByRole('button', { name: /^payments$/i });
    await expect(paymentsTab).toBeVisible({ timeout: 15_000 });
    await paymentsTab.click();
    // The page heading "Notifications" is always visible
    await expect(page.getByRole('heading', { name: /^notifications$/i })).toBeVisible({ timeout: 10_000 });
  });
});
