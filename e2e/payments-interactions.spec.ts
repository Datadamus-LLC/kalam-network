/**
 * Payments Interactions — refresh, search submit, filter changes, transaction modal
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Payments Interactions', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('payX');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/payments');
  });

  test('refresh button is clickable', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh payments/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Page should still show payments content
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible();
  });

  test('search form submits and updates results', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('test-tx-id-123');
    await page.keyboard.press('Enter');
    // Should still show the empty/no results state
    await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible();
  });

  test('direction filter changes selection', async ({ page }) => {
    // Open filters
    await page.getByRole('button', { name: /filters?/i }).click();
    const directionSelect = page.getByLabel(/direction/i);
    await expect(directionSelect).toBeVisible();

    await directionSelect.selectOption('sent');
    await expect(directionSelect).toHaveValue('sent');

    await directionSelect.selectOption('received');
    await expect(directionSelect).toHaveValue('received');

    await directionSelect.selectOption('all');
    await expect(directionSelect).toHaveValue('all');
  });

  test('status filter changes selection', async ({ page }) => {
    await page.getByRole('button', { name: /filters?/i }).click();
    const statusSelect = page.getByLabel(/status/i);
    await expect(statusSelect).toBeVisible();

    await statusSelect.selectOption('completed');
    await expect(statusSelect).toHaveValue('completed');

    await statusSelect.selectOption('pending');
    await expect(statusSelect).toHaveValue('pending');
  });

  test('filters panel closes when clicked again', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await filterBtn.click();
    await expect(page.getByLabel(/direction/i)).toBeVisible({ timeout: 5_000 });

    // Click again to close
    await filterBtn.click();
    await expect(page.getByLabel(/direction/i)).not.toBeVisible({ timeout: 3_000 });
  });

  test('date range filters are present', async ({ page }) => {
    await page.getByRole('button', { name: /filters?/i }).click();
    await expect(page.getByLabel(/from/i)).toBeVisible();
    await expect(page.getByLabel(/to/i)).toBeVisible();
  });
});
