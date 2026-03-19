/**
 * Feed & Posts E2E Tests — Post creation, feed display, likes, comments
 * The pipeline agent should expand these tests based on .claude/skills/playwright-e2e/SKILL.md
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Feed & Posts', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('feed');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
  });

  test('shows feed page with post creation form', async ({ page }) => {
    await expect(page.getByPlaceholder(/what.*mind|what.*happen|write.*post|share/i)).toBeVisible({ timeout: 15_000 });
  });

  test('can create a post', async ({ page }) => {
    const postInput = page.getByPlaceholder(/what.*mind|what.*happen|write.*post|share/i);
    await expect(postInput).toBeVisible({ timeout: 15_000 });
    await postInput.fill('Hello from Playwright E2E test!');

    const postBtn = page.getByRole('button', { name: /post|publish|submit/i });
    await postBtn.click();

    // Post should appear in feed
    await expect(page.getByText('Hello from Playwright E2E test!')).toBeVisible({ timeout: 30_000 });
  });

  test('disables post button when empty', async ({ page }) => {
    const postBtn = page.getByRole('button', { name: /post|publish|submit/i });
    await expect(postBtn).toBeDisabled();
  });
});
