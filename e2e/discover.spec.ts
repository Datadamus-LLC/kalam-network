/**
 * Discover & Search E2E Tests — User search, results, navigation
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Discover & Search', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('discover');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/discover');
  });

  test('shows discover page with search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/search|find/i)).toBeVisible({ timeout: 15_000 });
  });

  test('shows no results for nonsense query', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search|find/i);
    await searchInput.fill('zzzznonexistent12345');
    // Wait for debounced search
    await expect(page.getByText(/no.*result|not found|no.*user/i)).toBeVisible({ timeout: 10_000 });
  });
});
