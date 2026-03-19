/**
 * Redesign Smoke Tests — runs after every phase to verify no regressions.
 *
 * Tests core user flows at 3 resolutions:
 *   - mobile  375×812
 *   - tablet  768×1024
 *   - desktop 1280×800
 *
 * These tests use auth injection (no UI login flow) for speed.
 * Run this file after every redesign phase completes.
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
  authData = await registerUserViaApi('smoke');
});

for (const vp of VIEWPORTS) {
  test.describe(`Smoke — ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    });

    // ── Auth guard ──────────────────────────────────────────────────────────
    test('auth guard: unauthenticated → redirect to /', async ({ page }) => {
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await page.goto('/feed');
      await page.waitForURL('/', { timeout: 10_000 });
      await expect(page).toHaveURL('/');
    });

    // ── Feed page ───────────────────────────────────────────────────────────
    test('feed page loads', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/, { timeout: 15_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-feed-${vp.name}.png` });
    });

    // ── Discover page ───────────────────────────────────────────────────────
    test('navigate to discover page', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);

      if (vp.width >= 768) {
        await page.getByRole('navigation').getByRole('link', { name: 'Discover', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('link', { name: 'Discover', exact: true }).first().click();
      }
      await page.waitForURL(/discover/, { timeout: 10_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-discover-${vp.name}.png` });
    });

    // ── Notifications page ──────────────────────────────────────────────────
    test('navigate to notifications page', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);

      if (vp.width >= 768) {
        await page.getByRole('navigation').getByRole('link', { name: 'Notifications', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('link', { name: 'Notifications', exact: true }).first().click();
      }
      await page.waitForURL(/notifications/, { timeout: 10_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-notifications-${vp.name}.png` });
    });

    // ── Payments page ───────────────────────────────────────────────────────
    test('navigate to payments page', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);

      if (vp.width >= 768) {
        await page.getByRole('navigation').getByRole('link', { name: 'Payments', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('link', { name: 'Payments', exact: true }).first().click();
      }
      await page.waitForURL(/payments/, { timeout: 10_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-payments-${vp.name}.png` });
    });

    // ── Settings page ───────────────────────────────────────────────────────
    test('settings page loads via direct URL', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForURL(/settings/, { timeout: 10_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-settings-${vp.name}.png` });
    });

    // ── Messages page ───────────────────────────────────────────────────────
    test('messages page loads (collapsed rail on desktop)', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForURL(/messages/, { timeout: 10_000 });
      await expect(page.locator('main')).toBeVisible();
      await page.screenshot({ path: `test-screenshots/smoke-messages-${vp.name}.png` });
    });

    // ── Logout flow ─────────────────────────────────────────────────────────
    test('logout flow works', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/feed/);

      if (vp.width >= 768) {
        // Desktop/tablet: use user row dropdown
        const userRowBtn = page.getByRole('complementary').locator('button[type="button"]').last();
        await userRowBtn.click();
        await expect(page.getByRole('menuitem', { name: /log out/i })).toBeVisible({ timeout: 5_000 });
        await page.getByRole('menuitem', { name: /log out/i }).click();
      } else {
        // Mobile: use mobile menu
        await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('button', { name: /log out/i }).click();
      }

      await page.waitForURL('/', { timeout: 10_000 });
      await expect(page).toHaveURL('/');
    });
  });
}
