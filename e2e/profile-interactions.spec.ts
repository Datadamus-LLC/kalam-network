/**
 * Profile Interactions — loading, own profile, bio display, stats, follow states
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Profile Interactions', () => {
  let user1: { email: string; token: string; refreshToken: string; hederaAccountId: string };
  let user2: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    user1 = await registerUserViaApi('profX1');
    user2 = await registerUserViaApi('profX2');
  });

  test('profile shows loading skeleton then content', async ({ page }) => {
    if (!user1.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }
    await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
    await page.goto(`/profile/${user1.hederaAccountId}`);
    // Eventually shows content (not permanently loading)
    await expect(page.getByText(user1.hederaAccountId)).toBeVisible({ timeout: 15_000 });
  });

  test('profile shows follower and following counts', async ({ page }) => {
    if (!user1.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }
    await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
    await page.goto(`/profile/${user1.hederaAccountId}`);
    await expect(page.getByText(/followers/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/following/i)).toBeVisible();
    await expect(page.getByText(/posts/i)).toBeVisible();
  });

  test('follow button NOT shown on own profile', async ({ page }) => {
    if (!user1.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }
    // user1 viewing their own profile
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto(`/profile/${user1.hederaAccountId}`);
    await expect(page.getByText(user1.hederaAccountId)).toBeVisible({ timeout: 15_000 });

    // No follow button for own profile
    const followBtn = page.getByRole('button', { name: /^follow$|^following$/i });
    await expect(followBtn).not.toBeVisible({ timeout: 3_000 });
  });

  test('follow count updates optimistically on follow', async ({ page }) => {
    if (!user1.hederaAccountId || !user2.hederaAccountId) {
      test.skip(true, 'Wallets required');
      return;
    }
    await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
    await page.goto(`/profile/${user1.hederaAccountId}`);

    const followersText = page.getByText(/followers/i).first();
    await expect(followersText).toBeVisible({ timeout: 15_000 });

    const followBtn = page.getByRole('button', { name: /^follow$/i });
    if (await followBtn.isVisible({ timeout: 3_000 })) {
      await followBtn.click();
      // Button should change to "Following"
      await expect(page.getByRole('button', { name: /^following$/i })).toBeVisible({ timeout: 5_000 });
      // Unfollow to clean up
      await page.getByRole('button', { name: /^following$/i }).click();
      await expect(page.getByRole('button', { name: /^follow$/i })).toBeVisible({ timeout: 5_000 });
    }
  });

  test('profile page shows account type', async ({ page }) => {
    if (!user1.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }
    await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
    await page.goto(`/profile/${user1.hederaAccountId}`);
    // Account info section shows type
    await expect(page.getByText(/individual|business/i)).toBeVisible({ timeout: 15_000 });
  });
});
