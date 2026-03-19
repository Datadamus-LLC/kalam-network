/**
 * Settings E2E Tests — Profile editor, account info, KYC status
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Settings', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('settings');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
  });

  test('shows settings page with profile form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /^settings$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows display name field', async ({ page }) => {
    const nameInput = page.getByLabel(/display.*name|name/i);
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
  });

  test('can update display name', async ({ page }) => {
    // Profile update requires completed wallet (server checks user status)
    if (!authData.hederaAccountId) {
      test.skip(true, 'No wallet created — profile update blocked (server requires active status)');
      return;
    }
    const nameInput = page.getByLabel(/display.*name|name/i);
    await expect(nameInput).toBeVisible({ timeout: 15_000 });
    await nameInput.fill('PW Test User');

    const saveBtn = page.getByRole('button', { name: /save|update/i });
    await saveBtn.click();

    // Should show success
    await expect(page.getByText(/saved|updated|success/i)).toBeVisible({ timeout: 60_000 });
  });

  test('shows Hedera account info', async ({ page }) => {
    // Use exact heading to avoid strict mode violation
    await expect(
      page.getByRole('heading', { name: 'Blockchain Account', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows Hedera account ID value', async ({ page }) => {
    // Only verifiable if wallet was created (hederaAccountId set)
    if (!authData.hederaAccountId) {
      test.skip(true, 'No hederaAccountId — wallet creation skipped (low HBAR)');
      return;
    }
    // Use the code element specifically — sidebar also shows the account ID
    await expect(page.getByRole('code')).toBeVisible({ timeout: 15_000 });
  });
});
