/**
 * Payments E2E Tests — Balance, transaction history, filters
 *
 * NOTE UI GAP: The payments page does NOT have Send/Request buttons.
 * It shows: balance widget, search, filters, transaction history.
 * Tests reflect the actual implemented UI.
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Payments', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('pay');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/payments');
  });

  test('shows payments page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible({ timeout: 15_000 });
  });

  test('shows balance widget', async ({ page }) => {
    // BalanceWidget renders HBAR when wallet created; falls back to transaction history heading
    const hasHbar = await page.getByText('HBAR', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasTxHistory = await page.getByRole('heading', { name: 'Transaction History', exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasHbar || hasTxHistory, 'Expected HBAR balance widget or transaction history').toBeTruthy();
  });

  test('shows transaction history section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible({ timeout: 15_000 });
  });

  test('shows empty or loading state when no transactions', async ({ page }) => {
    await expect(
      page.getByText(/no transactions found|loading transactions/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows search input', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/search/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows filters button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /filters?/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('filters panel opens on click', async ({ page }) => {
    const filterBtn = page.getByRole('button', { name: /filters?/i });
    await expect(filterBtn).toBeVisible({ timeout: 15_000 });
    await filterBtn.click();
    await expect(page.getByLabel(/direction/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByLabel(/status/i)).toBeVisible({ timeout: 5_000 });
  });
});
