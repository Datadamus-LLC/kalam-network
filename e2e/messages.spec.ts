/**
 * Messages & Chat E2E Tests — Conversations, messaging, real-time
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Messages & Chat', () => {
  let user1: { email: string; token: string; refreshToken: string; hederaAccountId: string };
  let user2: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    user1 = await registerUserViaApi('msg1');
    user2 = await registerUserViaApi('msg2');
  });

  test('shows messages page', async ({ page }) => {
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');
    // Should show the Messages heading
    await expect(
      page.getByRole('heading', { name: /^messages$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shows new conversation button', async ({ page }) => {
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');
    const newBtn = page.getByRole('button', { name: /new|create|start/i });
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
  });

  test('messages page loads with New Conversation button and content', async ({ page }) => {
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');
    await page.waitForTimeout(2000);

    // Page MUST show the Messages heading — verifies the page loaded correctly
    await expect(page.getByRole('heading', { name: /^messages$/i })).toBeVisible({ timeout: 10_000 });
    // New Conversation button must be there
    await expect(page.getByRole('button', { name: /new conversation/i })).toBeVisible();
    // Main content is non-empty (either empty state text or conversation list)
    const mainText = await page.locator('main').textContent().catch(() => '');
    expect(mainText!.length).toBeGreaterThan(10);
  });

  test('can open new conversation dialog', async ({ page }) => {
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');
    const newBtn = page.getByRole('button', { name: /new conversation|new|create|start/i });
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
    await newBtn.click();
    // Dialog should open with heading
    await expect(
      page.getByRole('heading', { name: /new conversation/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
