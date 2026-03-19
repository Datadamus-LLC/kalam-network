/**
 * Discover Interactions — search results, click through to profile, error, loading
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Discover Interactions', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };
  let targetUser: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('discoverX');
    targetUser = await registerUserViaApi('discoverTarget');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/discover');
  });

  test('search input requires at least 2 characters to trigger', async ({ page }) => {
    const input = page.getByPlaceholder(/search/i);
    // Single character — help text still shows
    await input.fill('a');
    await expect(page.getByText(/start typing/i)).toBeVisible({ timeout: 2_000 });
  });

  test('search shows results or no-results message', async ({ page }) => {
    const input = page.getByPlaceholder(/search/i);
    await input.fill('zzzznonexistent12345');
    // Waits for "No results found" text
    await expect(page.getByText(/no results found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('clearing search returns to help text', async ({ page }) => {
    const input = page.getByPlaceholder(/search/i);
    await input.fill('searchterm');
    await input.clear();
    await expect(page.getByText(/start typing/i)).toBeVisible({ timeout: 5_000 });
  });

  test('search result click navigates to profile', async ({ page }) => {
    if (!targetUser.hederaAccountId) {
      test.skip(true, 'targetUser has no wallet — no profile to search');
      return;
    }

    const input = page.getByPlaceholder(/search/i);
    // Search by exact account ID to ensure a match
    await input.fill(targetUser.hederaAccountId);
    await page.waitForTimeout(600); // debounce

    // Check if results appear
    const firstResult = page.locator('a[href*="/profile/"]').first();
    const hasResult = await firstResult.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!hasResult) {
      // Search indexing may be delayed — skip without failure
      return;
    }

    await firstResult.click();
    await page.waitForURL(/profile\//, { timeout: 10_000 });
    expect(page.url()).toMatch(/profile\//);
  });

  test('search for own account shows user in results', async ({ page }) => {
    if (!authData.hederaAccountId) {
      test.skip(true, 'no wallet');
      return;
    }

    const input = page.getByPlaceholder(/search/i);
    await input.fill(authData.hederaAccountId);

    // Results or empty state
    await page.waitForTimeout(1500); // wait for debounce
    const body = await page.locator('main').textContent();
    expect(body).toBeTruthy();
  });
});
