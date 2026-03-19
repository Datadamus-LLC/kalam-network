/**
 * Profile E2E Tests — Own profile, other user profiles, follow/unfollow
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Profile Pages', () => {
  let user1: { email: string; token: string; refreshToken: string; hederaAccountId: string };
  let user2: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    user1 = await registerUserViaApi('profile1');
    user2 = await registerUserViaApi('profile2');
  });

  test.describe('Settings / Own Profile', () => {
    test.beforeEach(async ({ page }) => {
      await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
      await page.goto('/settings');
    });

    test('shows settings page', async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: /^settings$/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('shows display name field', async ({ page }) => {
      const nameInput = page.getByLabel(/display.*name|name/i);
      await expect(nameInput).toBeVisible({ timeout: 15_000 });
    });

    test('can update display name', async ({ page }) => {
      // Profile update requires completed wallet (user status must be 'active' on server)
      if (!user1.hederaAccountId) {
        test.skip(true, 'No wallet created — profile update blocked (server requires active status)');
        return;
      }
      const nameInput = page.getByLabel(/display.*name|name/i);
      await expect(nameInput).toBeVisible({ timeout: 15_000 });
      await nameInput.clear();
      await nameInput.fill('PW Profile Test User');

      const saveBtn = page.getByRole('button', { name: /save|update/i });
      await saveBtn.click();

      await expect(page.getByText(/saved|updated|success/i)).toBeVisible({ timeout: 60_000 });
    });

    test('shows Hedera account ID label', async ({ page }) => {
      // Use exact heading match to avoid strict mode violation
      await expect(
        page.getByRole('heading', { name: 'Blockchain Account', exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('shows actual Hedera account ID value', async ({ page }) => {
      // Only verifiable if wallet was created (hederaAccountId set)
      if (!user1.hederaAccountId) {
        test.skip(true, 'No hederaAccountId — wallet creation skipped (low HBAR)');
        return;
      }
      // Use the code element specifically — sidebar also shows the account ID
      await expect(page.getByRole('code')).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Other User Profile', () => {
    test('shows profile page for valid account ID', async ({ page }) => {
      const accountId = user1.hederaAccountId;
      if (!accountId) {
        test.skip(true, 'No account ID available for user1');
        return;
      }

      await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
      await page.goto(`/profile/${accountId}`);

      await expect(
        page.getByText(accountId),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('shows follow button on other user profile', async ({ page }) => {
      const accountId = user1.hederaAccountId;
      if (!accountId) {
        test.skip(true, 'No account ID — wallet not created');
        return;
      }

      await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
      await page.goto(`/profile/${accountId}`);

      // Follow button visible for other users' profiles
      const followBtn = page.getByRole('button', { name: /^follow$|^following$/i });
      await expect(followBtn).toBeVisible({ timeout: 15_000 });
    });

    test('can follow and unfollow a user', async ({ page }) => {
      const accountId = user1.hederaAccountId;
      if (!accountId) {
        test.skip(true, 'No account ID — wallet not created');
        return;
      }

      await injectAuth(page, user2.token, user2.refreshToken, user2.email, user2.hederaAccountId);
      await page.goto(`/profile/${accountId}`);

      // Click Follow
      const followBtn = page.getByRole('button', { name: /^follow$/i });
      await expect(followBtn).toBeVisible({ timeout: 15_000 });
      await followBtn.click();

      // Button should now show "Following"
      await expect(page.getByRole('button', { name: /^following$/i })).toBeVisible({ timeout: 5_000 });

      // Click to unfollow
      await page.getByRole('button', { name: /^following$/i }).click();
      await expect(page.getByRole('button', { name: /^follow$/i })).toBeVisible({ timeout: 5_000 });
    });

    test('shows 404 or error for invalid account ID', async ({ page }) => {
      await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
      await page.goto('/profile/0.0.9999999999');

      await expect(
        page.getByText(/not found|error|no.*user|invalid/i),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});
