/**
 * Phase 8 — Settings Page: Playwright E2E Tests
 *
 * Covers: 3-column layout, left nav with lemon active border, section switching,
 * Profile form (pill inputs), Appearance theme selector (pill group), Danger Zone
 * (red styling), right panel (Account Status + Payment Limits), multi-resolution.
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  authData = await registerUserViaApi('settings8');
});

// ── Page structure ─────────────────────────────────────────────────────────

test.describe('Settings page structure — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
    await page.waitForURL(/settings/, { timeout: 15_000 });
  });

  test('left nav is visible with section labels', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Settings navigation' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Appearance', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Danger Zone', exact: true })).toBeVisible();
  });

  test('"Profile" is active by default (lemon right border)', async ({ page }) => {
    const profileBtn = page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Profile', exact: true });
    // Active: has bg-white/[0.04] class
    const cls = await profileBtn.getAttribute('class');
    expect(cls).toContain('bg-white');
    // The lemon border span should exist inside
    const lemonSpan = profileBtn.locator('span.bg-\\[\\#f0d060\\]');
    await expect(lemonSpan).toBeVisible();
  });

  test('right panel shows Account Status', async ({ page }) => {
    await expect(page.getByText('Account Status')).toBeVisible();
  });

  test('right panel shows Payment Limits', async ({ page }) => {
    await expect(page.getByText('Payment Limits')).toBeVisible();
  });
});

// ── Left nav switching ─────────────────────────────────────────────────────

test.describe('Left nav section switching', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
    await page.waitForURL(/settings/);
  });

  test('clicking Account shows account section', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Account', exact: true }).click();
    // KYC Status row is always present regardless of wallet status
    await expect(page.getByText('KYC Status')).toBeVisible({ timeout: 3_000 });
  });

  test('clicking Appearance shows theme selector', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Appearance', exact: true }).click();
    await expect(page.getByText('Theme')).toBeVisible({ timeout: 3_000 });
    // Three theme pill buttons
    await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Light', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'System', exact: true })).toBeVisible();
  });

  test('clicking Danger Zone shows red section', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Danger Zone', exact: true }).click();
    // Danger zone heading should be visible
    await expect(page.getByRole('heading', { name: 'Danger Zone' })).toBeVisible({ timeout: 3_000 });
  });

  test('clicking Wallet shows wallet section', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Wallet & Encryption', exact: true }).click();
    // Either "Encryption Key" (wallet loaded) or "Loading wallet status" (no wallet) — both correct
    const hasEncKey = await page.getByText(/Encryption Key/i).isVisible({ timeout: 3_000 }).catch(() => false);
    const hasLoading = await page.getByText(/wallet status/i).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasEncKey || hasLoading).toBe(true);
  });
});

// ── Profile section ────────────────────────────────────────────────────────

test.describe('Profile section', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
    await page.waitForURL(/settings/);
  });

  test('Display Name input is pill-shaped', async ({ page }) => {
    const input = page.getByLabel('Display Name');
    await expect(input).toBeVisible();
    const cls = await input.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Bio textarea uses rounded-[14px] (not pill)', async ({ page }) => {
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    const cls = await textarea.getAttribute('class');
    expect(cls).toMatch(/rounded-\[14px\]/);
    expect(cls).not.toMatch(/rounded-full/);
  });

  test('Save Changes button is pill-shaped', async ({ page }) => {
    const saveBtn = page.getByRole('button', { name: /save changes/i });
    await expect(saveBtn).toBeVisible();
    const cls = await saveBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('no old bg-white card sections', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toContain('bg-gray-50');
    // Old code used bg-gradient-to-r from-blue-50 to-purple-50
    expect(html).not.toContain('from-blue-50');
  });
});

// ── Appearance theme selector ──────────────────────────────────────────────

test.describe('Appearance section', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
    await page.waitForURL(/settings/);
    // Navigate to Appearance section
    await page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Appearance', exact: true }).click();
  });

  test('theme pill buttons are rounded-full', async ({ page }) => {
    const darkBtn = page.getByRole('button', { name: 'Dark', exact: true });
    await expect(darkBtn).toBeVisible({ timeout: 3_000 });
    const cls = await darkBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('clicking Light activates Light theme pill', async ({ page }) => {
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(async () => {
      const cls = await page.getByRole('button', { name: 'Light', exact: true }).getAttribute('class');
      expect(cls).toMatch(/bg-white/);
    }).toPass({ timeout: 3_000 });
    // Restore dark theme
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
  });
});

// ── Danger Zone ────────────────────────────────────────────────────────────

test.describe('Danger Zone section', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/settings');
    await page.waitForURL(/settings/);
    await page.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name: 'Danger Zone', exact: true }).click();
  });

  test('danger buttons are red and pill-shaped', async ({ page }) => {
    const deactivateBtn = page.getByRole('button', { name: 'Deactivate', exact: true });
    await expect(deactivateBtn).toBeVisible({ timeout: 3_000 });
    const cls = await deactivateBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
    expect(cls).toContain('e0245e');
  });

  test('danger buttons are disabled (no endpoint yet)', async ({ page }) => {
    const deactivateBtn = page.getByRole('button', { name: 'Deactivate', exact: true });
    await expect(deactivateBtn).toBeDisabled({ timeout: 3_000 });
  });
});

// ── Multi-resolution screenshots ───────────────────────────────────────────

test.describe('Multi-resolution screenshots', () => {
  for (const vp of VIEWPORTS) {
    test(`settings renders at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/settings');
      await page.waitForURL(/settings/, { timeout: 15_000 });

      await expect(page.getByText('Save Changes')).toBeVisible({ timeout: 5_000 });

      await page.screenshot({
        path: `test-screenshots/phase8-settings-${vp.name}.png`,
        fullPage: false,
      });
    });
  }
});
