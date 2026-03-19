/**
 * Feed Interactions — character counter, refresh, error states, loading
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Feed Interactions', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('feedx');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
  });

  test('character counter decreases as you type', async ({ page }) => {
    const input = page.getByPlaceholder(/what.*happen/i);
    await expect(input).toBeVisible();
    // Initially shows 280
    await expect(page.getByText('280')).toBeVisible();
    // Type 10 characters
    await input.fill('0123456789');
    await expect(page.getByText('270')).toBeVisible();
  });

  test('post button is enabled after typing', async ({ page }) => {
    const input = page.getByPlaceholder(/what.*happen/i);
    const postBtn = page.getByRole('button', { name: /^post$/i });
    await expect(postBtn).toBeDisabled();
    await input.fill('Hello world');
    await expect(postBtn).toBeEnabled();
  });

  test('post button disabled when over 280 characters', async ({ page }) => {
    const input = page.getByPlaceholder(/what.*happen/i);
    await input.fill('x'.repeat(281));
    const postBtn = page.getByRole('button', { name: /^post$/i });
    await expect(postBtn).toBeDisabled();
    // Counter shows negative
    await expect(page.getByText('-1')).toBeVisible();
  });

  test('post input clears after successful post', async ({ page }) => {
    const input = page.getByPlaceholder(/what.*happen/i);
    await input.fill('Test post for clearing input');
    await page.getByRole('button', { name: /^post$/i }).click();
    // Input should clear after submission
    await expect(input).toHaveValue('', { timeout: 10_000 });
  });

  test('refresh button is visible and clickable', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh feed/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Page should still be on feed
    await expect(page).toHaveURL(/feed/);
  });

  test('feed shows empty state or posts', async ({ page }) => {
    // Either shows posts or an empty state message
    const hasContent = await page.locator('main').textContent();
    expect(hasContent).toBeTruthy();
    expect(hasContent!.length).toBeGreaterThan(10);
  });
});
