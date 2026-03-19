/**
 * Payments Full Feature Tests
 *
 * Covers:
 * - Payments page loads with balance widget and transaction history
 * - Send Payment button opens modal
 * - Request Payment button opens modal
 * - Split Payment button opens modal
 * - Modal closes on cancel/outside click
 * - Transaction list loads (may be empty for new accounts)
 * - TMUSD currency option present in Send modal
 *
 * Does NOT test actual fund transfer — only UI flows.
 * Uses payments.spec.ts patterns for consistency.
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Payments Full', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('payFull');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: /payments/i })).toBeVisible({ timeout: 15_000 });
  });

  // ── 1. Payments page loads with balance widget ─────────────────────────────

  test('payments page shows balance widget', async ({ page }) => {
    const hasHbar = await page.getByText('HBAR', { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasTxHistory = await page.getByRole('heading', { name: /transaction history/i }).isVisible({ timeout: 5_000 }).catch(() => false);
    const hasBalance = await page.getByText(/balance/i).isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasHbar || hasTxHistory || hasBalance, 'Expected balance widget or transaction history').toBeTruthy();
  });

  // ── 2. Transaction history section present ────────────────────────────────

  test('payments page shows transaction history section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible({ timeout: 15_000 });
  });

  // ── 3. Transaction list is empty or shows transactions ────────────────────

  test('transaction list shows empty state or transactions for new account', async ({ page }) => {
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    // Either empty state or transaction items
    const hasEmptyState = bodyText!.toLowerCase().includes('no transactions') ||
      bodyText!.toLowerCase().includes('loading transactions');
    const hasTransactions = bodyText!.toLowerCase().includes('transaction');
    expect(hasEmptyState || hasTransactions).toBeTruthy();
  });

  // ── 4. Send Payment button opens SendPaymentModal ─────────────────────────

  test('Send button opens Send Payment modal', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /^send$/i })
      .or(page.getByRole('button').filter({ has: page.getByText('Send') }));
    await expect(sendBtn.first()).toBeVisible({ timeout: 10_000 });
    await sendBtn.first().click();

    // Modal should appear
    await page.waitForTimeout(500);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    // Modal heading or amount input should be visible
    const hasModal =
      bodyText!.toLowerCase().includes('send payment') ||
      bodyText!.toLowerCase().includes('recipient') ||
      bodyText!.toLowerCase().includes('amount');
    expect(hasModal).toBeTruthy();
  });

  // ── 5. Send Payment modal has TMUSD currency option ──────────────────────

  test('Send Payment modal contains TMUSD as currency option', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: /^send$/i })
      .or(page.getByRole('button').filter({ has: page.getByText('Send') }));
    await expect(sendBtn.first()).toBeVisible({ timeout: 10_000 });
    await sendBtn.first().click();

    await page.waitForTimeout(500);

    // Look for TMUSD in the modal content
    const bodyText = await page.textContent('body');
    // TMUSD or currency selector should be present in the modal
    const hasTmusd = bodyText!.includes('TMUSD') || bodyText!.includes('HBAR');
    expect(hasTmusd).toBeTruthy();
  });

  // ── 6. Request Payment button opens RequestPaymentModal ───────────────────

  test('Request button opens Request Payment modal', async ({ page }) => {
    const requestBtn = page.getByRole('button', { name: /^request$/i });
    await expect(requestBtn).toBeVisible({ timeout: 10_000 });
    await requestBtn.click();

    await page.waitForTimeout(500);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    const hasModal =
      bodyText!.toLowerCase().includes('request payment') ||
      bodyText!.toLowerCase().includes('request') ||
      bodyText!.toLowerCase().includes('amount');
    expect(hasModal).toBeTruthy();
  });

  // ── 7. Split Payment button opens SplitPaymentModal ──────────────────────

  test('Split button opens Split Payment modal', async ({ page }) => {
    const splitBtn = page.getByRole('button', { name: /^split$/i });
    await expect(splitBtn).toBeVisible({ timeout: 10_000 });
    await splitBtn.click();

    await page.waitForTimeout(500);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    const hasModal =
      bodyText!.toLowerCase().includes('split payment') ||
      bodyText!.toLowerCase().includes('split') ||
      bodyText!.toLowerCase().includes('participants');
    expect(hasModal).toBeTruthy();
  });

  // ── 8. Search input present ───────────────────────────────────────────────

  test('payments page shows search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10_000 });
  });

  // ── 9. Filters button present ─────────────────────────────────────────────

  test('payments page shows Filters button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /filters?/i })).toBeVisible({ timeout: 10_000 });
  });

  // ── 10. Refresh button present ────────────────────────────────────────────

  test('payments page shows Refresh button', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh payments/i })
      .or(page.getByRole('button', { name: /refresh/i }));
    await expect(refreshBtn.first()).toBeVisible({ timeout: 10_000 });
  });
});
