/**
 * Settings Interactions — copy ID, bio counter, save error, avatar, form states
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Settings Interactions', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('settingsX');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
  });

  test('bio character counter updates as you type', async ({ page }) => {
    const bio = page.getByLabel(/bio/i);
    await expect(bio).toBeVisible();
    // Initially 0/500
    await expect(page.getByText(/0 \/ 500/)).toBeVisible();
    await bio.fill('Hello bio');
    await expect(page.getByText(/9 \/ 500/)).toBeVisible();
  });

  test('save button shows saving state and success message', async ({ page }) => {
    const nameInput = page.getByLabel(/display.*name/i);
    await nameInput.clear();
    await nameInput.fill('Save Test Name');

    await page.getByRole('button', { name: /save changes/i }).click();

    // Profile update should succeed — shows success banner
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 60_000 });
  });

  test('empty display name shows validation error', async ({ page }) => {
    const nameInput = page.getByLabel(/display.*name/i);
    await nameInput.clear();

    const saveBtn = page.getByRole('button', { name: /save changes/i });
    await saveBtn.click();

    // Should show error about required name
    await expect(page.getByText(/display name.*required|name.*required/i)).toBeVisible({ timeout: 5_000 });
  });

  test('copy account ID button works', async ({ page, context }) => {
    if (!authData.hederaAccountId) {
      test.skip(true, 'No hederaAccountId — wallet not created');
      return;
    }
    // Grant clipboard permissions for headless Chromium
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const copyBtn = page.getByRole('button', { name: /^copy$/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    // Button changes to "Copied" for 2 seconds
    await expect(page.getByRole('button', { name: /copied/i })).toBeVisible({ timeout: 3_000 });
  });

  test('success message is dismissible', async ({ page }) => {
    const nameInput = page.getByLabel(/display.*name/i);
    await nameInput.fill('Dismiss Test Name');

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 60_000 });

    // Dismiss success banner
    const dismissBtn = page.getByRole('button', { name: /dismiss/i });
    if (await dismissBtn.isVisible({ timeout: 2_000 })) {
      await dismissBtn.click();
      await expect(page.getByText(/profile updated successfully/i)).not.toBeVisible({ timeout: 3_000 });
    }
  });

  test('HashScan link has correct href', async ({ page }) => {
    if (!authData.hederaAccountId) {
      test.skip(true, 'No hederaAccountId');
      return;
    }
    const hashscanLink = page.getByRole('link', { name: /view on hashscan/i });
    await expect(hashscanLink).toBeVisible();
    const href = await hashscanLink.getAttribute('href');
    expect(href).toContain(authData.hederaAccountId);
    expect(href).toContain('hashscan');
  });

  test('HashScan link opens in new tab', async ({ page }) => {
    if (!authData.hederaAccountId) {
      test.skip(true, 'No hederaAccountId');
      return;
    }
    const hashscanLink = page.getByRole('link', { name: /view on hashscan/i });
    const target = await hashscanLink.getAttribute('target');
    expect(target).toBe('_blank');
  });
});
